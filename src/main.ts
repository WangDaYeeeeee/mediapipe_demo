import { FaceDetectionResult, FaceDetector, SingleFaceLandmarkerResult } from "./face_detection";
import { VideoFrameBuffer } from "./video_buffer";
import { showNotification } from "./notification";

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
  new FaceVerification();
});

interface UIState {
  readonly tipMessage?: string;
}

type VerificationStep = 'preparing' | 'error' | 'detecting_blink' | 'detecting_mouth_open' | 'dazzling' | 'done';

type OnFrame = (frame: string | SingleFaceLandmarkerResult) => void;

interface ReflectDataSuccess {
  readonly colorData: "1 120 3 2 3 3 1 1 ;ejEHAAMAAAAAAAAAeAAAAAAAAAD9D5BoAAAAAHYQBQAAAAAAAAAATOY1h/Ifv0by5jWH8gMAAAACAAAAAwAAAAUAAAAFAAAABQAAAAUAAAAFAAAABQAAAAUAAAAFAAAABQAAAAUAAAAFAAAABQAAAAUAAAAFAAAABQAAAAUAAAA=;5864ec2c19c7136fb09a1c7f6909cf3a";
  readonly colorList: [
    "[0,0,0,76]", "[115,26,67,159]", "[230,53,135,242]", "[230,53,135,242]", "[230,53,135,242]", "[230,53,135,242]",
    "[31,191,70,242]", "[31,191,70,242]", "[31,191,70,242]", "[230,53,135,242]", "[230,53,135,242]", "[230,53,135,242]",
    "[230,53,135,242]", "[230,53,135,242]", "[115,26,67,159]", "[0,0,0,76]", "[204,204,204,17]",
  ];
  reflectFrames: ReflectFrame[];
}

interface ReflectFrame {
  readonly frame: string;
  readonly uncroppedFrame: string;
  readonly time: number;
  readonly x: number;
  readonly y: number;
}

const videoSize = { width: 480, height: 640 };

class FaceVerification {
  private video!: HTMLVideoElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private restartBtn!: HTMLButtonElement;
  private tipArea!: HTMLDivElement;
  private resultArea!: HTMLDivElement;
  private progressIndicator!: HTMLDivElement;
  // private colorBackground!: HTMLDivElement;

  private faceDetector: FaceDetector | undefined;
  private videoBuffer = VideoFrameBuffer.create();
  private onFrame: OnFrame | undefined;
  private cameraOn: boolean = false;
  private lastVideoTime: number = 0;

  private updateUI(step: VerificationStep, state: UIState): void {
    if (!!state.tipMessage) {
      this.tipArea.textContent = state.tipMessage;
    }

    switch (step) {
      case 'preparing':
        this.restartBtn.disabled = true;
        this.progressIndicator.style.display = 'none';
        break;
      case 'error':
        this.restartBtn.disabled = true;
        this.progressIndicator.style.display = 'none';
        break;
      case 'detecting_blink':
        this.restartBtn.disabled = true;
        this.progressIndicator.style.display = 'flex';
        this.updateProgress(0);
        break;
      case 'detecting_mouth_open':
        this.restartBtn.disabled = true;
        this.progressIndicator.style.display = 'flex';
        this.updateProgress(1);
        break;
      case 'dazzling':
        this.restartBtn.disabled = true;
        this.progressIndicator.style.display = 'flex';
        this.updateProgress(2);
        break;
      case 'done':
        this.restartBtn.disabled = false;
        this.progressIndicator.style.display = 'flex';
        this.updateProgress(3);
        break;
    }
  }

  private updateProgress(progress: number): void {
    const steps = this.progressIndicator.children;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i] as HTMLElement;
      step.classList.remove('active', 'completed');
      
