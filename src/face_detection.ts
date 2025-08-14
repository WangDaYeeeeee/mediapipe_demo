import { FaceLandmarker, FilesetResolver, Matrix, NormalizedLandmark } from "@mediapipe/tasks-vision";

export interface SingleFaceLandmarkerResult {
  /** Detected face landmarks in normalized image coordinates. */
  readonly faceLandmarks: NormalizedLandmark[];
  /** Optional face blendshapes results. */
  readonly faceBlendshapes: Map<string, number>;
  /** Optional facial transformation matrix. */
  readonly facialTransformationMatrixes: Matrix;
}

interface Size {
  readonly width: number;
  readonly height: number;
}

interface ExpectedFaceFeatures {
  readonly validWidth: {
    readonly min: number;
    readonly max: number;
  };
  readonly validArea: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
}

export class FaceDetector {

  private readonly faceLandmarker: FaceLandmarker;
  private readonly expectedFaceFeatures: ExpectedFaceFeatures;

  public static async create(expectedFaceFeatures: ExpectedFaceFeatures): Promise<FaceDetector> {
    const filesetResolver = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    const faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: "GPU"
      },
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      runningMode: "VIDEO",
      numFaces: 1
    });
    return new FaceDetector(faceLandmarker, expectedFaceFeatures);
  }

  constructor(faceLandmarker: FaceLandmarker, expectedFaceFeatures: ExpectedFaceFeatures) {
    this.faceLandmarker = faceLandmarker;
    this.expectedFaceFeatures = expectedFaceFeatures;
  }

  public detect(video: HTMLVideoElement): SingleFaceLandmarkerResult | string {
    const faceLandmarker = this.faceLandmarker;
    if (!faceLandmarker) {
      return '人脸核验初始化失败';
    }

    const startTimeMs = performance.now();
    const videoSize = { width: video.videoWidth, height: video.videoHeight };
    const results = faceLandmarker.detectForVideo(video, startTimeMs);
    if (results.faceLandmarks.length === 0) {
      return '未检测到人脸';
    }
    if (results.faceLandmarks.length > 1) {
      return '检测到多张人脸';
    }

    const blendshapesMap: Map<string, number> = results.faceBlendshapes[0].categories.reduce(
      (prev, current) => prev.set(current.displayName || current.categoryName, current.score), new Map());
    const result = {
      faceLandmarks: results.faceLandmarks[0],
      faceBlendshapes: blendshapesMap,
      facialTransformationMatrixes: results.facialTransformationMatrixes[0]
    };
    // this.drawFaceLandmarks(result);

    const validation = this.validateFace(result, videoSize);
    return !!validation ? validation : result;
  }

  // private drawFaceLandmarks(singleResult: SingleFaceLandmarkerResult): void {
  //   if (this.configs?.drawFaceLandmarks !== true) {
  //     return;
  //   }
  //   try {
  //     // 绘制脸部轮廓
  //     this.drawingUtils?.drawConnectors(
  //       singleResult.faceLandmarks,
  //       FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
  //       { color: "#00ff00", lineWidth: 2 }
  //     );
      
  //     // 绘制眼睛
  //     this.drawingUtils?.drawConnectors(
  //       singleResult.faceLandmarks,
  //       FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
  //       { color: "#30ff30", lineWidth: 2 }
  //     );
      
  //     this.drawingUtils?.drawConnectors(
  //       singleResult.faceLandmarks,
  //       FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
  //       { color: "#30ff30", lineWidth: 2 }
  //     );
      
  //     // 绘制嘴唇
  //     this.drawingUtils?.drawConnectors(
  //       singleResult.faceLandmarks,
  //       FaceLandmarker.FACE_LANDMARKS_LIPS,
  //       { color: "#ff3030", lineWidth: 2 }
  //     );
  //   } catch (error) {
  //     console.error('绘制人脸特征点时发生错误:', error);
  //     // 绘制错误不影响主要功能，继续执行
  //   }
  // }

  // private drawPositionGuide(videoSize: Size, extra: {
  //   faceCenter: { x: number, y: number },
  //   faceCentered: boolean
  // }): void {
  //   const ctx = this.ctx;
  //   if (!ctx) {
  //     return;
  //   }

  //   try {
  //     const centerX = size.width / 2;
  //     const centerY = size.height / 2;
      
  //     // 绘制人脸中心点
  //     ctx.fillStyle = extra.faceCentered ? '#00ff00' : '#ff0000';
  //     ctx.beginPath();
  //     ctx.arc(extra.faceCenter.x, extra.faceCenter.y, 5, 0, 2 * Math.PI);
  //     ctx.fill();
      
  //     // 绘制从人脸中心到目标中心的连线
  //     ctx.strokeStyle = extra.faceCentered ? '#00ff00' : '#ff0000';
  //     ctx.lineWidth = 2;
  //     ctx.beginPath();
  //     ctx.moveTo(extra.faceCenter.x, extra.faceCenter.y);
  //     ctx.lineTo(centerX, centerY);
  //     ctx.stroke();
  //   } catch (error) {
  //     console.error('绘制位置指导时发生错误:', error);
  //   }
  // }

  private validateFace(singleResult: SingleFaceLandmarkerResult, videoSize: Size): string | undefined {
    let validation: string | undefined;

    // 检查人脸朝向
    validation = this.validateFaceOrientation(singleResult);
    if (!!validation) {
      return validation;
    }

    // 检查人脸位置
    validation = this.validateFacePosition(singleResult, videoSize);
    if (!!validation) {
      return validation;
    }

    return undefined;
  }

  private validateFaceOrientation(singleResult: SingleFaceLandmarkerResult): string | undefined {
    if (!singleResult.facialTransformationMatrixes) {
      console.error('`facialTransformationMatrixes` is undefined, check `outputFacialTransformationMatrixes` is true');
      return undefined;
    }
    
    // 使用MediaPipe的面部变换矩阵计算3D朝向
    const matrix = singleResult.facialTransformationMatrixes;
      
    // 从变换矩阵中提取欧拉角
    // MediaPipe的变换矩阵是4x4的，包含旋转信息
    const rotationMatrix = [
      [matrix.data[0], matrix.data[1], matrix.data[2]],
      [matrix.data[4], matrix.data[5], matrix.data[6]],
      [matrix.data[8], matrix.data[9], matrix.data[10]]
    ];
    
    const faceUpOrDown = Math.atan2(rotationMatrix[2][1], rotationMatrix[2][2]) * 180 / Math.PI;
    const faceTurnLeftOrRight = Math.asin(-rotationMatrix[2][0]) * 180 / Math.PI;
    const faceTilt = Math.atan2(rotationMatrix[1][0], rotationMatrix[0][0]) * 180 / Math.PI;

    const threshold = 15; // 阈值

    // 检查三个角度是否都在阈值范围内
    const isFaceUpOrDown = Math.abs(faceUpOrDown) > threshold;
    const isFaceTurnLeftOrRight = Math.abs(faceTurnLeftOrRight) > threshold;
    const isFaceTilt = Math.abs(faceTilt) > threshold;
    if (!isFaceUpOrDown && !isFaceTurnLeftOrRight && !isFaceTilt) {
      return undefined;
    }

    const array: string[] = [];
    if (faceUpOrDown > threshold) {
      array.push('低头');
    }
    if (faceUpOrDown < -threshold) {
      array.push('抬头');
    }
    if (Math.abs(faceTurnLeftOrRight) > threshold) {
      array.push('正对镜头');
    }
    if (Math.abs(faceTilt) > threshold) {
      array.push('不要歪头');
    }
    return '⚠️ 请您' + array.join('、');
  }

  private validateFacePosition(singleResult: SingleFaceLandmarkerResult, videoSize: Size): string | undefined {
    // 使用脸部轮廓的边界框计算人脸位置
    const faceOval = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const conn of faceOval) {
      const point = singleResult.faceLandmarks[conn.start];
      const x = point.x * videoSize.width;
      const y = point.y * videoSize.height;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    // 检查人脸大小是否在合适范围内
    const width = maxX - minX;
    // const height = maxY - minY;
    if (width < this.expectedFaceFeatures.validWidth.min) {
      return '⚠️ 请靠近一点';
    }
    if (width > this.expectedFaceFeatures.validWidth.max) {
      return '⚠️ 请离远一些';
    }

    // 检查人脸位置是否在合适范围内
    if (minX < this.expectedFaceFeatures.validArea.minX) {
      return '⚠️ 请靠右一点';
    }
    if (maxX > this.expectedFaceFeatures.validArea.maxX) {
      return '⚠️ 请靠左一点';
    }
    if (minY < this.expectedFaceFeatures.validArea.minY) { 
      return '⚠️ 请往下一点';
    }
    if (maxY > this.expectedFaceFeatures.validArea.maxY) {
      return '⚠️ ';
    }
    return undefined;
  }

  public detectBlink(singleResult: SingleFaceLandmarkerResult): boolean {
    const leftEyeBlinkScore = singleResult.faceBlendshapes.get('eyeBlinkLeft') ?? 0;
    const rightEyeBlinkScore = singleResult.faceBlendshapes.get('eyeBlinkRight') ?? 0;
    const blinkThreshold = 0.6;
    return leftEyeBlinkScore > blinkThreshold && rightEyeBlinkScore > blinkThreshold
  }

  public detectMouthOpen(singleResult: SingleFaceLandmarkerResult): boolean {
    const mouthOpenScroe = singleResult.faceBlendshapes.get('jawOpen') ?? 0;
    const mouthOpenThreshold = 0.6;
    return mouthOpenScroe > mouthOpenThreshold;
  }

  public detectMouthCenter(singleResult: SingleFaceLandmarkerResult, videoSize: Size): { x: number, y: number } {
    const mouthOval = FaceLandmarker.FACE_LANDMARKS_LIPS;
    const sum: {x: number, y: number} = mouthOval.reduce((prev, current) => {
      const point = singleResult.faceLandmarks[current.start];
      return { 
        x: prev.x + point.x * videoSize.width, 
        y: prev.y + point.y * videoSize.height,
      }
    }, { x: 0, y: 0 });
    return {
      x: sum.x / mouthOval.length,
      y: sum.y / mouthOval.length,
    };
  }
}