import { DrawingUtils, FaceLandmarker, FilesetResolver, Matrix, NormalizedLandmark } from "@mediapipe/tasks-vision";

interface SingleFaceLandmarkerResult {
  /** Detected face landmarks in normalized image coordinates. */
  readonly faceLandmarks: NormalizedLandmark[];
  /** Optional face blendshapes results. */
  readonly faceBlendshapes: Map<string, number>;
  /** Optional facial transformation matrix. */
  readonly facialTransformationMatrixes: Matrix;
}

interface CanvaseSize {
  readonly width: number;
  readonly height: number;
}

interface DetectingConfigs {
  readonly drawFaceLandmarks?: boolean | undefined;
  readonly drawPositionGuide?: boolean | undefined;
}

export class FaceDetector {

  private faceLandmarker: FaceLandmarker|undefined;
  private drawingUtils: DrawingUtils|undefined;
  private readonly ctx: CanvasRenderingContext2D|undefined;
  private readonly configs: DetectingConfigs | undefined;
  private readonly canvasSizer: () => CanvaseSize;
  
  // // 人脸位置检测相关状态
  // private facePositionHistory: Array<{x: number, y: number, size: number, orientation: {yaw: number, pitch: number, roll: number}}> = [];
  // private readonly POSITION_HISTORY_SIZE = 10; // 保存最近10帧的位置信息
  // private readonly STABILITY_THRESHOLD = 0.8; // 稳定性阈值

  constructor(params: {
    cpuContext: CanvasRenderingContext2D,
    configs?: DetectingConfigs | undefined,
    canvasSizer: () => CanvaseSize
  }) {
    this.initializeMediaPipe(params.cpuContext);
    this.ctx = params.cpuContext;
    this.configs = params.configs;
    this.canvasSizer = params.canvasSizer;
  }

