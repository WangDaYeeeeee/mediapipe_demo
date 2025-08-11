import { DrawingUtils, FaceLandmarker, FilesetResolver, Matrix, NormalizedLandmark } from "@mediapipe/tasks-vision";

interface SingleFaceLandmarkerResult {
  /** Detected face landmarks in normalized image coordinates. */
  faceLandmarks: NormalizedLandmark[];
  /** Optional face blendshapes results. */
  faceBlendshapes: Map<string, number>;
  /** Optional facial transformation matrix. */
  facialTransformationMatrixes: Matrix;
}

interface CanvaseSize {
  width: number;
  height: number;
}

export class FaceDetector {

  private faceLandmarker: FaceLandmarker|undefined;
  private ctx: CanvasRenderingContext2D|undefined;
  private drawingUtils: DrawingUtils|undefined;
  private canvasSizer: () => CanvaseSize;
  
  // // 人脸位置检测相关状态
  // private facePositionHistory: Array<{x: number, y: number, size: number, orientation: {yaw: number, pitch: number, roll: number}}> = [];
  // private readonly POSITION_HISTORY_SIZE = 10; // 保存最近10帧的位置信息
  // private readonly STABILITY_THRESHOLD = 0.8; // 稳定性阈值

  constructor(params: {
    cpuContext: CanvasRenderingContext2D | undefined,
    canvasSizer: () => CanvaseSize
  }) {
    this.initializeMediaPipe(params.cpuContext);
    this.canvasSizer = params.canvasSizer;
  }

