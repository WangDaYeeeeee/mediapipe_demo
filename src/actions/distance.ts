import { ActionDetector, SequentialActionDetector, SequentialFaceLandmarkerResult, VideoSize } from "./detector";

/** 人脸宽度阈值 */
export interface FaceWidthTriggers {

  /** 最终的人脸宽度
   * 
   * - 靠近镜头时，最终的人脸宽度需要大于该值
   * - 远离镜头时需要小于该值 */
  readonly finalFaceWidth: number;

  /** 人脸宽度变化阈值
   * 
   * - 人脸宽度单调变化时，变化量需要大于该值 */
  readonly deltaFaceWidth: number;
}

export class FarToCloseDetector extends SequentialActionDetector {
  
  readonly triggers: FaceWidthTriggers;

  constructor(
    triggers: FaceWidthTriggers = { finalFaceWidth: 320, deltaFaceWidth: 20 }, 
    windowDurationInMillis: number = 1000
  ) {
    super(windowDurationInMillis);
    this.triggers = triggers;
  }

  /**
   * 检测是否有靠近镜头的动作发生
   * 
   * 1. 基于人脸宽度来判断距离，对宽度序列做时间加权的平滑处理
   * 2. 从尾部寻找，最长的单调递增序列（单调递增表示人脸宽度在增大，即靠近镜头）
   * 3. 若找到，则校验动作幅度是否满足要求
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
    if (increasingSuffixBeginIndex === data.length) { // 没有找到单调递增序列
      return false;
    }
    const increasingData = data.slice(increasingSuffixBeginIndex);
    const beginDataPoint = increasingData[0];
    const endDataPoint = increasingData[increasingData.length - 1];

    // 校验动作范围
    const deltaWidth = Math.abs(endDataPoint.value - beginDataPoint.value);
    if (endDataPoint.value < this.triggers.finalFaceWidth 
      || deltaWidth < this.triggers.deltaFaceWidth) {
      // 动作范围不符
      return false;
    }

    return true;
  }
}

export class CloseToFarDetector extends SequentialActionDetector {

  readonly triggers: FaceWidthTriggers;

  constructor(
    triggers: FaceWidthTriggers = { finalFaceWidth: 280, deltaFaceWidth: 20 }, 
    windowDurationInMillis: number = 1000
  ) {
    super(windowDurationInMillis);
    this.triggers = triggers;
  }

  /**
   * 检测是否有远离镜头的动作发生
   * 
   * 1. 基于人脸宽度来判断距离，对宽度序列做时间加权的平滑处理
   * 2. 从尾部寻找，最长的单调递减序列（单调递减表示人脸宽度在减小，即远离镜头）
   * 3. 若找到，则校验动作幅度是否满足要求
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

    // 校验动作范围
    const deltaWidth = Math.abs(endDataPoint.value - beginDataPoint.value);
    if (endDataPoint.value > this.triggers.finalFaceWidth 
      || deltaWidth < this.triggers.deltaFaceWidth) {
      // 动作范围不符
      return false;
    }

    return true;
  }
}