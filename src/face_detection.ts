import { FaceLandmarker, FilesetResolver, Matrix, NormalizedLandmark } from "@mediapipe/tasks-vision";

export interface FaceDetectionResult {
  face?: SingleFaceLandmarkerResult | undefined;
  message?: string | undefined;
}

export interface SingleFaceLandmarkerResult {
  /** Detected face landmarks in normalized image coordinates. */
  readonly faceLandmarks: NormalizedLandmark[];
  /** Optional face blendshapes results. */
  readonly faceBlendshapes: Map<string, number>;
  /** Optional facial transformation matrix. */
  readonly facialTransformationMatrixes: Matrix;
}

interface Configs {
  readonly videoSize: {
    readonly width: number;
    readonly height: number;
  };
  readonly validFaceWidth: {
    readonly min: number;
    readonly max: number;
  };
  readonly validMargins: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  };
  readonly faceRatio: {
    readonly width: number;
    readonly height: number;
  };
}

export class FaceDetector {

  private readonly faceLandmarker: FaceLandmarker;
  private readonly configs: Configs;

  public static async create(configs: Configs): Promise<FaceDetector> {
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
    return new FaceDetector(faceLandmarker, configs);
  }

  constructor(faceLandmarker: FaceLandmarker, configs: Configs) {
    this.faceLandmarker = faceLandmarker;
    this.configs = configs;
  }

  public detect(video: HTMLVideoElement): FaceDetectionResult {
    const faceLandmarker = this.faceLandmarker;
    if (!faceLandmarker) {
      return { message: '❌ 人脸核验初始化失败' };
    }

    const startTimeMs = performance.now();
    const results = faceLandmarker.detectForVideo(video, startTimeMs);
    if (results.faceLandmarks.length === 0) {
      return { message: '❗️ 未检测到人脸' };
    }
    if (results.faceLandmarks.length > 1) {
      return { message: '❗️ 检测到多张人脸' };
    }

    const blendshapesMap: Map<string, number> = results.faceBlendshapes[0].categories.reduce(
      (prev, current) => prev.set(current.displayName || current.categoryName, current.score), new Map());
    const face = {
      faceLandmarks: results.faceLandmarks[0],
      faceBlendshapes: blendshapesMap,
      facialTransformationMatrixes: results.facialTransformationMatrixes[0]
    };
    // this.drawFaceLandmarks(result);

    const message = this.validateFace(face);
    return { face, message };
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

  private validateFace(singleResult: SingleFaceLandmarkerResult): string | undefined {
    let validation: string | undefined;

    // 检查人脸朝向
    validation = this.validateFaceOrientation(singleResult);
    if (!!validation) {
      return validation;
    }

    // 检查人脸位置
    validation = this.validateFacePosition(singleResult);
    if (!!validation) {
      return validation;
    }

    return undefined;
  }

  private validateFaceOrientation(singleResult: SingleFaceLandmarkerResult): string | undefined {
    return undefined;
    
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
    return '⚠️ 请' + array.join('、');
  }

  private validateFacePosition(singleResult: SingleFaceLandmarkerResult): string | undefined {
    return undefined;
    
    const faceArea = this.detectFaceArea(singleResult);

    if (faceArea.faceWidth < this.configs.validFaceWidth.min) {
      return '⚠️ 请靠近一点';
    }
    if (faceArea.faceWidth > this.configs.validFaceWidth.max) {
      return '⚠️ 请离远一些';
    }

    // 检查人脸位置是否在合适范围内
    if (faceArea.minX < this.configs.validMargins.left) {
      return '⚠️ 请靠左一点';
    }
    if (this.configs.videoSize.width - faceArea.maxX < this.configs.validMargins.right) {
      return '⚠️ 请靠右一点';
    }
    // if (faceArea.minY < this.configs.validMargins.top) {
    //   return '⚠️ 请往下一点';
    // }
    // if (this.configs.videoSize.height - faceArea.maxY < this.configs.validMargins.bottom) {
    //   return '⚠️ 请往上一点';
    // }
    return undefined;
  }

  public detectBlink(singleResult: SingleFaceLandmarkerResult): boolean {
    const leftEyeBlinkScore = singleResult.faceBlendshapes.get('eyeBlinkLeft') ?? 0;
    const rightEyeBlinkScore = singleResult.faceBlendshapes.get('eyeBlinkRight') ?? 0;
    return leftEyeBlinkScore > 0.5 && rightEyeBlinkScore > 0.5;
  }

  public detectMouthOpen(singleResult: SingleFaceLandmarkerResult): boolean {
    const mouthOpenScroe = singleResult.faceBlendshapes.get('jawOpen') ?? 0;
    return mouthOpenScroe > 0.4;
  }

  public detectMouthClose(singleResult: SingleFaceLandmarkerResult): boolean {
    const jawOpen = singleResult.faceBlendshapes.get('jawOpen') ?? 0;
    return jawOpen < 0.1
  }

  public detectFaceArea(singleResult: SingleFaceLandmarkerResult): { 
    minX: number, 
    minY: number, 
    maxX: number, 
    maxY: number,
    faceWidth: number,
    faceHeight: number,
  } {
    // 获取脸部轮廓点
    const faceLandmarks = singleResult.faceLandmarks;
    const faceOval = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;

    // 计算脸部边界框
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const conn of faceOval) {
      const point = faceLandmarks[conn.start];
      const x = point.x * this.configs.videoSize.width;
      const y = point.y * this.configs.videoSize.height;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    minX = Math.max(0, minX - 20);
    maxX = Math.min(this.configs.videoSize.width, maxX + 20);
    maxY = Math.min(this.configs.videoSize.height, maxY + 10);

    const faceWidth = maxX - minX;
    const faceHeight = maxY - minY;
    return { minX, minY, maxX, maxY, faceWidth, faceHeight };
  }

  public detectMouthCenter(singleResult: SingleFaceLandmarkerResult): { x: number, y: number } {
    const mouthOval = FaceLandmarker.FACE_LANDMARKS_LIPS;
    const sum: {x: number, y: number} = mouthOval.reduce((prev, current) => {
      const point = singleResult.faceLandmarks[current.start];
      return { 
        x: prev.x + point.x * this.configs.videoSize.width, 
        y: prev.y + point.y * this.configs.videoSize.height,
      }
    }, { x: 0, y: 0 });
    return {
      x: sum.x / mouthOval.length,
      y: sum.y / mouthOval.length,
    };
  }
}