  private async initializeMediaPipe(cpuContext: CanvasRenderingContext2D | undefined): Promise<void> {
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
        runningMode: "VIDEO",
        numFaces: 1
      });
      this.ctx = cpuContext;
      this.drawingUtils = cpuContext ? new DrawingUtils(cpuContext) : undefined;
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
      
      // // 绘制目标区域圆圈
      // const targetRadius = Math.min(canvasSize.width, canvasSize.height) * 0.15;
      // this.ctx.strokeStyle = this.faceCentered ? '#00ff00' : '#ff0000';
      // this.ctx.lineWidth = 3;
      // this.ctx.setLineDash([5, 5]);
      // this.ctx.beginPath();
      // this.ctx.arc(centerX, centerY, targetRadius, 0, 2 * Math.PI);
      // this.ctx.stroke();
      // this.ctx.setLineDash([]);
      
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
    // 计算人脸中心位置
    const faceCenter = this.calculateFaceCenter(singleResult, canvasSize);
    
    // 计算人脸大小
    const faceSize = this.calculateFaceSize(singleResult, canvasSize);
    
    // 计算人脸朝向
    const faceOrientation = this.calculateFaceOrientation(singleResult, canvasSize);
    
    // 更新位置历史
    // this.updatePositionHistory(faceCenter.x, faceCenter.y, faceSize, faceOrientation, canvasSize);
    
    // 检查是否满足所有条件
    const isCentered = this.checkCentering(faceCenter, canvasSize);
    this.drawPositionGuide(canvasSize, {
      faceCenter: faceCenter,
      faceCentered: isCentered,
    })
    if (!isCentered) {
      return '人脸未居中';
    }
    const isProperSize = this.checkFaceSize(faceSize, canvasSize);
    if (!isProperSize) {
      return '请调整至合适距离';
    }
    const isFacingForward = this.checkFaceOrientation(faceOrientation);
    if (!isFacingForward) {
      return '请正对摄像头';
    }
    const isStable = true; // this.checkStability();
    if (!isStable) {
      return '请稳定设备';
    }
    
    // 所有条件都满足才认为人脸位置正确
    // return isCentered && isProperSize && isFacingForward && isStable;
    return undefined;
  }

  private calculateFaceCenter(singleResult: SingleFaceLandmarkerResult, canvasSize: CanvaseSize): {
    x: number, 
    y: number
  } {
    // 使用脸部轮廓点计算人脸中心
    const faceOval = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;
    const sum: {x: number, y: number} = faceOval.reduce((prev, current) => {
      const point = singleResult.faceLandmarks[current.start];
      return { 
        x: prev.x + point.x * canvasSize.width, 
        y: prev.y + point.y * canvasSize.height,
      }
    }, { x: 0, y: 0 });
    return {
      x: sum.x / faceOval.length,
      y: sum.y / faceOval.length,
    };
  }
  
  private calculateFaceSize(singleResult: SingleFaceLandmarkerResult, canvasSize: CanvaseSize): number {
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
    return Math.max(width, height); // 返回较大的尺寸作为人脸大小
  }
  
  private calculateFaceOrientation(singleResult: SingleFaceLandmarkerResult, canvasSize: CanvaseSize): {
    yaw: number, 
    pitch: number, 
    roll: number
  } {
    if (!singleResult.facialTransformationMatrixes) { // 如果变换矩阵不可用，使用备用的几何计算方法
      return this.calculateFaceOrientationFromLandmarks(singleResult, canvasSize);
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
    
    return { yaw, pitch, roll };
  }
  
  private calculateFaceOrientationFromLandmarks(singleResult: SingleFaceLandmarkerResult, canvasSize: CanvaseSize): {
    yaw: number, 
    pitch: number, 
    roll: number
  } {
    // 使用关键点计算人脸朝向的备用方法
    
    // 计算roll（头部倾斜）- 使用眼睛连线
    const leftEye = FaceLandmarker.FACE_LANDMARKS_LEFT_EYE;
    const rightEye = FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE;
    
    let leftEyeX = 0, leftEyeY = 0, leftEyeCount = 0;
    for (const conn of leftEye) {
      const point = singleResult.faceLandmarks[conn.start];
      if (point) {
        leftEyeX += point.x * canvasSize.width;
        leftEyeY += point.y * canvasSize.height;
        leftEyeCount++;
      }
    }
    
    let rightEyeX = 0, rightEyeY = 0, rightEyeCount = 0;
    for (const conn of rightEye) {
      const point = singleResult.faceLandmarks[conn.start];
      if (point) {
        rightEyeX += point.x * canvasSize.width;
        rightEyeY += point.y * canvasSize.height;
        rightEyeCount++;
      }
    }
    
    if (leftEyeCount === 0 || rightEyeCount === 0) {
      return { yaw: 0, pitch: 0, roll: 0 };
    }
    
    leftEyeX /= leftEyeCount;
    leftEyeY /= leftEyeCount;
    rightEyeX /= rightEyeCount;
    rightEyeY /= rightEyeCount;
    
    const roll = Math.atan2(rightEyeY - leftEyeY, rightEyeX - leftEyeX) * 180 / Math.PI;
    
    // 计算yaw（左右转动）- 使用鼻子和眼睛的相对位置
    const nose = singleResult.faceLandmarks[1]; // 鼻子尖端
    const eyeCenterX = (leftEyeX + rightEyeX) / 2;
    const eyeCenterY = (leftEyeY + rightEyeY) / 2;
    
    const noseX = nose.x * canvasSize.width;
    const noseY = nose.y * canvasSize.height;
    
    // 计算鼻子相对于眼睛中心的偏移
    const yaw = Math.atan2(noseX - eyeCenterX, Math.abs(noseY - eyeCenterY)) * 180 / Math.PI;
    
    // 计算pitch（上下点头）- 使用眼睛和嘴巴的相对位置
    const lips = FaceLandmarker.FACE_LANDMARKS_LIPS;
    let mouthY = 0, mouthCount = 0;
    for (const conn of lips) {
      const point = singleResult.faceLandmarks[conn.start];
      if (point) {
        mouthY += point.y * canvasSize.height;
        mouthCount++;
      }
    }
    
    if (mouthCount === 0) {
      return { yaw, pitch: 0, roll };
    }
    
    mouthY /= mouthCount;
    const pitch = Math.atan2(mouthY - eyeCenterY, Math.abs(mouthY - eyeCenterY)) * 180 / Math.PI;
    
    return { yaw, pitch, roll };
  }
  
  // private updatePositionHistory(x: number, y: number, size: number, orientation: {yaw: number, pitch: number, roll: number}): void {
  //   this.facePositionHistory.push({ x, y, size, orientation });
    
  //   // 保持历史记录在指定大小内
  //   if (this.facePositionHistory.length > this.POSITION_HISTORY_SIZE) {
  //     this.facePositionHistory.shift();
  //   }
  // }
  
  private checkCentering(faceCenter: {x: number, y: number}, canvasSize: CanvaseSize): boolean {
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;
    const distance = Math.sqrt(
      Math.pow(faceCenter.x - centerX, 2) + Math.pow(faceCenter.y - centerY, 2)
    );
    
    // 根据画布大小动态调整阈值，人脸中心距离画布中心不超过画布较小边的10%
    const threshold = Math.min(canvasSize.width, canvasSize.height) * 0.1;
    return distance < threshold;
  }
  
  private checkFaceSize(faceSize: number, canvasSize: CanvaseSize): boolean {
    // 检查人脸大小是否在合适范围内
    // 人脸大小应该在画布较小边的30%-70%之间
    const minSize = Math.min(canvasSize.width, canvasSize.height) * 0.3;
    const maxSize = Math.min(canvasSize.width, canvasSize.height) * 0.7;
    
    return faceSize >= minSize && faceSize <= maxSize;
  }
  
  private checkFaceOrientation(orientation: {yaw: number, pitch: number, roll: number}): boolean {
    // 检查人脸是否正对摄像头
    const yawThreshold = 15; // 左右转动阈值
    const pitchThreshold = 15; // 上下点头阈值
    const rollThreshold = 15; // 头部倾斜阈值
    
    // 检查三个角度是否都在阈值范围内
    const isYawOK = Math.abs(orientation.yaw) < yawThreshold;
    const isPitchOK = Math.abs(orientation.pitch) < pitchThreshold;
    const isRollOK = Math.abs(orientation.roll) < rollThreshold;
    
    return isYawOK && isPitchOK && isRollOK;
  }
  
  // private checkStability(): boolean {
  //   // 检查人脸位置是否稳定
  //   if (this.facePositionHistory.length < this.POSITION_HISTORY_SIZE) {
  //     return false; // 需要足够的历史数据
  //   }
    
  //   // 计算位置变化的方差
  //   const positions = this.facePositionHistory.map(p => ({ x: p.x, y: p.y }));
  //   const centerX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length;
  //   const centerY = positions.reduce((sum, p) => sum + p.y, 0) / positions.length;
    
  //   const variance = positions.reduce((sum, p) => {
  //     return sum + Math.pow(p.x - centerX, 2) + Math.pow(p.y - centerY, 2);
  //   }, 0) / positions.length;
    
  //   // 方差越小，位置越稳定
  //   const maxVariance = Math.pow(Math.min(this.canvas.width, this.canvas.height) * 0.05, 2);
  //   return variance < maxVariance;
  // }

  // private getDetailedPositionTip(): string {
  //   if (this.facePositionHistory.length === 0) {
  //     return '请将脸部对准绿色圆圈中心，保持正对摄像头，距离适中';
  //   }
    
  //   const latest = this.facePositionHistory[this.facePositionHistory.length - 1];
  //   const centerX = this.canvas.width / 2;
  //   const centerY = this.canvas.height / 2;
    
  //   const distance = Math.sqrt(
  //     Math.pow(latest.x - centerX, 2) + Math.pow(latest.y - centerY, 2)
  //   );
  //   const threshold = Math.min(this.canvas.width, this.canvas.height) * 0.15;
    
  //   const minSize = Math.min(this.canvas.width, this.canvas.height) * 0.3;
  //   const maxSize = Math.min(this.canvas.width, this.canvas.height) * 0.7;
    
  //   const isFacingForward = this.checkFaceOrientation(latest.orientation);
    
  //   let tip = '';
    
  //   if (distance > threshold) {
  //     if (Math.abs(latest.x - centerX) > Math.abs(latest.y - centerY)) {
  //       tip += latest.x > centerX ? '请向左移动' : '请向右移动';
  //     } else {
  //       tip += latest.y > centerY ? '请向上移动' : '请向下移动';
  //     }
  //     tip += '，';
  //   }
    
  //   if (latest.size < minSize) {
  //     tip += '请靠近摄像头，';
  //   } else if (latest.size > maxSize) {
  //     tip += '请远离摄像头，';
  //   }
    
  //   if (!isFacingForward) {
  //     const { yaw, pitch, roll } = latest.orientation;
  //     const yawThreshold = 15;
  //     const pitchThreshold = 15;
  //     const rollThreshold = 15;
      
  //     if (Math.abs(yaw) > yawThreshold) {
  //       tip += yaw > 0 ? '请向左转' : '请向右转';
  //     } else if (Math.abs(pitch) > pitchThreshold) {
  //       tip += pitch > 0 ? '请向下看' : '请向上看';
  //     } else if (Math.abs(roll) > rollThreshold) {
  //       tip += roll > 0 ? '请向左倾斜' : '请向右倾斜';
  //     }
  //     tip += '，';
  //   }
    
  //   if (tip === '') {
  //     tip = '位置很好，请保持稳定';
  //   } else {
  //     tip = tip.slice(0, -1); // 移除最后的逗号
  //   }
    
  //   return tip;
  // }

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