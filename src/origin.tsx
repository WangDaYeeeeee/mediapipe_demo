import { createElement, useState, useEffect, useRef } from 'rax';
import View from 'rax-view';
import Image from 'rax-image';
import Dialog from '@ali/mono-train-dialog';
import { ECurrentStep } from '../../interfaces';
import { ACTION_MAP, detectFunctionMap } from '../../constants';
import { delay } from '../../utils/common';
import { runCompatibilityTest } from '../../utils/compatible';
import { parseActionSequence } from '../../utils/format';
import { videoRecordSize } from '../../constants';
import { setBrightness } from '../../utils/bridge';
import { SingleFaceLandmarkerResult, ReflectFrame, ActionFrame } from './utils/face-media-pipe';
import { VideoFrameBuffer, VideoResult } from './utils/video-buffer';
import { captureExposureFrames, simpleUniformSample } from './utils/reflectFrame';
import {
  blobToBase64,
  uploadAndVerifyFaceData,
  retryUploadAndVerifyFaceData,
  executeDeleteHistoryFeature,
  executeDataEncodingAndChunking,
  executeConcurrentChunkUpload,
  executeFaceVerification,
  executeIdentityInit,
  executeIdentityConfig,
  UploadAndVerifyFaceParams,
  FaceDataParams,
  paserRiskParams,
  executeFaceVerifyV2,
  execTitanData,
} from './utils';
import { logError, logSls, logSuccess, logInfo } from './utils/service';
import { VerifyTypeType, VerifyFaceStep } from '../../interfaces';
import { ModelLoadState } from '../../interfaces/face-verity';
import { failDialog, REQUESTING_ICON, INITIAL_ICON } from '../../constants';
import './index.less';
import './face-detection.less';
import { isWeChatMiniProgramH5 } from '@ali/rxpi-env';

type OnFrame = (frame: string | SingleFaceLandmarkerResult) => void;
let startPredictWebcam = false;