  private async initializeMediaPipe(cpuContext: CanvasRenderingContext2D): Promise<void> {
    try {      
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        runningMode: "VIDEO",
        numFaces: 1
      });
      this.drawingUtils = new DrawingUtils(cpuContext);
    } catch (error) {
      console.error('初始化人脸检测失败:', error);
    }
  }

  public detect(videoFrame: TexImageSource): SingleFaceLandmarkerResult | string {
    const faceLandmarker = this.faceLandmarker;
    if (!faceLandmarker) {
      return '人脸核验初始化失败';
    }

    const startTimeMs = performance.now();
    const canvasSize = this.canvasSizer();
    const results = faceLandmarker.detectForVideo(videoFrame, startTimeMs);
    this.ctx?.clearRect(0, 0, canvasSize.width, canvasSize.height);
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
    this.drawFaceLandmarks(result);

    const validation = this.validateFace(result, canvasSize);
    return !!validation ? validation : result;
  }

  private drawFaceLandmarks(singleResult: SingleFaceLandmarkerResult): void {
    if (this.configs?.drawFaceLandmarks !== true) {
      return;
    }
    try {
      // 绘制脸部轮廓
      this.drawingUtils?.drawConnectors(
        singleResult.faceLandmarks,
        FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
        { color: "#00ff00", lineWidth: 2 }
      );
      
      // 绘制眼睛
      this.drawingUtils?.drawConnectors(
        singleResult.faceLandmarks,
        FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
        { color: "#30ff30", lineWidth: 2 }
      );
      
      this.drawingUtils?.drawConnectors(
        singleResult.faceLandmarks,
        FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
        { color: "#30ff30", lineWidth: 2 }
      );
      
      // 绘制嘴唇
      this.drawingUtils?.drawConnectors(
        singleResult.faceLandmarks,
        FaceLandmarker.FACE_LANDMARKS_LIPS,
        { color: "#ff3030", lineWidth: 2 }
      );
    } catch (error) {
      console.error('绘制人脸特征点时发生错误:', error);
      // 绘制错误不影响主要功能，继续执行
    }
  }

  private drawPositionGuide(canvasSize: CanvaseSize, extra: {
    faceCenter: { x: number, y: number },
    faceCentered: boolean
  }): void {
    const ctx = this.ctx;
    if (!ctx) {
      return;
    }

    try {
      const centerX = canvasSize.width / 2;
      const centerY = canvasSize.height / 2;
      
      // 绘制人脸中心点
      ctx.fillStyle = extra.faceCentered ? '#00ff00' : '#ff0000';
      ctx.beginPath();
      ctx.arc(extra.faceCenter.x, extra.faceCenter.y, 5, 0, 2 * Math.PI);
      ctx.fill();
      
      // 绘制从人脸中心到目标中心的连线
      ctx.strokeStyle = extra.faceCentered ? '#00ff00' : '#ff0000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(extra.faceCenter.x, extra.faceCenter.y);
      ctx.lineTo(centerX, centerY);
      ctx.stroke();
    } catch (error) {
      console.error('绘制位置指导时发生错误:', error);
    }
  }

  private validateFace(singleResult: SingleFaceLandmarkerResult, canvasSize: CanvaseSize): string | undefined {
    let validation: string | undefined;

    // 检查人脸朝向
    validation = this.validateFaceOrientation(singleResult);
    if (!!validation) {
      return validation;
    }

    // 检查人脸距离
    validation = this.validateFaceDistance(singleResult, canvasSize);
    if (!!validation) {
      return validation;
    }
    
    // 计算人脸中心位置
    validation = this.validateFaceCentered(singleResult, canvasSize);
    if (!!validation) {
      return validation;
    }

    return undefined;
  }

  private validateFaceCentered(singleResult: SingleFaceLandmarkerResult, canvasSize: CanvaseSize): string | undefined {
    // 使用脸部轮廓点计算人脸中心
    const faceOval = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;
    const sum: {x: number, y: number} = faceOval.reduce((prev, current) => {
      const point = singleResult.faceLandmarks[current.start];
      return { 
        x: prev.x + point.x * canvasSize.width, 
        y: prev.y + point.y * canvasSize.height,
      }
    }, { x: 0, y: 0 });
    const faceCenter = {
      x: sum.x / faceOval.length,
      y: sum.y / faceOval.length,
    };

    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;
    const distance = Math.sqrt(
      Math.pow(faceCenter.x - centerX, 2) + Math.pow(faceCenter.y - centerY, 2)
    );
    
    // 根据画布大小动态调整阈值，人脸中心距离画布中心不超过画布较小边的10%
    const threshold = Math.min(canvasSize.width, canvasSize.height) * 0.1;
    const isCentered = distance < threshold;

    this.drawPositionGuide(canvasSize, {
      faceCenter: faceCenter,
      faceCentered: isCentered,
    });
    return isCentered ? undefined : '请保持人脸在屏幕中央';
  }

  private validateFaceDistance(singleResult: SingleFaceLandmarkerResult, canvasSize: CanvaseSize): string | undefined {
    // 使用脸部轮廓的边界框计算人脸大小
    const faceOval = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const conn of faceOval) {
      const point = singleResult.faceLandmarks[conn.start];
      const x = point.x * canvasSize.width;
      const y = point.y * canvasSize.height;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    
    const width = maxX - minX;
    const height = maxY - minY;
    const maxLength = Math.max(width, height); // 返回较大的尺寸作为人脸大小

    // 检查人脸大小是否在合适范围内
    // 人脸大小应该在画布较小边的40%-60%之间
    const minSize = Math.min(canvasSize.width, canvasSize.height) * 0.4;
    const maxSize = Math.min(canvasSize.width, canvasSize.height) * 0.6;

    if (maxLength < minSize) {
      return '请靠近摄像头';
    }
    if (maxLength > maxSize) {
      return '请远离摄像头';
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
    
    // 计算欧拉角（yaw, pitch, roll）
    const yaw = Math.atan2(rotationMatrix[2][1], rotationMatrix[2][2]) * 180 / Math.PI;
    const pitch = Math.asin(-rotationMatrix[2][0]) * 180 / Math.PI;
    const roll = Math.atan2(rotationMatrix[1][0], rotationMatrix[0][0]) * 180 / Math.PI;

    // 检查人脸是否正对摄像头
    const yawThreshold = 10; // 左右转动阈值
    const pitchThreshold = 10; // 上下点头阈值
    const rollThreshold = 10; // 头部倾斜阈值

    // 检查三个角度是否都在阈值范围内
    const isYawOK = Math.abs(yaw) < yawThreshold;
    if (!isYawOK) {
      return '请不要左右转头';
    }

    const isPitchOK = Math.abs(pitch) < pitchThreshold;
    if (!isPitchOK) {
      return '请不要抬头或低头';
    }

    const isRollOK = Math.abs(roll) < rollThreshold;
    if (!isRollOK) {
      return '请不要歪头';
    }

    return undefined;
  }

  public detectBlink(singleResult: SingleFaceLandmarkerResult): boolean {
    const leftEyeBlinkScore = singleResult.faceBlendshapes.get('eyeBlinkLeft') ?? 0;
    const rightEyeBlinkScore = singleResult.faceBlendshapes.get('eyeBlinkRight') ?? 0;
    const blinkThreshold = 0.8;
    return leftEyeBlinkScore > blinkThreshold && rightEyeBlinkScore > blinkThreshold
  }

  public detectMouthOpen(singleResult: SingleFaceLandmarkerResult): boolean {
    const mouthOpenScroe = singleResult.faceBlendshapes.get('jawOpen') ?? 0;
    const mouthOpenThreshold = 0.6;
    return mouthOpenScroe > mouthOpenThreshold;
  }
}