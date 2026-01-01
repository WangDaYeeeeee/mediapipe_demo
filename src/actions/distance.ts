import { ActionDetector, SequentialActionDetector, SequentialFaceLandmarkerResult, VideoSize } from "./detector";

export class FarToCloseDetector extends SequentialActionDetector {
  
  /** 通过人脸宽度来检测前后移动，需要设置人脸的起始宽度 & 终止宽度 */
  readonly faceWidthRange: { from: number; to: number; };

  /** 移动过程至少需要持续的时间（毫秒/ms） */
  readonly minDurationInMillis: number;

  constructor(args?: { 
    faceWidthRange?: { from: number; to: number; };
    minDurationInMillis?: number;
    windowDurationInMillis?: number;
  }) {
    super(args?.windowDurationInMillis ?? 1500);
    this.faceWidthRange = args?.faceWidthRange ?? { from: 280, to: 320 };
    this.minDurationInMillis = args?.minDurationInMillis ?? 500;
  }

  /**
   * 检测是否有靠近镜头的动作发生
   * 
   * 1. 基于人脸宽度来判断距离，对宽度序列做时间加权的平滑处理
   * 2. 从尾部寻找，最长的单调递增序列（单调递增表示人脸宽度在增大，即靠近镜头）
   * 3. 若找到，则校验动作速度和动作范围是否满足要求
   */
  sequentialDetect(window: SequentialFaceLandmarkerResult[], size: VideoSize): boolean {
    // 构建人脸宽度序列
    const data = window.map((data) => ({
      value: ActionDetector.extractFaceArea(data, size).faceWidth,
      timestamp: data.timestampInMillis,
    }))
    // 平滑人脸宽度序列
    const smoothedData = SequentialActionDetector.timeWeightedEMASmoothing(data, 0.08);

    // 从尾部寻找，最长的单调递增序列
    let increasingSuffixBeginIndex = smoothedData.length;
    for (let i = smoothedData.length - 1; i > 0; i --) {
      if (smoothedData[i].value > smoothedData[i - 1].value) {
        // 当前人脸比前一个更宽，则单调递增
        increasingSuffixBeginIndex = i - 1;
      } else {
        break;
      }
    }

    // 切分出单调递增序列
    if (increasingSuffixBeginIndex === smoothedData.length) { // 没有找到单调递增序列
      return false;
    }
    const increasingData = smoothedData.slice(increasingSuffixBeginIndex);
    const beginDataPoint = increasingData[0];
    const endDataPoint = increasingData[increasingData.length - 1];

    // 校验动作速度
    const durationInMillis = endDataPoint.timestamp - beginDataPoint.timestamp;
    if (durationInMillis < this.minDurationInMillis) {
      // 动作太快
      return false;
    }

    // 校验动作范围
    if (beginDataPoint.value > this.faceWidthRange.from 
      || endDataPoint.value < this.faceWidthRange.to) {
      // 动作范围不符
      return false;
    }

    return true;
  }
}

export class CloseToFarDetector extends SequentialActionDetector {

  /** 通过人脸宽度来检测前后移动，需要设置人脸的起始宽度 & 终止宽度 */
  readonly faceWidthRange: { from: number; to: number; };

  /** 移动过程至少需要持续的时间（毫秒/ms） */
  readonly minDurationInMillis: number;

  constructor(args?: { 
    faceWidthRange?: { from: number; to: number; };
    minDurationInMillis?: number;
    windowDurationInMillis?: number;
  }) {
    super(args?.windowDurationInMillis ?? 1500);
    this.faceWidthRange = args?.faceWidthRange ?? { from: 280, to: 320 };
    this.minDurationInMillis = args?.minDurationInMillis ?? 500;
  }

  /**
   * 检测是否有远离镜头的动作发生
   * 
   * 1. 基于人脸宽度来判断距离，对宽度序列做时间加权的平滑处理
   * 2. 从尾部寻找，最长的单调递减序列（单调递减表示人脸宽度在减小，即远离镜头）
   * 3. 若找到，则校验动作速度和动作范围是否满足要求
   */
  sequentialDetect(window: SequentialFaceLandmarkerResult[], size: VideoSize): boolean {
    // 构建人脸宽度序列
    const data = window.map((data) => ({
      value: ActionDetector.extractFaceArea(data, size).faceWidth,
      timestamp: data.timestampInMillis,
    }))
    // 平滑人脸宽度序列
    const smoothedData = SequentialActionDetector.timeWeightedEMASmoothing(data, 0.08);

    // 从尾部寻找，最长的单调递减序列
    let decreasingSuffixBeginIndex = smoothedData.length;
    for (let i = smoothedData.length - 1; i > 0; i --) {
      if (smoothedData[i].value < smoothedData[i - 1].value) {
        // 当前人脸比前一个更窄，则单调递减
        decreasingSuffixBeginIndex = i - 1;
      } else {
        break;
      }
    }

    // 切分出单调递增序列
    if (decreasingSuffixBeginIndex === smoothedData.length) { // 没有找到单调递减序列
      return false;
    }
    const decreasingData = smoothedData.slice(decreasingSuffixBeginIndex);
    const beginDataPoint = decreasingData[0];
    const endDataPoint = decreasingData[decreasingData.length - 1];

    // 校验动作速度
    const durationInMillis = endDataPoint.timestamp - beginDataPoint.timestamp;
    if (durationInMillis < this.minDurationInMillis) {
      // 动作太快
      return false;
    }

    // 校验动作范围
    if (beginDataPoint.value < this.faceWidthRange.from 
      || endDataPoint.value > this.faceWidthRange.to) {
      // 动作范围不符
      return false;
    }

    return true;
  }
}