import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { SingleFaceLandmarkerResult } from "../face_detection";

/** 欧拉角，精确描述人脸在 3D 空间中的朝向 */
export interface EulerAngle {
  /** 
   * **俯仰角**：低头/抬头的角度（绕穿过两耳的`x`轴旋转）
   * - 正值 (+)： 抬头
   * - 负值 (-)： 低头
   */
  readonly pitch: number;
  /** 
   * **偏航角**：左转/右转的角度（绕穿过头顶和脖子的`y`轴旋转）
   * - 正值 (+)： 向右转头
   * - 负值 (-)： 向左转头
   */
  readonly yaw: number;
  /** 
   * **滚转角**：歪头/侧倾（耳朵向肩膀靠拢）的角度（绕从鼻子指向后脑的`z`轴旋转）
   * - 正值 (+)： 向左歪头
   * - 负值 (-)： 向右歪头
   */
  readonly roll: number;
}

/** 连续人脸数据序列中的单帧人脸信息 */
export interface SequentialFaceLandmarkerResult extends SingleFaceLandmarkerResult {
  /** 该帧人脸数据的时间戳（毫秒/ms） */
  readonly timestampInMillis: number;
}

/** 
 * 视频尺寸
 * 
 * * 注意：所有尺寸数据都应当基于 **原始的视频采集尺寸** 进行计算！！！
 */
export interface VideoSize {
  readonly width: number;
  readonly height: number;
}

/** 人脸区域 */
export interface FaceArea {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly faceWidth: number;
  readonly faceHeight: number;
}

/** 动作检测器 */
export interface ActionDetector {

  /** 
   * 检测动作
   * @param singleResult 单帧人脸信息
   * @param size 视频尺寸（**原始的视频采集尺寸**）
   * @returns 是否检测到动作
   */
  detect(singleResult: SingleFaceLandmarkerResult, size: VideoSize): boolean;
  
  /** 重置检测器 */
  reset(): void;
}

export namespace ActionDetector {
  
  /** 基于单帧人脸信息，计算欧拉角 */
  export function calculateEulerAngle(
    singleResult: SingleFaceLandmarkerResult
  ): EulerAngle {
    const matrix = singleResult.facialTransformationMatrixes;
    const rotationMatrix = [
      [matrix.data[0], matrix.data[1], matrix.data[2]],
      [matrix.data[4], matrix.data[5], matrix.data[6]],
      [matrix.data[8], matrix.data[9], matrix.data[10]],
    ];

    const pitch = Math.atan2(rotationMatrix[2][1], rotationMatrix[2][2]) * 180 / Math.PI;
    const yaw = Math.asin(-rotationMatrix[2][0]) * 180 / Math.PI;
    const roll = Math.atan2(rotationMatrix[1][0], rotationMatrix[0][0]) * 180 / Math.PI;

    return { pitch, yaw, roll };
  }

  /** 提取人脸区域 */
  export function extractFaceArea(
    singleResult: SingleFaceLandmarkerResult,
    size: VideoSize
  ): FaceArea {
    const faceLandmarks = singleResult.faceLandmarks;
    const faceOval = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const conn of faceOval) {
      const point = faceLandmarks[conn.start];
      const x = point.x * size.width;
      const y = point.y * size.height;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    minX = Math.max(0, minX - 20);
    maxX = Math.min(size.width, maxX + 20);
    maxY = Math.min(size.height, maxY + 10);

    const faceWidth = maxX - minX;
    const faceHeight = maxY - minY;
    return { minX, minY, maxX, maxY, faceWidth, faceHeight };
  }
}

/** 
 * 连续动作检测器
 * 
 * 内部维护一个滑动窗口，用于检测连续动作
 */
export abstract class SequentialActionDetector implements ActionDetector {

  /** 滑动窗口 */
  private slidingWindow: SequentialFaceLandmarkerResult[] = [];

  /** 用于检测的滑动窗口时长（毫秒/ms） */
  readonly windowDurationInMillis: number;

  constructor(windowDurationInMillis: number) {
    this.windowDurationInMillis = windowDurationInMillis;
  }

  /** 
   * 对滑动窗口内的人脸数据序列，进行动作检测
   * @param window 滑动窗口内的人脸数据序列
   * @param size 视频尺寸（**原始的视频采集尺寸**）
   * @returns 是否检测到动作
   */
  abstract sequentialDetect(
    window: SequentialFaceLandmarkerResult[], 
    size: VideoSize
  ): boolean;

  /** 维护滑动窗口内的记录，并执行连续动作检测 */
  detect(singleResult: SingleFaceLandmarkerResult, size: VideoSize): boolean {
    // 记录当前时间戳和人脸数据
    const record = { ...singleResult, timestampInMillis: performance.now() };
    this.slidingWindow.push(record);

    // 如果滑动窗口长度超过窗口时长，则移除最早的记录
    const validTimestamp = performance.now() - this.windowDurationInMillis;
    this.slidingWindow.filter(r => r.timestampInMillis >= validTimestamp);

    // 对连续动作进行检测
    return this.sequentialDetect([...this.slidingWindow], size);
  }

  /** 重置检测器 */
  reset(): void {
    this.slidingWindow = []; // 清空滑动窗口
  }
}

export namespace SequentialActionDetector {

  export interface TimeWeightedEMADataPoint {
    readonly value: number;
    readonly timestamp: number;
  }

  /**
   * 时间加权 EMA 算法
   * @param data 输入的非均匀时间序列
   * @param tau 时间常数（衰减速度，MediaPipe内部一般自带平滑处理，因此这个参数不要设置的过大）
   *              - 0.02： 快速衰减，适合快速变化的序列（眨眼）
   *              - 0.05： 中等衰减，适合一般变化的序列（点头、摇头）
   *              - 0.08： 慢速衰减，适合缓慢变化的序列（前后移动）
   * @returns 经过平滑处理的数值数组
   */
  export function timeWeightedEMASmoothing(
    data: TimeWeightedEMADataPoint[], 
    tau: 0.02 | 0.05 | 0.08 = 0.05
  ): TimeWeightedEMADataPoint[] {
    if (data.length === 0) {
      return [];
    }
    if (tau <= 0) {
      throw new Error("时间常数 tau 必须大于 0");
    }
  
    const result: TimeWeightedEMADataPoint[] = new Array(data.length);
    
    // 初始值处理
    let lastEma = data[0].value;
    let lastTimestamp = data[0].timestamp;
    result[0] = { value: lastEma, timestamp: lastTimestamp };
  
    for (let i = 1; i < data.length; i++) {
      const { value, timestamp } = data[i];
      const deltaT = timestamp - lastTimestamp;
  
      // 如果两个点时间戳相同，deltaT 为 0，alpha 为 0，EMA 保持不变或根据业务取均值
      // 使用 Math.exp 计算衰减系数
      const alpha = 1 - Math.exp(-deltaT / tau);
  
      const currentEma = value * alpha + lastEma * (1 - alpha);
      
      result[i] = { value: currentEma, timestamp: timestamp };
      lastEma = currentEma;
      lastTimestamp = timestamp;
    }
  
    return result;
  }
}