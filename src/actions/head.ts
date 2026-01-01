import { ActionDetector, SequentialActionDetector, SequentialFaceLandmarkerResult, VideoSize } from "./detector";

export class NodHeadDetector extends SequentialActionDetector {

  /** 点头次数 */
  readonly noddingCount: number;

  /** 触发点头时的俯仰角变化阈值 */
  readonly deltaPitchTrigger: number;

  constructor(args?: {
    noddingCount?: number;
    deltaPitchTrigger?: number;
    windowDurationInMillis?: number;
  }) {
    const noddingCount = args?.noddingCount ?? 1;
    super(args?.windowDurationInMillis ?? (noddingCount + 1) * 600);
    this.noddingCount = noddingCount;
    this.deltaPitchTrigger = args?.deltaPitchTrigger ?? 15;
  }

  /**
   * 检测点头动作是否发生
   * 
   * 1. 基于俯仰角来判断点头，对俯仰角序列做时间加权的平滑处理
   * 2. 将俯仰角的平滑变化轨迹切分成交错的单调区间（增，减，增，减，...）
   * 3. 校验区间的数量、动作幅度是否满足要求
   */
  sequentialDetect(window: SequentialFaceLandmarkerResult[], _: VideoSize): boolean {
    // 构建俯仰角序列
    const data = window.map((data) => ({
      value: ActionDetector.calculateEulerAngle(data).pitch,
      timestamp: data.timestampInMillis,
    }))
    // 平滑俯仰角序列
    const smoothedData = SequentialActionDetector.timeWeightedEMASmoothing(data, 0.05);

    // 一次点头的过程，俯仰角会先单调递增，再单调递减，将平滑后的数据进行分割
    let actionRecords: {
      readonly beginIndex: number; // 动作开始的下标
      readonly action: 'head_up' | 'head_down'; // 动作类型（抬头/低头）
    }[] = []; // 动作类型是间隔出现的 => down, up, down, up, down, up, ...
    for (let i = 1; i < smoothedData.length; i ++) {
      // 如果记录为空，则需要记录第一个动作
      if (actionRecords.length == 0) {
        const action = smoothedData[i].value > smoothedData[i - 1].value 
          ? 'head_up' 
          : 'head_down';
        actionRecords.push({ beginIndex: i - 1, action });
        continue;
      }
      // 如果前序记录存在，则需要检查是否发生反转
      const prevAction = actionRecords[actionRecords.length - 1].action;
      if (smoothedData[i].value > smoothedData[i - 1].value && prevAction === 'head_down') {
        // 当前俯仰角比上一个更大，则为抬头，此时如果前序记录为低头，则需要记录反转
        actionRecords.push({ beginIndex: i - 1, action: 'head_up' });
        continue;
      }
      if (smoothedData[i].value < smoothedData[i - 1].value && prevAction === 'head_up') {
        // 当前俯仰角比上一个更小，则为低头，此时如果前序记录为抬头，则需要记录反转
        actionRecords.push({ beginIndex: i - 1, action: 'head_down' });
        continue;
      }
    }

    // 没有找到动作
    if (actionRecords.length == 0) {
      return false;
    }
    // 未能完成完整的点头动作
    if (actionRecords[actionRecords.length - 1].action !== 'head_up') {
      return false;
    }
    
    // 点头次数不足
    const headDownCount = actionRecords.filter((e) => e.action === 'head_down').length;
    const headUpCount = actionRecords.filter((e) => e.action === 'head_up').length;
    if (headDownCount < this.noddingCount || headUpCount < this.noddingCount) {
      return false;
    }
    
    // 切分出点头动作区间
    const noddingRecords = actionRecords.slice(
      actionRecords.length - this.noddingCount * 2, 
      actionRecords.length
    );
    // 校验点头动作幅度
    for (let i = 0; i < noddingRecords.length; i ++) {
      const record = noddingRecords[i];
      const nextRecord = i + 1 < noddingRecords.length ? noddingRecords[i + 1] : undefined;

      const beginDataPoint = data[record.beginIndex];
      const endDataPoint = data[nextRecord?.beginIndex ?? data.length - 1];

      const deltaPitch = Math.abs(endDataPoint.value - beginDataPoint.value);
      if (deltaPitch < this.deltaPitchTrigger) {
        return false;
      }
    }

    return true;
  }
}