export default function FaceVerifyPage(props) {
  const {
    onSuccess,
    onError,
    isModelReady,
    faceDetectorRef,
    modelLoadState,
    bizParamExtra = '',
    isFaker,
    errCode,
    showCommonBack,
    pageType,
    certificateType,
    personName,
    personCountry,
  } = props;
  const modelLoadStateRef = useRef(modelLoadState);
  const [identityConfig, setIdentityConfig] = useState<any>();
  const actionSeqString = identityConfig?.actionResConfig_?.actionSeq_;
  const colorSeqArr = identityConfig?.reflectResConfig_?.colorDataDecode_?.colorOutputList;
  const colorInputList = identityConfig?.reflectResConfig_?.colorDataDecode_?.colorInputList;
  const colorUnit = identityConfig?.reflectResConfig_?.colorDataDecode_?.unit || 120;
  const riskConfigParams = paserRiskParams(identityConfig?.riskResConfig_);
  // 动态生成actionList - 这里可以根据实际接口数据传入
  const actionList = parseActionSequence(actionSeqString); // 默认使用1,2作为示例
  // 动态生成颜色列表 - 解析接口返回的颜色数据
  // const dynamicColorList = parsecolorOutputList(colorSeqArr);

  const {
    certificateId,
    verifyScene,
    initToken,
    accountName12306,
    account12306Name,
    account12306,
    username,
    orderId,
    subOrderId,
    isAliyunTencent,
    isTencent,
    verifyType,
    collectType,
    updateParms, // 更新参数
  } = props;
  const userName = accountName12306 || account12306Name || account12306 || username;
  const actionThresholdParams = useRef({
    // 眨眼: 0.25, 0.30, 0.35, 0.40
    blinkThreshold: 0.25 + Math.floor(Math.random() * 4) * 0.05,
    // 张嘴: 0.30, 0.35, 0.40, 0.45
    mouthOpenThreshold: 0.30 + Math.floor(Math.random() * 4) * 0.05,
  });

  // 状态管理
  const [showTakePhotoButton, setShowTakePhotoButton] = useState(false);
  const [currentStep, setCurrentStep] = useState<ECurrentStep>(ECurrentStep.INITIAL);
  const [isVerifySuccess, setIsVerifySuccess] = useState(false);
  const isRecordingVideoRef = useRef(false);
  const [titanData, setTitanData] = useState<any>(null);
  // 提示词变化
  const [title, setTitle] = useState('');
  const [dangerTitle, setDangerTitle] = useState('');

  const [overlayText, setOverlayText] = useState<string | undefined>(undefined); // 添加蒙层文字状态

  // 错误状态管理
  const [failureType, setFailureType] = useState<VerifyFaceStep | null>(null); // 失败类型
  const [lastUploadResult, setLastUploadResult] = useState<any>(null); // 保存上传结果，用于分片重试
  const [finalData, setFinalData] = useState<any>(null); // 保存人脸数据用于重试
  // 对话框数据状态
  const [dialogInfo, setDialogInfo] = useState<any>();
  const lastErrorTimeRef = useRef<number>(0);
  lastErrorTimeRef.current = Date.now();
  const exParams = {
    errCode,
    actionThresholdParams: actionThresholdParams.current,
  }

  // 开启摄像头
  const cameraOn = useRef(false);
  // video 引用 - 重要
  const videoRef = useRef<HTMLVideoElement>(null);
  // 视频帧引用 - 重要
  const videoBuffer = useRef(VideoFrameBuffer.create());
  // 检测 frame 回调
  const onFrameRef = useRef<OnFrame | undefined>(undefined);
  // 上次视频时间引用 - 重要
  const lastVideoTime = useRef<number>(0);
  // 记录获取配置到采集完成的时间
  const getConfigTime = useRef<number>(0);
  // 采集开始时间
  const collectionStartTime = useRef<number>(0);

  // 标准化初始化函数
  const executeInitialization = async () => {
    try {
      const configResult = await executeIdentityConfig({
        userName,
        initToken,
        isAliyunTencent,
        certificateId,
        bizParamExtra,
        verifyType,
        isFaker,
        setIdentityConfig,
        setTitle,
      });

      if (!configResult.isSuccess) {
        throw new Error('初始化身份配置失败');
      }

      logSuccess('初始化身份配置成功');
      return configResult;
    } catch (error) {
      logError('初始化身份配置失败', error);
      setFailureType(VerifyFaceStep.identityConfig);
      setDialogInfo({
        ...failDialog,
        visible: true,
        content: '核验获取失败，请重试',
        title: '网络异常',
      });
    }
  };

  // 初始化
  useEffect(() => {
    getConfigTime.current = Date.now();
    setTitle('准备中...');

    executeInitialization();
    // 获取 Titan 数据，包括炫彩延时时长
    // execTitanData().then(
    //   (res) => {
    //     setTitanData(res);
    //   }
    // );
    return () => {
      cleanup();
    };
  }, []);

  // 恢复视频播放（针对setBrightness后视频被暂停的问题）
  const restoreVideoPlayback = async (): Promise<void> => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (video.paused && !video.ended) {
        await video.play();
        logSuccess('视频播放已恢复');
      }
    } catch (error) {
      logError('视频恢复失败:', error);
    }
  };

  // 开始摄像头的内部实现
  const startCameraInternal = async (): Promise<void> => {
    // 检查 videoRef 是否存在
    if (!videoRef.current) {
      const errorMsg = '摄像头不可用';
      setTitle(errorMsg);
      logSls('videoRefError', { error: errorMsg });
      return;
    }

    // 检测设备类型和方向
    videoRef.current.srcObject = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: videoRecordSize.height }, // 不要动，适配移动端
        height: { ideal: videoRecordSize.width }, // 不要动，适配移动端
        facingMode: 'user',
        frameRate: { ideal: 30 },
      },
    });

    cameraOn.current = true;

    // 添加超时和重试机制，针对微信小程序环境优化
    return new Promise((resolve, reject) => {
      const video = videoRef.current!;
      let isResolved = false;

      // 设置超时时间（微信环境下可能需要更长时间）
      const isWeChatEnv = isWeChatMiniProgramH5;
      const timeoutDuration = isWeChatEnv ? 12000 : 8000; // 微信环境12秒，其他8秒超时

      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          logSls('startCamera-loadeddata-timeout', {
            userAgent: navigator.userAgent,
            videoReadyState: video.readyState,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight
          });

          // 尝试检查视频是否实际可用
          if (video.readyState >= 2 || (video.videoWidth > 0 && video.videoHeight > 0)) {
            logSls('startCamera-fallback-success', {
              readyState: video.readyState,
              dimensions: `${video.videoWidth}x${video.videoHeight}`
            });
            resolve();
          } else {
            reject(new Error('视频加载超时，请检查网络连接或重试'));
          }
        }
      }, timeoutDuration);

      // 主要事件监听器 - loadeddata
      const onLoadedData = () => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          cleanup();
          resolve();
        }
      };

      // 备用事件监听器 - 针对微信环境的兼容性
      const onCanPlay = () => {
        if (!isResolved && video.readyState >= 3) {
          isResolved = true;
          clearTimeout(timeoutId);
          cleanup();
          logSls('startCamera-canplay-fallback', { readyState: video.readyState });
          resolve();
        }
      };

      const onLoadedMetadata = () => {
        if (!isResolved && video.videoWidth > 0 && video.videoHeight > 0) {
          // 给loadeddata一些额外时间，但也提供一个后备方案
          setTimeout(() => {
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeoutId);
              cleanup();
              logSls('startCamera-metadata-fallback', {
                dimensions: `${video.videoWidth}x${video.videoHeight}`
              });
              resolve();
            }
          }, 1000);
        }
      };

      const onError = (error: Event) => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          cleanup();
          logSls('startCamera-video-error', { error: error.toString() });
          reject(new Error('视频加载失败'));
        }
      };

      // 清理函数
      const cleanup = () => {
        video.removeEventListener('loadeddata', onLoadedData);
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('error', onError);
      };

      // 添加所有事件监听器
      video.addEventListener('loadeddata', onLoadedData, { once: true });
      video.addEventListener('canplay', onCanPlay, { once: true });
      video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
      video.addEventListener('error', onError, { once: true });
    });
  };
  // 带重试机制的摄像头启动函数（针对微信小程序优化）
  const startCamera = async (): Promise<void> => {
    const maxRetries = 1;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logSls('startCamera-attempt', {
          attempt,
          maxRetries,
          isWeChatEnvironment: isWeChatMiniProgramH5,
          userAgent: navigator.userAgent
        });

        await startCameraInternal();

        // 成功启动，记录日志并返回
        if (attempt > 1) {
          logSls('startCamera-retry-success', {
            successAttempt: attempt,
            totalAttempts: maxRetries
          });
        }
        return;

      } catch (error) {
        lastError = error as Error;
        logSls('startCamera-attempt-failed', {
          attempt,
          maxRetries,
          error: lastError.message,
          userAgent: navigator.userAgent
        });

        // 如果不是最后一次尝试，等待一段时间后重试
        if (attempt < maxRetries) {
          // 微信环境使用更长的延迟时间
          const baseDelay = isWeChatMiniProgramH5 ? 1500 : 1000;
          const maxDelay = isWeChatMiniProgramH5 ? 5000 : 3000;
          const retryDelay = Math.min(baseDelay * attempt, maxDelay);
          logSls('startCamera-retry-delay', {
            attempt,
            retryDelay,
            nextAttempt: attempt + 1
          });

          // 清理当前的视频流（如果存在）
          if (videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
          }

          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    // 所有重试都失败了
    logSls('startCamera-all-retries-failed', {
      maxRetries,
      finalError: lastError?.message,
      userAgent: navigator.userAgent
    });

    throw new Error(`摄像头启动失败，已重试${maxRetries}次。最后错误：${lastError?.message || '未知错误'}`);
  };

  const startTakePhoto = async () => {
    setShowTakePhotoButton(false);
    if (!videoRef.current) {
      const errorMsg = '请先授权摄像头权限';
      setTitle(errorMsg);
      logSls('startTakePhoto-error', { error: errorMsg });
      return;
    }
    try {
      // 复用capturePhoto中的拍照逻辑，但不进行人脸检测和裁剪
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d')!;

      // 设置canvas尺寸为视频尺寸
      tempCanvas.width = videoRef.current.videoWidth;
      tempCanvas.height = videoRef.current.videoHeight;

      // 水平翻转canvas以纠正镜像问题（复用capturePhoto的逻辑）
      tempCtx.save();
      tempCtx.scale(-1, 1);
      tempCtx.drawImage(videoRef.current, -tempCanvas.width, 0, tempCanvas.width, tempCanvas.height);
      tempCtx.restore();

      // 转换为base64
      const base64Data = tempCanvas.toDataURL('image/jpeg', 0.95);

      // 返回与normalFrame相同格式的数据
      const normalFrame = {
        frame: base64Data.split(',')[1], // 去掉data:image/jpeg;base64,前缀
        width: tempCanvas.width,
        height: tempCanvas.height,
      };

      console.log('📸 拍照成功', normalFrame);
      // 拍照成功后，停止摄像头
      cameraOn.current = false;
      cleanup();
      setTitle('请耐心等待');
      setCurrentStep(ECurrentStep.REQUESTING);
      const faceCode = normalFrame.frame;
      const params = {
        faceCode,
        userName,
        certificateId,
        verifyScene,
        isFaker,
        verifyType,
        exParams,
        pageType,
        certificateType,
        personName,
        personCountry,
        orderId,
        subOrderId,
      };

      const result = await executeFaceVerifyV2(params);
      setOverlayText(undefined);
      setIsVerifySuccess(result?.success);
      setCurrentStep(ECurrentStep.END);
      if (result?.isSuccess) {
        handleVerificationSuccess();
      } else {
        setTitle('核验失败，即将重新核验');
        for (let i = 3; i > 0; i--) {
          setOverlayText(`${i}`);
          await delay(1000);
        }
        setOverlayText(undefined);
        startVerification();
      }
    } catch (error) {
      console.error('📸 拍照失败:', error);
      cameraOn.current = false;
      cleanup();
    }
  }

  // 消息显示函数
  const showError = (message: string) => showMessage(message, 'error');

  const showMessage = (message: string, type: string = 'info') => {
    console.log(`[${type.toUpperCase()}] ${message}`);
  };

  // 清理资源
  const cleanup = () => {
    setTitle('');
    setDangerTitle('');
    cameraOn.current = false;
    stopCamera();
    stopFaceDetection(); // 停止面部动作检测
    logInfo('WebRTC cleanup');
  };

  // 通过 requestAnimationFrame 循环检测人脸
  const predictWebcam = () => {
    if (!cameraOn.current) {
      return;
    }

    let shouldContinue = true;

    try {
      // 检查关键依赖是否存在
      if (!videoRef.current || !videoBuffer.current) {
        cameraOn.current = false; // 暂停摄像头
        return;
      }

      // 在腾讯模式下，即使没有检测器也要继续（用于炫彩检测）
      if (!faceDetectorRef.current && !isTencent) {
        cameraOn.current = false; // 暂停摄像头
        return;
      }

      if (lastVideoTime.current !== videoRef.current.currentTime) {
        lastVideoTime.current = videoRef.current.currentTime || 0;

        let result;
        if (faceDetectorRef.current) {
          result = faceDetectorRef.current.detect(videoRef.current);
        } else if (isTencent && onFrameRef.current) {
          // 腾讯模式下，为炫彩检测提供帧数据
          result = { face: videoRef.current, message: undefined };
        }

        if (result) {
          try {
            const dangerTitleDom = document.querySelector('.danger-title-section') as HTMLElement;
            const titleDom = document.querySelector('.title-section') as HTMLElement;
            const containerDom = document.querySelector('.face-video-container') as HTMLElement;
            // action border 黄色
            // 人脸状态正确绿色

            if (result?.message !== undefined) {
              setDangerTitle(result.message);

              //  错误文案颜色
              if (dangerTitleDom) {
                dangerTitleDom.style.color = '#FF3333';
              }
              //  错误边框颜色
              if (containerDom) {
                containerDom.style.borderColor = '#FF6666';
              }
            } else {
              setDangerTitle('');
              if (titleDom) {
                titleDom.style.color = 'white';
              }
              let color = '#47B259'
              if (containerDom) {
                containerDom.style.borderColor = color;
              }
            }
          } catch (error) {
            // DOM更新失败不需要暂停预测
          }

          videoBuffer.current.addFrame(videoRef.current);
          onFrameRef.current?.(result?.message !== undefined ? result?.message : result?.face!);
        }
      }
    } catch (error) {

      // 智能错误降级逻辑
      const currentTime = Date.now();
      lastErrorTimeRef.current = currentTime;

      shouldContinue = false;
      cameraOn.current = false;

      console.warn('🔄 CPU 模式连续错误，切换到拍照兜底模式');
      modelLoadStateRef.current = ModelLoadState.FAILED;
      setCurrentStep(ECurrentStep.DETECTING);

      return;
    } finally {
      // 只有在没有严重错误时才继续下一帧
      if (shouldContinue && cameraOn.current) {
        window.requestAnimationFrame(() => predictWebcam());
      }
    }
  };
  // 采集数据，组装
  async function collect() {
    collectionStartTime.current = Date.now()
    // 0. 定时帧采集（如果配置了风险参数）
    let riskFrames: FaceDataParams['riskFrames'] = [];
    if (riskConfigParams && videoRef.current) {
      logInfo('开始定时帧采集', riskConfigParams);
      riskFrames = await captureExposureFrames(videoRef.current, riskConfigParams);
      logInfo(`定时帧采集完成 ${riskFrames.length} 帧`);
    }

    const capturedVideos: ActionFrame[] = [];
    // 动作检测序列，写死
    const actionIdList = [1, 2];
    for (const actionId of actionIdList) {
      const actionName = ACTION_MAP[actionId]?.name;
      setTitle(`请${actionName}`);

      let result;
      // 如果是腾讯模式且正在录制，则默认录制1秒符合需求
      if (isTencent && isRecordingVideoRef.current) {
        videoBuffer.current.clear();
        logInfo(`${actionName}录制`, `开始录制${actionName}动作，持续1秒`);

        // 录制1秒，每100ms采集一帧
        const recordingStartTime = Date.now();
        const recordingDuration = 3000;
        const frameInterval = 100; // 每100ms一帧

        while (Date.now() - recordingStartTime < recordingDuration) {
          if (videoRef.current) {
            videoBuffer.current.addFrame(videoRef.current);
          }
          await delay(frameInterval);
        }

        // 获取录制结果
        result = await videoBuffer.current.getFrames();
        logSuccess(`${actionName}录制`, `已完成${actionName}录制，请稍等`);
      } else {
        // 正常的动作检测模式 - 优化：立即检测，异步处理视频
        const actionResult = await detectAction(actionId, (frame, done) => {
          if (typeof frame === 'string') {
            logInfo(`${actionName}检测`, frame);
          } else if (!done) {
            Math.random() > 0.1 && logInfo(`${actionName}检测`);
          } else {
            logSls('actionCaptureSuccess', {
              startTime: collectionStartTime.current,
              endTime: Date.now(),
              duration: Date.now() - collectionStartTime.current,
              stage: `${actionName}动作采集`
            });
            logInfo(`${actionName}检测`, `已捕获${actionName}瞬间，立即进入下一个动作。动作采集耗时累计:${Date.now() - collectionStartTime.current}ms`);
          }
        });

        // 动作检测完成，立即进入下一个动作，视频处理异步进行
        result = actionResult.videoPromise;
      }

      // 异步处理视频数据，不阻塞下一个动作检测
      const processVideoAsync = async (videoPromise: Promise<VideoResult>) => {
        const processVideoStartTime = Date.now();
        try {
          const videoResult = await videoPromise;
          const base64Frame = (await blobToBase64(videoResult.blob))?.split(',')[1];

          // 更新对应动作的视频数据
          const actionIndex = capturedVideos.findIndex(v => v.action === actionId);
          if (actionIndex !== -1) {
            capturedVideos[actionIndex] = {
              ...capturedVideos[actionIndex],
              frame: base64Frame
            };
          }
          logInfo(`✅ ${actionName}视频处理完成，异步处理耗时:${Date.now() - processVideoStartTime}ms`);
          logSls('actionVideoProcessSuccess', {
            startTime: processVideoStartTime,
            endTime: Date.now(),
            duration: Date.now() - processVideoStartTime,
            stage: `${actionName}视频处理`
          });
          // debugVideoInfo(videoResult);
        } catch (error) {
          logError(`${actionName}视频处理`, `视频处理失败: ${error.message}`);
        }
      };

      // 先添加占位符，后续异步更新
      capturedVideos.push({
        action: actionId,
        count: 0,
        isVideo: true,
        frame: '', // 占位符，异步更新
      });
      // 异步处理视频，不阻塞流程
      processVideoAsync(result);
    }

    logInfo('采集视频数据如下：', capturedVideos);

    // 3. 活体检测（炫彩）
    setTitle('请合拢嘴巴，并保持不动');

    // 临时启用嘴巴验证
    // if (faceDetectorRef.current) {
    //   faceDetectorRef.current.setEnableMouthValidation(true);
    // }
    if (faceDetectorRef.current && modelLoadStateRef.current !== ModelLoadState.FAILED) {
      await new Promise<void>((resolve) => {
        const checkMouthClose = (frame: string | SingleFaceLandmarkerResult) => {
          if (typeof frame !== 'string' && faceDetectorRef.current) {
            // 复用检测器的方法
            if (faceDetectorRef.current.detectMouthClose(frame)) {
              logInfo('嘴巴合拢检测成功');
              resolve();
            }
          }
        };
        onFrameRef.current = checkMouthClose;
      });
    }

    // await delay(titanData?.dazzleDelayDuration || 0);
    const dazzleStartTime = Date.now();
    // 设置亮度并恢复视频播放
    await setBrightness(1);
    await restoreVideoPlayback(); // 恢复视频播放

    setCurrentStep(ECurrentStep.SHANING);
    logInfo('🔥 开始炫彩检测，将使用第一帧作为正常帧...');
    const { reflectFrames: reflectData, normalFrame } = await dazzle((frame) => {
      if (typeof frame === 'string') {
        logInfo('炫彩检测', frame);
      } else {
        logInfo('炫彩检测', '请保持不动');
      }
    });
    logInfo('🔥 炫彩检测完成，已获取正常帧', normalFrame, `炫彩帧采集耗时:${Date.now() - dazzleStartTime}ms`);
    logSls('dazzleSuccess', {
      startTime: dazzleStartTime,
      endTime: Date.now(),
      duration: Date.now() - dazzleStartTime,
      stage: '炫彩检测'
    });
    // 停止摄像头
    cleanup();
    setTitle('请耐心等待');
    const waitStartTime = Date.now();
    // 4. 检查视频处理是否完成
    const waitForVideos = async () => {
      while (true) {
        const unprocessedVideos = capturedVideos.filter(video => !video.frame);
        if (unprocessedVideos.length === 0) {
          break;
        }
        await delay(10);
      }
    };

    await waitForVideos()
    logInfo('视频处理后续等待耗时', `${Date.now() - waitStartTime}ms`);
    logSls('waitForVideosSuccess', {
      startTime: waitStartTime,
      endTime: Date.now(),
      duration: Date.now() - waitStartTime,
      stage: '视频处理后续等待耗时'
    });
    // 5. 收集核验数据
    // const newReflectFrames = transformReflectFrameData(reflectData);
    const newReflectFrames = reflectData || [];
    console.log('newReflectFrames', newReflectFrames)
    // 组装最终参数
    const finalData: FaceDataParams = {
      // 动作视频帧数据
      actionFrames: capturedVideos,
      // 颜色输入列表 - 需要从配置中获取
      colorInputList: colorInputList,
      // 反射帧数据（炫彩图片处理结果）
      reflectFrames: newReflectFrames,
      // 可选字段
      // cameraCheckData: undefined,
      // videoReport: undefined,
      reflectInfo: {
        width: (newReflectFrames[0] || {}).width,
        height: (newReflectFrames[0] || {}).height,
      },
      riskFrames,
      normalFrame,
    };
    logInfo('分片上传核验数据', finalData);
    // 保存数据用于重试
    setFinalData(finalData);
    return finalData;
  }
  // 核心 - 开始面部动作检测
  const startDetect = async () => {
    if (!videoRef.current) {
      const errorMsg = '请先授权摄像头权限';
      setTitle(errorMsg);
      logSls('startDetect-error', { error: errorMsg });
      return;
    }

    // 设置随机阈值到人脸检测器
    if (faceDetectorRef.current) {
      faceDetectorRef.current.setThresholds(
        actionThresholdParams.current.blinkThreshold,
        actionThresholdParams.current.mouthOpenThreshold
      );
      logInfo('动作检测阈值', `眨眼: ${actionThresholdParams.current.blinkThreshold}, 张嘴: ${actionThresholdParams.current.mouthOpenThreshold}`);
    }

    if (!faceDetectorRef.current && !isTencent) {
      // 如果模型还未加载完成，显示等待状态
      if (modelLoadStateRef.current === ModelLoadState.LOADING) {
        setTitle('准备中...');
        return;
      }

      // 模型加载失败，切换到兜底模式
      modelLoadStateRef.current = ModelLoadState.FAILED;
      setCurrentStep(ECurrentStep.DETECTING);
      logSls('startDetect-error', { error: '模型加载失败' });
      return;
    }

    // 显示当前使用的模型模式
    console.info(`🎯 使用 ${modelLoadStateRef.current} 模式进行人脸检测`);

    // 修改背景颜色为黑色
    // changeDomColor2Black();

    try {
      setCurrentStep(ECurrentStep.VERIFYING); // 进入验证状态

      // 启动或恢复人脸预测
      if (!startPredictWebcam) {
        predictWebcam();
        startPredictWebcam = true;
        logInfo('首次启动 predictWebcam');
      } else {
        const resumed = await startFaceDetection();
        if (resumed) {
          logInfo('人脸检测恢复成功');
          predictWebcam();
        } else {
          onError?.({
            message: '核验失败，请重试',
          });
        }
      }
      if (isTencent && !isRecordingVideoRef.current && modelLoadStateRef.current === ModelLoadState.FAILED) {
        setTitle(`请点击录制按钮`);
        return;
      }
      if (isAliyunTencent && modelLoadStateRef.current === ModelLoadState.FAILED) {
        setTitle('请拍照核验');
        setShowTakePhotoButton(true);
        return;
      }
      const collectedFinalData = await collect();

      // 这里是采集结束时间
      const collectionEndTime = Date.now();
      const collectionDuration = collectionEndTime - collectionStartTime.current
      // 上报采集时间统计
      if (collectionDuration > 0) {
        logSls('collectionTimeStats', {
          startTime: collectionStartTime.current,
          endTime: collectionEndTime,
          duration: collectionDuration,
          stage: 'success'
        });
        logInfo('采集完成，耗时:', `${collectionDuration}ms`);
      }

      // 5. 上传核验数据
      setCurrentStep(ECurrentStep.REQUESTING);
      const chunkUploadParams: UploadAndVerifyFaceParams = {
        finalData: collectedFinalData,
        initToken,
        userName,
        certificateId,
        verifyScene,
        orderId,
        subOrderId,
        account12306,
        bizParamExtra,
        isFaker,
        verifyType,
        exParams
      };
      const uploadAndVerifyStartTime = Date.now();
      const uploadResult = await uploadAndVerifyFaceData(chunkUploadParams);
      logSls('uploadAndVerifyFaceData', {
        startTime: uploadAndVerifyStartTime,
        endTime: Date.now(),
        duration: Date.now() - uploadAndVerifyStartTime,
        stage: 'uploadAndVerifyFaceData'
      });
      setOverlayText(undefined);
      setIsVerifySuccess(uploadResult?.success);
      setCurrentStep(ECurrentStep.END);
      logInfo('分片上传核验数据结果', uploadResult);

      if (uploadResult?.isSuccess) {
        handleVerificationSuccess();
      } else {
        if (collectionDuration > 0) {
          logSls('collectionTimeStats', {
            startTime: collectionStartTime.current,
            endTime: collectionEndTime,
            duration: collectionDuration,
            stage: 'upload_failed',
            uploadResultType: uploadResult?.type
          });
          logInfo('采集完成但上传失败，耗时:', `${collectionDuration}ms`);
        }

        // 根据错误类型设置失败类型
        if (uploadResult?.type === VerifyFaceStep.chunkUploadProcess) {
          // setLastUploadResult(uploadResult); // 保存上传结果用于分片重试
          onError?.({
            message: '网络异常请重试',
          })
          return;
        }
        setFailureType(uploadResult?.type || null);
        setTitle('核验失败，点击重新核验');
        setCurrentStep(ECurrentStep.ERR)
        setDialogInfo({
          ...failDialog,
          visible: true,
          content: uploadResult?.message || failDialog.content,
          title: uploadResult?.title || failDialog.title
        })
      }
    } catch (error) {
      setOverlayText(undefined);
      setIsVerifySuccess(false);
      setCurrentStep(ECurrentStep.ERR);
      logError('faceVerifyV3 接口调用失败:', error);

      // 异常时的采集时间统计
      const collectionEndTime = Date.now();
      const collectionDuration = collectionStartTime.current > 0 ? collectionEndTime - collectionStartTime.current : 0;

      if (collectionDuration > 0) {
        logSls('collectionTimeStats', {
          startTime: collectionStartTime.current,
          endTime: collectionEndTime,
          duration: collectionDuration,
          stage: 'error',
          error: error?.message
        });
        logInfo('采集异常终止，耗时:', `${collectionDuration}ms`);
      }

      // 设置为faceVerifyV3失败
      setFailureType(VerifyFaceStep.faceVerifyV3);
      setTitle('核验失败，点击重新核验');
      onError?.({
        message: '核验失败，请重试',
      });

      logSls('OtherError', {
        time: Date.now() - getConfigTime.current,
        response: error.message,
      });
      // 不再自动调用onError，显示重试按钮
    }
  };
  // 开始录制视频，录制也走人脸检测那一套（虽然录制是因为检测不了）
  const startRecordVideo = () => {
    isRecordingVideoRef.current = true;
    startDetect();
  };

  // 随机 0-999 数字 - 需要补零为三位数字
  const randomNumber = () => {
    const num = Math.floor(Math.random() * 1000);
    return num.toString().padStart(3, '0');
  };

  // 动态压缩图片到指定大小
  const compressImageToSize = (canvas: HTMLCanvasElement, maxSizeKB: number = 20): string => {
    let quality = 1;
    let base64Data: string;
    let imageSizeKB: number;

    do {
      base64Data = canvas.toDataURL('image/jpeg', quality);
      // 计算base64大小（字节）
      const base64Content = base64Data.split(',')[1];
      const base64Size = base64Content.length * 3 / 4;
      imageSizeKB = base64Size / 1024;
      if (imageSizeKB > maxSizeKB && quality > 0.1) {
        quality -= 0.1; // 每次降低5%质量
      }
    } while (imageSizeKB > maxSizeKB && quality > 0.1);

    logInfo('图片压缩', `最终大小: ${imageSizeKB.toFixed(2)}KB, 质量: ${quality.toFixed(2)}`);
    return base64Data;
  };
  // 炫彩，返回炫彩桢和正常帧
  const dazzle = async (onFrame: OnFrame): Promise<{ reflectFrames: ReflectFrame[], normalFrame: any }> => {
    let dazzling = true;
    const reflectFrames: ReflectFrame[] = [];
    let normalFrame: any = null; // 🚀 保存第一帧作为正常帧
    onFrameRef.current = (frame) => {
      if (dazzling && typeof frame === 'object') {
        const isFirstFrame = reflectFrames.length === 0;

        let base64, mouthCenter, imageWidth, imageHeight, originalFrame, originalWidth, originalHeight;

        // 检查是否是HTMLVideoElement（腾讯模式）
        if (frame instanceof HTMLVideoElement) {
          // 腾讯模式：直接从视频元素截取图片，不依赖人脸检测器
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d')!;

          canvas.width = frame.videoWidth;
          canvas.height = frame.videoHeight;

          // 水平翻转canvas以纠正镜像问题
          ctx.save();
          ctx.scale(-1, 1);
          ctx.drawImage(frame, -canvas.width, 0, canvas.width, canvas.height);
          ctx.restore();

          // 动态压缩反射帧到20KB以下
          base64 = compressImageToSize(canvas, 20);

          // 动态压缩正常帧到20KB以下
          const compressedOriginalFrame = compressImageToSize(canvas, 20);
          originalFrame = compressedOriginalFrame.split(',')[1];
          originalWidth = canvas.width;
          originalHeight = canvas.height;
          imageWidth = canvas.width;
          imageHeight = canvas.height;

          // 使用图片中心作为嘴部坐标
          mouthCenter = {
            x: canvas.width / 2,
            y: canvas.height / 2
          };
        } else {
          // 正常模式：使用capturePhoto函数
          const captureResult = capturePhoto(frame, isFirstFrame);
          base64 = captureResult.base64;
          mouthCenter = captureResult.mouthCenter;
          imageWidth = captureResult.imageWidth;
          imageHeight = captureResult.imageHeight;
          originalFrame = captureResult.originalFrame;
          originalWidth = captureResult.originalWidth;
          originalHeight = captureResult.originalHeight;
        }

        // 🚀 如果是第一帧，保存为正常帧
        if (isFirstFrame && originalFrame) {
          normalFrame = {
            frame: originalFrame,
            width: originalWidth,
            height: originalHeight,
          };
        }

        // 将脸部图片转换为base64并添加到结果中
        reflectFrames.push({
          frame: base64.split(',')[1],
          time: Number(`${Date.now()}${randomNumber()}`),
          x: mouthCenter!.x,
          y: mouthCenter!.y,
          width: imageWidth,
          height: imageHeight,
        });
      }
      onFrame(frame);
    };
    for (const color of colorSeqArr) {
      const [a, r, g, b] = color;
      // 直接操作DOM修改背景色，提升实时性
      const container = document.querySelector('.face-verification-container') as HTMLElement;
      if (container) {
        container.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
        container.style.opacity = '1';
      }

      // 使用requestAnimationFrame和performance.now()保证时间精准
      const startTime = performance.now();
      const targetDuration = +colorUnit || 120;

      await new Promise<void>((resolve) => {
        function checkTime() {
          const elapsed = performance.now() - startTime;
          if (elapsed >= targetDuration) {
            resolve();
          } else {
            requestAnimationFrame(checkTime);
          }
        }
        requestAnimationFrame(checkTime);
      });
    }

    dazzling = false;

    const maxFrames = Math.floor((colorUnit * colorSeqArr.length) / 40) || 30;
    let processedFrames = reflectFrames;

    if (reflectFrames.length > maxFrames) {
      // processedFrames = uniformlySampleFrames(reflectFrames, maxFrames);
      processedFrames = simpleUniformSample(reflectFrames, maxFrames);
    }
    logSls('dazzle', {
      ori_count: reflectFrames.length,
      new_count: processedFrames.length,
      maxFrames,
    });

    return {
      reflectFrames: processedFrames.map((frame) => ({
        ...frame,
        x: Math.round(frame.x),
        y: Math.round(frame.y),
      })),
      normalFrame,
    };
  };

  const firstImageResolution = { width: 0, height: 0 };
  const firstFaceArea = { minX: 0, minY: 0, maxX: 0, maxY: 0 }; // 缓存第一张图片的人脸区域坐标
  // 捕获帧
  const capturePhoto = (
    face: SingleFaceLandmarkerResult,
    needOriginalFrame: boolean = false
  ): {
    base64: string;
    mouthCenter?: { x: number; y: number }; // 嘴部中心点坐标，以裁剪、缩放后的照片为坐标系！！！
    // tempCanvasDataUrl: string; // 原始视频帧的base64数据
    // faceCanvasDataUrl: string; // 裁剪后的人脸图片base64数据
    originalFrame?: string; // 未裁剪的原始帧base64数据
    originalWidth?: number; // 原始帧宽度
    originalHeight?: number; // 原始帧高度
    faceArea: { minX: number; minY: number; maxX: number; maxY: number }; // 人脸区域信息
    imageWidth: number;
    imageHeight: number;
  } => {
    // 创建临时canvas来捕获照片
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d')!;

    tempCanvas.width = videoRef.current!.videoWidth;
    tempCanvas.height = videoRef.current!.videoHeight;

    // 绘制嘴部坐标
    // const mouthPoints = faceDetectorRef.current!.detectMouthPoints(face);

    // 水平翻转canvas以纠正镜像问题
    tempCtx.save(); // 保存当前状态
    tempCtx.scale(-1, 1); // 水平翻转
    tempCtx.drawImage(videoRef.current!, -tempCanvas.width, 0, tempCanvas.width, tempCanvas.height); // 从负宽度开始绘制
    tempCtx.restore(); // 恢复原始状态

    // 如果是第一张图片，检测人脸区域并缓存；否则使用缓存的坐标
    let minX: number, minY: number, maxX: number, maxY: number;
    if (firstImageResolution.width === 0 && firstImageResolution.height === 0) {
      // 第一张图片，检测人脸区域并缓存
      const faceArea = faceDetectorRef.current?.detectFaceArea(face);
      minX = faceArea.minX;
      minY = faceArea.minY;
      maxX = faceArea.maxX;
      maxY = faceArea.maxY;

      // 缓存第一张图片的人脸区域坐标
      firstFaceArea.minX = minX;
      firstFaceArea.minY = minY;
      firstFaceArea.maxX = maxX;
      firstFaceArea.maxY = maxY;
    } else {
      // 后续图片，直接使用缓存的坐标
      minX = firstFaceArea.minX;
      minY = firstFaceArea.minY;
      maxX = firstFaceArea.maxX;
      maxY = firstFaceArea.maxY;
    }

    // 由于canvas进行了水平翻转，需要调整人脸区域坐标
    const canvasWidth = tempCanvas.width;
    const adjustedMinX = canvasWidth - maxX; // 翻转后的x坐标

    // 创建新的canvas来存储裁剪后的脸部图片
    const faceCanvas = document.createElement('canvas');
    const faceCtx = faceCanvas.getContext('2d')!;

    faceCanvas.width = maxX - minX;
    faceCanvas.height = maxY - minY;

    // 从翻转后的canvas裁剪脸部区域
    faceCtx.drawImage(
      tempCanvas,
      adjustedMinX,
      minY,
      maxX - minX,
      maxY - minY, // 源图像裁剪区域
      0,
      0,
      maxX - minX,
      maxY - minY // 目标canvas绘制区域
    );

    const scaledFaceCanvas = document.createElement('canvas');
    const scaledFaceCtx = scaledFaceCanvas.getContext('2d')!;
    scaledFaceCtx.imageSmoothingEnabled = true;
    scaledFaceCtx.imageSmoothingQuality = 'high'; // 可选值: 'low', 'medium', 'high'

    // 计算当前人脸区域的实际尺寸
    const currentFaceWidth = maxX - minX;
    const currentFaceHeight = maxY - minY;

    // 固定高度为184，宽度按比例计算
    const targetHeight = 184;
    const targetWidth = Math.round((currentFaceWidth / currentFaceHeight) * targetHeight);

    // 如果是第一张图片，记录尺寸；否则使用第一张图片的尺寸
    if (firstImageResolution.width === 0 && firstImageResolution.height === 0) {
      firstImageResolution.width = targetWidth;
      firstImageResolution.height = targetHeight;
    }

    // 使用第一张图片的尺寸
    scaledFaceCanvas.width = firstImageResolution.width;
    scaledFaceCanvas.height = firstImageResolution.height;

    // 绘制并缩放到固定尺寸
    scaledFaceCtx.drawImage(faceCanvas, 0, 0, firstImageResolution.width, firstImageResolution.height);

    // 获取原始视频中的嘴部中心点坐标
    const mouthCenter = faceDetectorRef.current!.detectMouthCenter(face);
    // const points = faceDetectorRef.current!.detectMouthPoints(face);
    // 坐标转换：原始视频坐标 -> 翻转后坐标 -> 裁剪后坐标 -> 缩放后坐标
    mouthCenter.x = canvasWidth - mouthCenter.x; // 翻转后的x坐标
    mouthCenter.x = mouthCenter.x - adjustedMinX; // 裁剪后的x坐标
    mouthCenter.y = mouthCenter.y - minY; // 裁剪后的y坐标
    // 缩放到固定尺寸的坐标
    mouthCenter.x = (mouthCenter.x * firstImageResolution.width) / currentFaceWidth;
    mouthCenter.y = (mouthCenter.y * firstImageResolution.height) / currentFaceHeight;

    let originalFrameData: { originalFrame?: string; originalWidth?: number; originalHeight?: number } = {};
    if (needOriginalFrame) {
      // 动态压缩正常帧到20KB以下
      const compressedOriginalFrame = compressImageToSize(tempCanvas, 20);
      originalFrameData = {
        originalFrame: compressedOriginalFrame.split(',')[1],
        originalWidth: tempCanvas.width,
        originalHeight: tempCanvas.height,
      };
    }

    return {
      // 动态压缩反射帧到20KB以下
      base64: compressImageToSize(scaledFaceCanvas, 20),
      mouthCenter: mouthCenter,
      // tempCanvasDataUrl: tempCanvas.toDataURL('image/jpeg', 1),
      // faceCanvasDataUrl: scaledFaceCanvas.toDataURL('image/jpeg', 1),
      ...originalFrameData,
      faceArea: { minX, minY, maxX, maxY },
      imageWidth: firstImageResolution.width,
      imageHeight: firstImageResolution.height,
    };
  };
  // 统一检测动作
  const detectAction = async (actionId: number, onFrame: (frame: string | SingleFaceLandmarkerResult, done: boolean) => void): Promise<{
    detected: boolean;
    videoPromise: Promise<VideoResult>;
  }> => {
    let actionDetected = false;
    let totalFramesAfterDetection = 0; // 检测到后的帧计数
    const continueFrames = 10; // 检测到动作后继续采集10帧（约0.3秒@30fps）
    let resolved = false;
    return new Promise((resolve, _) => {
      onFrameRef.current = (frame) => {
        try {
          if (resolved) {
            return;
          }
          if (typeof frame === 'string') {
            // do nothing.
          } else if (!actionDetected) {
            actionDetected = faceDetectorRef.current![detectFunctionMap[actionId]](frame);
          } else {
            // 已经检测到动作，继续采集几帧
            totalFramesAfterDetection++;

            // 采集够足够的帧后，获取视频
            if (totalFramesAfterDetection >= continueFrames) {
              resolved = true;
              onFrame(frame, true);
              const videoPromise = videoBuffer.current.getFrames();
              // 立即清空缓冲区，为下一个动作做准备
              videoBuffer.current.clear();
              resolve({
                detected: true,
                videoPromise: videoPromise
              });
            }
          }
        } catch (error) { }
      };
    });
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current!.srcObject = null;
    }
  };

  const debugVideoInfo = (info: VideoResult) => {
    const url = URL.createObjectURL(info.blob);
    logInfo('动作视频下载地址：', url, info.duration, info.frameCount, info.fps);
    logSls('debugVideoInfo', {
      // blob: info.blob,
      initToken,
      duration: info.duration,
      frameCount: info.frameCount,
      fps: info.fps,
    });
  };

  // 停止面部动作检测
  const stopFaceDetection = () => {
    if (faceDetectorRef.current) {
      faceDetectorRef.current.pause();
    }
  };

  // 恢复人脸检测
  const startFaceDetection = async () => {
    if (!faceDetectorRef.current) {
      logError('人脸检测器未初始化，无法恢复');
      return false;
    }

    try {
      const resumed = await faceDetectorRef.current.resume();
      if (resumed) {
        logInfo('人脸检测已恢复');
        return true;
      } else {
        logError('人脸检测恢复失败');
        return false;
      }
    } catch (error) {
      logError('恢复人脸检测时发生错误:', error);
      return false;
    }
  };

  // 开始验证函数
  const startVerification = async () => {
    if (!identityConfig) {
      return;
    }
    setCurrentStep(ECurrentStep.DETECTING);
    // 环境检测
    runCompatibilityTest()
      .then(async () => {
        logSuccess('环境检测成功');
        setTitle('')
        try {
          await startCamera();
          if (isModelReady) {
            await startDetect();
          }
        } catch (error) {
          logError('启动摄像头失败:', error);
          setCurrentStep(ECurrentStep.INITIAL);
          showError('启动摄像头失败');
          logSls('startCameraError', { error: error?.message });
          onError?.({
            message: '启动摄像头失败',
          });
        }
      })
      .catch((error) => {
        setCurrentStep(ECurrentStep.INITIAL);
        logError('环境检测失败:', error);
        logSls('environmentTestError', { error: error?.message });
        onError?.({
          message: '环境检测失败',
        });
      });
  };

  // 获取config配置后开始刷脸
  useEffect(() => {
    if (identityConfig && isModelReady) {
      // 这里开始计时统计采集信息花费时间
      collectionStartTime.current = Date.now();
      logInfo('开始采集时间统计', collectionStartTime.current);
      startVerification();
    }
  }, [identityConfig, isModelReady]);

  // 重试策略映射
  const createRetryStrategies = () => {
    const baseParams = {
      userName,
      certificateId,
      verifyScene,
      orderId: orderId || '',
      subOrderId: subOrderId || '',
      initToken,
      bizParamExtra: bizParamExtra || '',
      verifyType: verifyType || '',
      isFaker: isFaker || false,
    };

    return {
      [VerifyFaceStep.deleteHistoryFeature]: {
        title: '正在重试...',
        execute: () => executeDeleteHistoryFeature(baseParams),
        nextStep: () => continueFromDataEncoding(),
        checkResult: true,
        isAsync: false, // 同步重试，可以直接处理结果
      },
      [VerifyFaceStep.dataEncoding]: {
        title: '正在重试...',
        execute: () => continueFromDataEncoding(),
        nextStep: null,
        checkResult: true,
        isAsync: false, // 同步重试，可以直接处理结果
      },
      [VerifyFaceStep.chunkUploadProcess]: {
        title: '正在重试...',
        execute: () => retryFailedChunks(),
        nextStep: null,
        checkResult: true,
        isAsync: false, // 同步重试，可以直接处理结果
      },
      [VerifyFaceStep.faceVerifyV3]: {
        title: '正在重试...',
        execute: () => restartWithNewToken(),
        nextStep: null,
        checkResult: true,
        isAsync: true, // 异步重试，通过状态变化触发后续流程
      },
      [VerifyFaceStep.identityConfig]: {
        title: '正在重试...',
        execute: () => restartIdentityConfig(),
        nextStep: null,
        checkResult: true,
        isAsync: true, // 异步重试，通过状态变化触发后续流程
      },
    };
  };

  // 从数据编码步骤继续执行后续流程
  const continueFromDataEncoding = async () => {
    if (!finalData) {
      return restartWithNewToken()
    }

    // 第二步：数据编码和分片
    const encodingResult = await executeDataEncodingAndChunking({
      finalData,
      initToken,
      chunkSize: 100 * 1024,
      userName,
      certificateId,
    });

    if (!encodingResult.isSuccess) {
      return encodingResult
    }

    const { chunks = [] } = encodingResult;

    // 第三步：并发上传分片
    const uploadParams = {
      account12306: userName,
      certificateId,
      orderId: orderId || '',
      subOrderId: subOrderId || '',
      verifyScene,
    };

    const uploadResult = await executeConcurrentChunkUpload({
      chunks,
      uploadParams,
      uploadOptions: {},
      maxConcurrent: 6,
      userName,
      certificateId,
      verifyScene,
      orderId: orderId || '',
      subOrderId: subOrderId || '',
      verifyType: verifyType || '',
    });

    if (!uploadResult.isSuccess) {
      return uploadResult
    }

    // 第四步：调用核验接口
    const verificationResult = await executeFaceVerification({
      userName,
      initToken,
      verifyScene,
      certificateId,
      chunks,
      orderId: orderId || '',
      subOrderId: subOrderId || '',
      bizParamExtra: bizParamExtra || '',
      verifyType: verifyType || '',
      isFaker: isFaker || false,
      exParams
    });

    if (!verificationResult.isSuccess) {
      return verificationResult;
    }

    return { isSuccess: true, response: verificationResult.response };
  };

  // 重试失败的分片
  const retryFailedChunks = async () => {
    if (!lastUploadResult?.failedChunks) {
      // 没有分片失败的直接调用核验接口
      const verificationResult = await executeFaceVerification({
        userName,
        initToken,
        verifyScene,
        certificateId,
        chunks: lastUploadResult.chunks,
        orderId: orderId || '',
        subOrderId: subOrderId || '',
        bizParamExtra: bizParamExtra || '',
        verifyType: verifyType || '',
        isFaker: isFaker || false,
        exParams,
      });

      if (!verificationResult.isSuccess) {
        return verificationResult;
      }

      return { isSuccess: true, response: verificationResult.response };
    }

    const retryResult = await retryUploadAndVerifyFaceData(
      lastUploadResult,
      userName,
      initToken,
      verifyScene,
      certificateId,
      orderId || '',
      subOrderId || '',
      bizParamExtra || '',
      verifyType || '',
      isFaker || false,
      exParams,
    );

    if (!retryResult.isSuccess) {
      return retryResult;
    }

    return { isSuccess: true, response: retryResult.response };
  };

  // 重新获取Token并重启流程
  const restartWithNewToken = async () => {
    // 1. 先获取 initToken
    const initResult = await executeIdentityInit(props);

    if (!initResult.isSuccess) {
      return initResult;
    }

    const { initToken: newInitToken, verifyType: newVerifyType, collectType } = initResult;

    // 更新 initToken 和相关参数
    const updatedInitToken = newInitToken || initToken;
    const updatedIsAliyunTencent = (newVerifyType === VerifyTypeType.aliyun) && (collectType === VerifyTypeType.tencent);
    // 更新当前页面的数据
    updateParms({
      initToken: updatedInitToken,
      isAliyunTencent: updatedIsAliyunTencent,
      verifyType: newVerifyType,
      collectType
    })

    // 2. 重新获取身份配置
    const configResult = await restartIdentityConfig({
      updatedInitToken,
      updatedIsAliyunTencent,
      newVerifyType
    });

    return configResult
  };

  // 重新获取Token并重启流程
  const restartIdentityConfig = async (params?) => {
    const {
      updatedInitToken,
      updatedIsAliyunTencent,
      newVerifyType
    } = params || {};
    const _InitToken = updatedInitToken || initToken;
    const _isAliyunTencent = updatedIsAliyunTencent || isAliyunTencent;

    // 2. 重新获取身份配置
    const configResult = await executeIdentityConfig({
      userName,
      initToken: _InitToken,
      isAliyunTencent: _isAliyunTencent,
      certificateId,
      bizParamExtra,
      verifyType: newVerifyType || verifyType,
      isFaker,
      setIdentityConfig,
      setTitle,
    });

    if (!configResult.isSuccess) {
      return configResult;
    }

    // 成功后清理状态并重置当前步骤
    setFailureType(null);
    setCurrentStep(ECurrentStep.INITIAL);

    return { isSuccess: true };
  };

  // 统一的成功处理函数
  const handleVerificationSuccess = () => {
    setCurrentStep(ECurrentStep.END);
    setIsVerifySuccess(true);
    setFailureType(null);
    setLastUploadResult(null);
    setTitle('核验成功');
    onSuccess?.()
  };

  // 统一的重试处理函数
  const handleRetry = async () => {
    if (!failureType) return;

    setCurrentStep(ECurrentStep.INITIAL);

    try {
      const strategies = createRetryStrategies();
      const strategy = strategies[failureType];

      if (!strategy) {
        throw new Error(`未知的失败类型: ${failureType}`);
      }

      // 设置重试标题
      setTitle(strategy.title);

      logInfo(`开始执行重试策略: ${failureType}`, strategy.title);

      // 执行重试策略
      const executeResult = await strategy.execute();

      logInfo(`handleRetry loading: ${failureType}`, executeResult);

      // 统一的失败处理函数
      const handleStepFailure = (data?: { type?: VerifyFaceStep; message?: string, title?: string }) => {
        const { type, message, title } = data || {};
        if (type === VerifyFaceStep.chunkUploadProcess) {
          // setLastUploadResult(executeResult); // 保存上传结果用于分片重试
          onError?.({
            message: '网络异常请重试',
          })
          return
        }
        setCurrentStep(ECurrentStep.ERR)
        setFailureType(type || null);
        setTitle('核验失败，点击重新核验');
        setDialogInfo({
          ...failDialog,
          visible: true,
          content: message || failDialog.content,
          title: title || failDialog.title
        });
      };

      if (strategy.checkResult) {
        const { isSuccess, type, message, title } = executeResult || {};
        // 处理失败
        if (executeResult && !isSuccess) {
          handleStepFailure({ type, message, title });
          return
        }
      }

      // 如果有下一步且当前步骤成功，继续执行下一步
      if (strategy.nextStep) {
        logInfo(`当前步骤执行成功，继续执行下一步流程: ${failureType}`);
        const nextStepResult = await strategy.nextStep();

        // 校验下一步骤的执行结果
        if (nextStepResult && !nextStepResult.isSuccess) {
          handleStepFailure({ type: nextStepResult.type, message: nextStepResult?.message, title: nextStepResult?.title });
          return;
        }
      }

      // 根据重试策略类型处理结果
      if (strategy.isAsync) {
        // 异步重试（如重新获取Token），通过状态变化触发后续流程
        // restartWithNewToken已经设置了相应状态，等待useEffect触发新的验证流程
        logInfo('异步重试完成，等待重新验证流程启动');
        setFailureType(null);
        setLastUploadResult(null);
      } else {
        // 同步重试，直接处理成功结果
        handleVerificationSuccess();
      }

    } catch (error) {
      // 处理失败结果
      setCurrentStep(ECurrentStep.END);
      setIsVerifySuccess(false);
      setTitle('重试失败，点击重新核验');

      logError('重试失败:', error);
      logSls('retryError', {
        failureType,
        error: error?.message,
        time: Date.now(),
      });
    } finally {
    }
  };

  function onButtonClick(dataset) {
    switch (dataset.action) {
      case 'handleRetry':
        setDialogInfo((pre) => ({
          ...pre,
          visible: false
        }));
        handleRetry();
        break;
      default:
        setDialogInfo((pre) => ({
          ...pre,
          visible: false
        }));
        // 根据当前状态决定调用成功还是失败回调
        if (isVerifySuccess) {
          onSuccess?.();
        } else {
          onError?.();
        }
        break;
    }
  }

  const showFaceSection = currentStep === ECurrentStep.INITIAL || currentStep === ECurrentStep.REQUESTING || currentStep === ECurrentStep.ERR || currentStep === ECurrentStep.END;

  return (
    <View x-class={{
      'face-verification-container': true,
      'no-titlebar': showCommonBack
    }}>
      {/* title */}
      <View x-if={!dangerTitle} className="title-section">
        {title}
      </View>
      <View x-if={dangerTitle} className="danger-title-section title-section">
        {dangerTitle}
      </View>
      {/* 中央人脸插图 */}
      <View className="face-section">
        <View
          className="face-illustration"
          x-if={showFaceSection}>
          {/* 准备中显示人头图标 */}
          <View className="loading-overlay">
            <Image
              resizeMode="contain"
              mode="aspectFit"
              className="default-image"
              aria-hidden={true}
              source={{
                uri: currentStep === ECurrentStep.INITIAL ? INITIAL_ICON : REQUESTING_ICON,
              }}
            />
          </View>

        </View>
        <View x-class={{
          'video-dom': true,
          'show': !showFaceSection
        }} >
          <View className="face-video-container">
            <video ref={videoRef} className="face-video" autoPlay muted playsinline webkit-playsinline />
            {/* 人脸框 */}
            <View className="face-video-illustration">
              <Image
                resizeMode="contain"
                mode="aspectFit"
                className="illustration-image"
                aria-hidden={true}
                source={{
                  uri: 'https://gw.alicdn.com/imgextra/i2/O1CN01Bkzayt24MirrXEfLN_!!6000000007377-2-tps-1000-1000.png',
                }}
              />
            </View>
            {/* 动作间蒙层提示 */}
            <View className="action-overlay" x-if={overlayText}>
              <View className="overlay-content">
                <View className="overlay-text">{overlayText}</View>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* 底部按钮 */}
      <View className="bottom-section">
        {/* <View x-if={currentStep === ECurrentStep.END} className="action-button" onClick={()=>{
          isVerifySuccess ? onSuccess?.() : onError?.()
        }}>
          返回
        </View> */}
        <View
          x-if={modelLoadStateRef.current === ModelLoadState.FAILED && isAliyunTencent && showTakePhotoButton}
          className="action-button"
          onClick={startTakePhoto}>
          点我拍照
        </View>
        <View
          x-if={modelLoadStateRef.current === ModelLoadState.FAILED && isTencent && !isRecordingVideoRef.current}
          className="action-button"
          onClick={startRecordVideo}
        >
          点我录制
        </View>
      </View>
      {/* 测试按钮 */}
      {/* <View className="bottom-section">
        <View className="action-button" onClick={()=>{
          onSuccess?.()
        }}>
           点我成功
        </View>
      </View> */}
      <Dialog x-if={dialogInfo && dialogInfo.visible} {...dialogInfo} onButtonClick={onButtonClick} />
    </View>
  );
}