      if (i < progress) {
        step.classList.add('completed');
      } else if (i === progress) {
        step.classList.add('active');
      }
    }
  }

  constructor() {
    this.initializeElements();
    this.startDetect();
  }

  private initializeElements(): void {
    this.video = document.getElementById('video') as HTMLVideoElement;
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.restartBtn = document.getElementById('restartBtn') as HTMLButtonElement;
    this.tipArea = document.getElementById('tipArea') as HTMLDivElement;
    this.resultArea = document.getElementById('resultArea') as HTMLDivElement;
    this.progressIndicator = document.getElementById('progressIndicator') as HTMLDivElement;
    this.colorBackground = document.getElementById('colorBackground') as HTMLDivElement;
    
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.restartBtn.addEventListener('click', () => {
      this.resetUI();
      this.startDetect();
    });

    // 添加复制结果按钮事件监听
    const copyResultBtn = document.getElementById('copyResultBtn') as HTMLButtonElement;
    if (copyResultBtn) {
      copyResultBtn.addEventListener('click', () => {
        this.manualCopyResult();
      });
    }

    // 添加调试信息切换功能
    const debugToggle = document.getElementById('debugToggle') as HTMLButtonElement;
    const debugInfo = document.getElementById('debugInfo') as HTMLDivElement;
    if (debugToggle && debugInfo) {
      debugToggle.addEventListener('click', () => {
        const isHidden = debugInfo.classList.contains('hidden');
        if (isHidden) {
          debugInfo.classList.remove('hidden');
          debugToggle.textContent = '隐藏';
        } else {
          debugInfo.classList.add('hidden');
          debugToggle.textContent = '显示';
        }
      });
    }

    // 添加Canvas调试功能
    const capturePhotoBtn = document.getElementById('capturePhotoBtn') as HTMLButtonElement;
    const canvasDebug = document.getElementById('canvasDebug') as HTMLDivElement;
    const canvasDebugClose = document.getElementById('canvasDebugClose') as HTMLButtonElement;
    
    if (capturePhotoBtn) {
      capturePhotoBtn.addEventListener('click', () => {
        this.showCanvasDebug();
      });
    }
    
    if (canvasDebugClose) {
      canvasDebugClose.addEventListener('click', () => {
        canvasDebug.style.display = 'none';
      });
    }
  }

  private resizeCanvas(): void {
    const rect = this.video.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
  }

  private async startDetect(): Promise<void> {
    // 加载模型
    this.updateUI('preparing', { tipMessage: '正在加载模型' });
    if (!this.faceDetector) {
      try {
        this.faceDetector = await FaceDetector.create({
          videoSize: videoSize,
          validFaceWidth: { min: 150, max: 180 },
          validMargins: { 
            left: videoSize.width / 6, 
            top: videoSize.width / 3, 
            right: videoSize.width / 6,
            bottom: videoSize.width / 3,
          },
          faceRatio: {
            width: 174,
            height: 184,
          },
        });
      } catch (error) {
        console.error('初始化模型失败:', error);
        this.updateUI('error', { tipMessage: '人脸核验初始化失败，请刷新页面重试' });
        return;
      }
    }

    // 启动摄像头
    this.updateUI('preparing', { tipMessage: '正在启动摄像头' });
    try {
      await this.startCamera();
      this.cameraOn = true;
    } catch (error) {
      console.error('启动失败:', error);
      let errorMessage = '启动失败，请检查摄像头权限';
      
      if (error instanceof DOMException) {
        switch (error.name) {
          case 'NotAllowedError':
            errorMessage = '摄像头权限被拒绝，请在设置中允许摄像头访问';
            break;
          case 'NotFoundError':
            errorMessage = '未找到摄像头设备';
            break;
          case 'NotReadableError':
            errorMessage = '摄像头被其他应用占用';
            break;
          default:
            errorMessage = `摄像头错误: ${error.message}`;
        }
      }
      this.updateUI('error', { tipMessage: errorMessage });
      return;
    }

    // 启动检测流程
    this.updateUI('detecting_blink', { tipMessage: '请正对取景器' });
    this.predictWebcam();

    // 眨眼检测
    await this.detectBlink((frame, done) => {
      if (typeof frame === 'string') {
        this.updateUI('detecting_blink', { tipMessage: frame });
      } else if (!done) {
        this.updateUI('detecting_blink', { tipMessage: '请眨眼' });
      } else {
        this.updateUI('detecting_blink', { tipMessage: '✅ 已捕获眨眼瞬间，请稍等' });
      }
    });
    // this.downloadFile(blinkBlob, 'action_1.mp4');

    // 张嘴检测
    await this.detectMouthOpen((frame, done) => {
      if (typeof frame === 'string') {
        this.updateUI('detecting_mouth_open', { tipMessage: frame });
      } else if (!done) {
        this.updateUI('detecting_mouth_open', { tipMessage: '请张大嘴巴' });
      } else {
        this.updateUI('detecting_mouth_open', { tipMessage: '✅ 已捕获张嘴瞬间，请稍等' });
      }
    });
    // this.downloadFile(mouthOpenBlob, 'action_2.mp4');

    // 活体检测（炫彩）
    const reflectDataSuccess = await this.dazzle((frame) => {
      if (typeof frame === 'string') {
        this.updateUI('dazzling', { tipMessage: frame });
      } else {
        this.updateUI('dazzling', { tipMessage: '请保持不动' });
      }
    });
    console.log('reflectDataSuccess', reflectDataSuccess);
    
    // 尝试复制到剪切板
    await this.copyToClipboard(reflectDataSuccess);
    
    // 检查是否成功复制到剪切板
    const clipboardSuccess = !(window as any).lastVerificationResult;
    const tipMessage = clipboardSuccess 
      ? '核验完成，结果已复制到剪切板' 
      : '核验完成，结果已存储到控制台，请手动复制';
    
    this.updateUI('done', { tipMessage });
    // 停止摄像头
    this.cameraOn = false;
    this.stopCamera();
    // 显示结果
    this.showResult();
  }

  private async startCamera(): Promise<void> {
    // 检测设备类型和方向
    this.video.srcObject = await navigator.mediaDevices.getUserMedia({ 
      video: {
        width: { ideal: videoSize.height },
        height: { ideal: videoSize.width },
        facingMode: 'user',
        frameRate: { ideal: 30 },
      },
    });
    return new Promise((resolve, _) => {
      this.video.addEventListener('loadeddata', () => resolve());
    });
  }

  private async detectBlink(onFrame: (frame: string | SingleFaceLandmarkerResult, done: boolean) => void): Promise<void> {
    let blinkDetected = false;
    return new Promise((resolve, _) => {
      this.onFrame = (frame) => {
        try {          
          if (typeof frame === 'string') {
            // do nothing.
          } else if (!blinkDetected) {
            blinkDetected = this.faceDetector!.detectBlink(frame);
            if (blinkDetected) {
              // 检测到眨眼，生成视频
              // const promise = this.videoBuffer.getFrames();
              resolve(new Promise((resolve) => setTimeout(resolve, 1000)));
            }
          }
        } finally {
          onFrame(frame, blinkDetected);
        }
      };
    });
  }

  private async detectMouthOpen(onFrame: (frame: string | SingleFaceLandmarkerResult, done: boolean) => void): Promise<void> {
    let mouthOpenDetected = false;
    return new Promise((resolve, _) => {
      this.onFrame = (frame) => {
        try {          
          if (typeof frame === 'string') {
            // do nothing.
          } else if (!mouthOpenDetected) {
            mouthOpenDetected = this.faceDetector!.detectMouthOpen(frame);
            if (mouthOpenDetected) {
              // 检测到张嘴，生成视频
              // const promise = this.videoBuffer.getFrames();
              resolve(new Promise((resolve) => setTimeout(resolve, 1000)));
            }
          }
        } finally {
          onFrame(frame, mouthOpenDetected);
        }
      };
    });
  }

  private async dazzle(onFrame: OnFrame): Promise<ReflectDataSuccess> {
    const reflectFrames: ReflectFrame[] = [];
    const colorList = [
      [0, 0, 0, 76], 
      [115, 26, 67, 159],
      [230, 53, 135, 242], [230, 53, 135, 242], [230, 53, 135, 242], [230, 53, 135, 242],
      [31, 191, 70, 242], [31, 191, 70, 242], [31, 191, 70, 242],
      [230, 53, 135, 242], [230, 53, 135, 242], [230, 53, 135, 242], [230, 53, 135, 242], [230, 53, 135, 242],
      [115, 26, 67, 159],
      [0, 0, 0, 76],
      [204, 204, 204, 17],
    ];
    let dazzling = true;
    this.onFrame = (frame) => {
      if (dazzling && typeof frame === 'object') {
        const { base64, uncroppedBase64, mouthCenter } = this.capturePhoto(frame);
          // 将脸部图片转换为base64并添加到结果中
          reflectFrames.push({
            frame: base64.split(',')[1],
            uncroppedFrame: uncroppedBase64.split(',')[1],
            time: Number(`${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`),
            x: mouthCenter!.x,
            y: mouthCenter!.y,
          });
      }
      onFrame(frame);
    };
    const unitDuration = 120;
    for (const _ of colorList) {
      // const [r, g, b, a] = color;
      // // 在炫彩打光过程中，每个颜色都叠加白色背景以提升打光效率
      // this.colorBackground.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
      // this.colorBackground.style.opacity = '1';
      // await new Promise((resolve) => setTimeout(resolve, 100));

      // 使用requestAnimationFrame和performance.now()保证时间精准
      for (const t0 = performance.now(); performance.now() - t0 < unitDuration;) {
        await new Promise<void>((resolve) => {
          requestAnimationFrame((_) => resolve());
        });
      }
    }
    // this.colorBackground.style.backgroundColor = 'rgb(0, 0, 0)';
    // this.colorBackground.style.opacity = '0';
    dazzling = false;
    
    // 如果帧数超过60帧，均匀随机地删除多余帧
    const maxFrames = Math.floor((unitDuration * colorList.length) / 40);
    const processedFrames = this.uniformlySampleFrames(reflectFrames, maxFrames);
    
    const result: ReflectDataSuccess = {
      colorData: '1 120 3 2 3 3 1 1 ;ejEHAAMAAAAAAAAAeAAAAAAAAAD9D5BoAAAAAHYQBQAAAAAAAAAATOY1h/Ifv0by5jWH8gMAAAACAAAAAwAAAAUAAAAFAAAABQAAAAUAAAAFAAAABQAAAAUAAAAFAAAABQAAAAUAAAAFAAAABQAAAAUAAAAFAAAABQAAAAUAAAA=;5864ec2c19c7136fb09a1c7f6909cf3a',
      colorList: [
        "[0,0,0,76]", "[115,26,67,159]", "[230,53,135,242]", "[230,53,135,242]", "[230,53,135,242]", "[230,53,135,242]",
        "[31,191,70,242]", "[31,191,70,242]", "[31,191,70,242]", "[230,53,135,242]", "[230,53,135,242]", "[230,53,135,242]",
        "[230,53,135,242]", "[230,53,135,242]", "[115,26,67,159]", "[0,0,0,76]", "[204,204,204,17]",
      ],
      reflectFrames: processedFrames.map(frame => ({
        ...frame,
        x: Math.round(frame.x),
        y: Math.round(frame.y),
      })),
    };
    return result;
  }

  private updateDebugInfo(result: FaceDetectionResult) {
    const faceAreaEl = document.getElementById('faceArea');
    const faceWidthEl = document.getElementById('faceWidth');
    const faceHeightEl = document.getElementById('faceHeight');

    if (result.face === undefined) {
      // 检测失败，显示错误信息
      if (faceAreaEl) faceAreaEl.textContent = '未检测';
      if (faceWidthEl) faceWidthEl.textContent = '-';
      if (faceHeightEl) faceHeightEl.textContent = '-';
    } else {
      // 检测成功，显示人脸区域信息
      const faceArea = this.faceDetector!.detectFaceArea(result.face);
      
      if (faceAreaEl) faceAreaEl.textContent = `${Math.round(faceArea.minX)},${Math.round(faceArea.minY)} - ${Math.round(faceArea.maxX)},${Math.round(faceArea.maxY)}`;
      if (faceWidthEl) faceWidthEl.textContent = `${(faceArea.maxX - faceArea.minX).toFixed(1)}px`;
      if (faceHeightEl) faceHeightEl.textContent = `${(faceArea.maxY - faceArea.minY).toFixed(1)}px`;
    }
  }

  private showCanvasDebug(): void {
    if (!this.faceDetector || !this.cameraOn) {
      showNotification('请先启动摄像头并检测到人脸', 'error');
      return;
    }

    // 获取当前视频帧的检测结果
    const result = this.faceDetector.detect(this.video);
    if (result.face === undefined) {
      showNotification('未检测到人脸，无法捕获照片', 'error');
      return;
    }

    try {
      // 调用capturePhoto方法
      const photoData = this.capturePhoto(result.face);
      
      // 显示canvas调试信息
      const canvasDebug = document.getElementById('canvasDebug') as HTMLDivElement;
      const tempCanvasImg = document.getElementById('tempCanvasImg') as HTMLImageElement;
      const faceCanvasImg = document.getElementById('faceCanvasImg') as HTMLImageElement;
      const tempCanvasResolution = document.getElementById('tempCanvasResolution') as HTMLDivElement;
      const faceCanvasResolution = document.getElementById('faceCanvasResolution') as HTMLDivElement;
      
      if (canvasDebug && tempCanvasImg && faceCanvasImg) {
        tempCanvasImg.src = photoData.tempCanvasDataUrl;
        faceCanvasImg.src = photoData.faceCanvasDataUrl;
        
        // 更新分辨率信息
        if (tempCanvasResolution) {
          tempCanvasResolution.textContent = `分辨率: ${this.video.videoWidth} × ${this.video.videoHeight}`;
        }
        if (faceCanvasResolution) {
          const faceWidth = Math.round(photoData.faceArea.maxX - photoData.faceArea.minX);
          const faceHeight = Math.round(photoData.faceArea.maxY - photoData.faceArea.minY);
          faceCanvasResolution.textContent = `分辨率: ${faceWidth} × ${faceHeight}`;
        }
        
        canvasDebug.style.display = 'block';
        
        console.log('Canvas调试信息:', {
          faceArea: photoData.faceArea,
          mouthCenter: photoData.mouthCenter,
          tempCanvasSize: `${this.video.videoWidth}x${this.video.videoHeight}`,
          faceCanvasSize: `${photoData.faceArea.maxX - photoData.faceArea.minX}x${photoData.faceArea.maxY - photoData.faceArea.minY}`
        });
      }
    } catch (error) {
      console.error('Canvas调试过程中发生错误:', error);
      showNotification('Canvas调试失败: ' + error, 'error');
    }
  }

  private predictWebcam() {
    if (!this.cameraOn) {
      return;
    }
    try {
      if (this.lastVideoTime !== this.video.currentTime) {
        this.lastVideoTime = this.video.currentTime;
        
        const result = this.faceDetector!.detect(this.video);        
        // 更新调试信息
        this.updateDebugInfo(result);
        
        this.videoBuffer.addFrame(this.video);
        this.onFrame?.(result.message !== undefined ? result.message : result.face!);
      }
    } catch (error) {
      console.error('预测过程中发生错误:', error);
    } finally {
      window.requestAnimationFrame(() => this.predictWebcam());
    }
  }

  readonly firstImageResolution = { width: 0, height: 0 };
  readonly firstFaceArea = { minX: 0, minY: 0, maxX: 0, maxY: 0 }; // 缓存第一张图片的人脸区域坐标
  // 采集的流程：原始视频帧 -> 水平翻转去除镜像效果 -> 框选人脸区域 -> 裁剪 -> 按比例缩放至固定高度
  private capturePhoto(face: SingleFaceLandmarkerResult): {
    base64: string;
    uncroppedBase64: string; // 水平翻转去除镜像效果后的视频帧base64数据
    mouthCenter?: { x: number; y: number }; // 嘴部中心点坐标，以裁剪、缩放后的照片为坐标系！！！
    tempCanvasDataUrl: string; // 原始视频帧的base64数据
    faceCanvasDataUrl: string; // 裁剪后的人脸图片base64数据
    faceArea: { minX: number; minY: number; maxX: number; maxY: number }; // 人脸区域信息
    imageWidth: number;
    imageHeight: number;
  } {
     // 创建临时canvas来捕获照片
     const tempCanvas = document.createElement('canvas');
     const tempCtx = tempCanvas.getContext('2d')!;
 
     tempCanvas.width = this.video.videoWidth;
     tempCanvas.height = this.video.videoHeight;
 
     // 绘制嘴部坐标
     // const mouthPoints = faceDetectorRef.current!.detectMouthPoints(face);
 
     // 水平翻转canvas以纠正镜像问题
     tempCtx.save(); // 保存当前状态
     tempCtx.scale(-1, 1); // 水平翻转
     tempCtx.drawImage(this.video, -tempCanvas.width, 0, tempCanvas.width, tempCanvas.height); // 从负宽度开始绘制
     tempCtx.restore(); // 恢复原始状态
 
     // 如果是第一张图片，检测人脸区域并缓存；否则使用缓存的坐标
     let minX: number, minY: number, maxX: number, maxY: number;
     if (this.firstImageResolution.width === 0 && this.firstImageResolution.height === 0) {
       // 第一张图片，检测人脸区域并缓存
       const faceArea = this.faceDetector!.detectFaceArea(face);
       minX = faceArea.minX;
       minY = faceArea.minY;
       maxX = faceArea.maxX;
       maxY = faceArea.maxY;
 
       // 缓存第一张图片的人脸区域坐标
       this.firstFaceArea.minX = minX;
       this.firstFaceArea.minY = minY;
       this.firstFaceArea.maxX = maxX;
       this.firstFaceArea.maxY = maxY;
     } else {
       // 后续图片，直接使用缓存的坐标
       minX = this.firstFaceArea.minX;
       minY = this.firstFaceArea.minY;
       maxX = this.firstFaceArea.maxX;
       maxY = this.firstFaceArea.maxY;
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
     if (this.firstImageResolution.width === 0 && this.firstImageResolution.height === 0) {
       this.firstImageResolution.width = targetWidth;
       this.firstImageResolution.height = targetHeight;
     }
 
     // 使用第一张图片的尺寸
     scaledFaceCanvas.width = this.firstImageResolution.width;
     scaledFaceCanvas.height = this.firstImageResolution.height;
 
     // 绘制并缩放到固定尺寸
     scaledFaceCtx.drawImage(faceCanvas, 0, 0, this.firstImageResolution.width, this.firstImageResolution.height);
 
     // 获取原始视频中的嘴部中心点坐标
     const mouthCenter = this.faceDetector!.detectMouthCenter(face);
     // const points = faceDetectorRef.current!.detectMouthPoints(face);
     // 坐标转换：原始视频坐标 -> 翻转后坐标 -> 裁剪后坐标 -> 缩放后坐标
     mouthCenter.x = canvasWidth - mouthCenter.x; // 翻转后的x坐标
     mouthCenter.x = mouthCenter.x - adjustedMinX; // 裁剪后的x坐标
     mouthCenter.y = mouthCenter.y - minY; // 裁剪后的y坐标
     // 缩放到固定尺寸的坐标
     mouthCenter.x = (mouthCenter.x * this.firstImageResolution.width) / currentFaceWidth;
     mouthCenter.y = (mouthCenter.y * this.firstImageResolution.height) / currentFaceHeight;
 
     return {
       base64: scaledFaceCanvas.toDataURL('image/jpeg', 1),
       uncroppedBase64: tempCanvas.toDataURL('image/jpeg', 1),
       mouthCenter: mouthCenter,
       tempCanvasDataUrl: tempCanvas.toDataURL('image/jpeg', 1),
       faceCanvasDataUrl: scaledFaceCanvas.toDataURL('image/jpeg', 1),
       faceArea: { minX, minY, maxX, maxY },
       imageWidth: this.firstImageResolution.width,
       imageHeight: this.firstImageResolution.height,
     };
  }

  private stopCamera(): void {    
    if (this.video.srcObject) {
      const stream = this.video.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      this.video.srcObject = null;
    }
    
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private showResult(): void {
    // 隐藏预览区域
    const previewContainer = document.getElementById('previewContainer') as HTMLElement;
    const buttonArea = document.querySelector('.button-area') as HTMLElement;
    const progressIndicator = document.getElementById('progressIndicator') as HTMLElement;
    
    if (previewContainer) previewContainer.style.display = 'none';
    if (buttonArea) buttonArea.style.display = 'none';
    if (progressIndicator) progressIndicator.style.display = 'none';
    
    // 显示结果区域
    this.resultArea.style.display = 'flex';
    
    // 控制复制按钮的显示
    const copyResultBtn = document.getElementById('copyResultBtn') as HTMLButtonElement;
    if (copyResultBtn) {
      const hasResult = !!(window as any).lastVerificationResult;
      copyResultBtn.style.display = hasResult ? 'block' : 'none';
    }
  }

  private resetUI(): void {
    // 隐藏预览区域
    const previewContainer = document.getElementById('previewContainer') as HTMLElement;
    const buttonArea = document.querySelector('.button-area') as HTMLElement;
    const progressIndicator = document.getElementById('progressIndicator') as HTMLElement;
    
    if (previewContainer) previewContainer.style.display = 'flex';
    if (buttonArea) buttonArea.style.display = 'flex';
    if (progressIndicator) progressIndicator.style.display = 'flex';
    
    // 显示结果区域
    this.resultArea.style.display = 'none';
    
    // 清空帧缓冲区
    this.videoBuffer.clear();
    
    // 清除存储的结果
    delete (window as any).lastVerificationResult;
  }

  // 复制结果到剪切板
  private async copyToClipboard(data: ReflectDataSuccess): Promise<void> {
    try {
      // 将数据转换为JSON字符串
      const jsonString = JSON.stringify(data, null, 2);
      
      // 使用现代Clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(jsonString);
          console.log('结果已复制到剪切板');
          return;
        } catch (clipboardError) {
          console.warn('Clipboard API 失败，尝试降级方案:', clipboardError);
          // 如果 Clipboard API 失败，继续使用降级方案
        }
      }
      
      // 降级方案：使用传统的document.execCommand
      const textArea = document.createElement('textarea');
      textArea.value = jsonString;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        console.log('结果已复制到剪切板');
      } else {
        console.error('复制到剪切板失败');
        // 如果都失败了，将数据存储到全局变量，供用户手动复制
        (window as any).lastVerificationResult = jsonString;
        console.log('结果已存储到 window.lastVerificationResult，请手动复制');
      }
    } catch (error) {
      console.error('复制到剪切板时发生错误:', error);
      // 将数据存储到全局变量，供用户手动复制
      const jsonString = JSON.stringify(data, null, 2);
      (window as any).lastVerificationResult = jsonString;
      console.log('结果已存储到 window.lastVerificationResult，请手动复制');
    }
  }

  // 手动复制结果（用户点击按钮触发）
  private async manualCopyResult(): Promise<void> {
    const lastResult = (window as any).lastVerificationResult;
    if (!lastResult) {
      showNotification('没有可复制的结果', 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(lastResult);
      showNotification('结果已复制到剪切板', 'success');
      // 清除存储的结果
      delete (window as any).lastVerificationResult;
    } catch (error) {
      console.error('手动复制失败:', error);
      showNotification('复制失败，请手动复制控制台中的结果', 'error');
    }
  }

  // 下载文件
  // private downloadFile(blob: Blob, filename: string): void {
  //   const url = URL.createObjectURL(blob);
  //   const a = document.createElement('a');
  //   a.href = url;
  //   a.download = filename;
  //   document.body.appendChild(a);
  //   a.click();
  //   document.body.removeChild(a);
  //   URL.revokeObjectURL(url);
  // }

  /**
   * 均匀随机采样帧，保持原始时间顺序，确保无重复
   * @param frames 原始帧数组
   * @param targetCount 目标帧数
   * @returns 采样后的帧数组
   */
  private uniformlySampleFrames(frames: ReflectFrame[], targetCount: number): ReflectFrame[] {
    // 如果目标数量大于等于帧数，直接返回所有帧
    if (targetCount >= frames.length) {
      return frames;
    }

    const result: ReflectFrame[] = [];
    const step = frames.length / targetCount;

    // 均匀采样
    for (let i = 0; i < targetCount; i++) {
      const index = Math.floor(i * step);
      if (frames[index]) {
        result.push(frames[index]);
      }
    }

    return result;
  }
}