export class ShakeHeadDetector extends SequentialActionDetector {

  /** 摇头轮数 */
  readonly shakingCount: number;

  /** 触发摇头时的偏航角绝对阈值 */
  readonly deltaYawTrigger: number;

  constructor(args?: {
    shakingCount?: number;
    deltaYawTrigger?: number;
    windowDurationInMillis?: number;
  }) {
    const shakingCount = args?.shakingCount ?? 1;
    super(args?.windowDurationInMillis ?? (shakingCount + 1) * 500);
    this.shakingCount = shakingCount;
    this.deltaYawTrigger = args?.deltaYawTrigger ?? 15;
  }

  /**
   * 检测摇头动作是否发生
   * 
   * 1. 基于偏航角来判断摇头，对偏航角序列做时间加权的平滑处理
   * 2. 将偏航角的平滑变化轨迹切分成交错的单调区间（增，减，增，减，...）
   * 3. 校验区间的数量、动作幅度是否满足要求
   */
  sequentialDetect(window: SequentialFaceLandmarkerResult[], _: VideoSize): boolean {
    // 构建偏航角序列
    const data = window.map((data) => ({
      value: ActionDetector.calculateEulerAngle(data).yaw,
      timestamp: data.timestampInMillis,
    }))
    // 平滑偏航角序列
    const smoothedData = SequentialActionDetector.timeWeightedEMASmoothing(data, 0.05);

    // 一次摇头的过程，偏航角会先单调递增，再单调递减，或相反，将平滑后的数据进行分割
    let yawRecords: {
      readonly beginIndex: number; // 动作开始的下标
      readonly trend: 'increase' | 'decrease'; // 偏航角变化趋势
    }[] = []; // 偏航角变化趋势是间隔出现的 => up, down, up, down, up, down, ...
    for (let i = 1; i < smoothedData.length; i ++) {
      // 如果记录为空，则需要记录第一个动作
      if (yawRecords.length == 0) {
        const trend = smoothedData[i].value > smoothedData[i - 1].value 
          ? 'increase' 
          : 'decrease';
          yawRecords.push({ beginIndex: i - 1, trend });
        continue;
      }
      // 如果前序记录存在，则需要检查是否发生反转
      const prevTrend = yawRecords[yawRecords.length - 1].trend;
      if (smoothedData[i].value > smoothedData[i - 1].value && prevTrend === 'decrease') {
        // 当前偏航角比上一个更大，则为递增，此时如果前序趋势为递减，则需要记录反转
        yawRecords.push({ beginIndex: i - 1, trend: 'increase' });
        continue;
      }
      if (smoothedData[i].value < smoothedData[i - 1].value && prevTrend === 'increase') {
        // 当前偏航角比上一个更小，则为递减，此时如果前序趋势为递增，则需要记录反转
        yawRecords.push({ beginIndex: i - 1, trend: 'decrease' });
        continue;
      }
    }

    // 没有找到动作
    if (yawRecords.length == 0) {
      return false;
    }
    
    // 点头次数不足
    const increaseCount = yawRecords.filter((e) => e.trend === 'decrease').length;
    const decreaseCount = yawRecords.filter((e) => e.trend === 'increase').length;
    if (increaseCount < this.shakingCount || decreaseCount < this.shakingCount) {
      return false;
    }
    
    // 切分出摇头动作区间
    const shakingRecords = yawRecords.slice(
      yawRecords.length - this.shakingCount * 2, 
      yawRecords.length
    );
    // 校验摇头动作幅度
    for (let i = 0; i < shakingRecords.length; i ++) {
      const nextRecord = i + 1 < shakingRecords.length ? shakingRecords[i + 1] : undefined;
      const endDataPoint = data[nextRecord?.beginIndex ?? data.length - 1];
      if (Math.abs(endDataPoint.value) < this.deltaYawTrigger) {
        return false;
      }
    }

    return true;
  }
}