import { ActionDetector, SequentialActionDetector, SequentialFaceLandmarkerResult, VideoSize } from "./detector";

/** 偏航角阈值 */
export interface YawTriggers {
  /** 达成转头时的偏航角绝对阈值 */
  readonly finalYaw: number;

  /** 转头时的偏航角变化阈值 */
  readonly deltaYaw: number;
}

export class TurnLeftDetector extends SequentialActionDetector {

  readonly triggers: YawTriggers;

  constructor(
    triggers: YawTriggers = { finalYaw: -20, deltaYaw: 10 },
    windowDurationInMillis: number = 1000,
  ) {
    super(windowDurationInMillis);
    this.triggers = triggers;
  }

  /**
   * 检测向左转头动作是否发生
   * 
   * 1. 基于偏航角来判断转头，对偏航角序列做时间加权的平滑处理
   * 2. 从尾部寻找，最长的单调递减序列（单调递减表示偏航角在减小，即向左转头）
   * 3. 若找到，则校验动作幅度是否满足要求
   */
  sequentialDetect(window: SequentialFaceLandmarkerResult[], _: VideoSize): boolean {
    // 构建人脸偏航角序列
    const data = window.map((data) => ({
      value: ActionDetector.calculateEulerAngle(data).yaw,
      timestamp: data.timestampInMillis,
    }))
    // 平滑偏航角序列
    const smoothedData = SequentialActionDetector.timeWeightedEMASmoothing(data, 0.08);

    // 从尾部寻找，最长的单调递减序列
    let decreasingSuffixBeginIndex = smoothedData.length;
    for (let i = smoothedData.length - 1; i > 0; i --) {
      if (smoothedData[i].value < smoothedData[i - 1].value) {
        // 当前偏航角比前一个更小，则单调递减
        decreasingSuffixBeginIndex = i - 1;
      } else {
        break;
      }
    }

    // 切分出单调递增序列
    if (decreasingSuffixBeginIndex === data.length) { // 没有找到单调递减序列
      return false;
    }
    const decreasingData = data.slice(decreasingSuffixBeginIndex);
    const beginDataPoint = decreasingData[0];
    const endDataPoint = decreasingData[decreasingData.length - 1];

    // 校验动作范围
    const deltaYaw = Math.abs(endDataPoint.value - beginDataPoint.value);
    if (endDataPoint.value > this.triggers.finalYaw 
      || deltaYaw < this.triggers.deltaYaw) {
      // 动作范围不符
      return false;
    }
    return true;
  }
}

export class TurnRightDetector extends SequentialActionDetector {

  readonly triggers: YawTriggers;

  constructor(
    triggers: YawTriggers = { finalYaw: 20, deltaYaw: 10 },
    windowDurationInMillis: number = 1000,
  ) {
    super(windowDurationInMillis);
    this.triggers = triggers;
  }

  /**
   * 检测向右转头动作是否发生
   * 
   * 1. 基于偏航角来判断转头，对偏航角序列做时间加权的平滑处理
   * 2. 从尾部寻找，最长的单调递增序列（单调递增表示偏航角在增大，即向右转头）
   * 3. 若找到，则校验动作幅度是否满足要求
   */
  sequentialDetect(window: SequentialFaceLandmarkerResult[], _: VideoSize): boolean {
    // 构建人脸偏航角序列
    const data = window.map((data) => ({
      value: ActionDetector.calculateEulerAngle(data).yaw,
      timestamp: data.timestampInMillis,
    }))
    // 平滑偏航角序列
    const smoothedData = SequentialActionDetector.timeWeightedEMASmoothing(data, 0.08);

    // 从尾部寻找，最长的单调递减序列
    let increasingSuffixBeginIndex = smoothedData.length;
    for (let i = smoothedData.length - 1; i > 0; i --) {
      if (smoothedData[i].value > smoothedData[i - 1].value) {
        // 当前偏航角比前一个更小，则单调递减
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
    const deltaYaw = Math.abs(endDataPoint.value - beginDataPoint.value);
    if (endDataPoint.value < this.triggers.finalYaw 
      || deltaYaw < this.triggers.deltaYaw) {
      // 动作范围不符
      return false;
    }
    return true;
  }
}