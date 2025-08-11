import { FaceDetector } from "./face_detection";

interface VerificationStep {
  name: string;
  tip: string;
  condition: () => boolean;
  duration?: number;
}

class FaceVerification {
  private video!: HTMLVideoElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private startBtn!: HTMLButtonElement;
  private terminateBtn!: HTMLButtonElement;
  private restartBtn!: HTMLButtonElement;
  private tipArea!: HTMLDivElement;
  private resultArea!: HTMLDivElement;
  private resultPhoto!: HTMLDivElement;
  private progressIndicator!: HTMLDivElement;
  private colorBackground!: HTMLDivElement;
  
  private faceDetector!: FaceDetector;
  private webcamRunning: boolean = false;
  
  // 核验状态
  private isVerifying: boolean = false;
  private currentStep: number = 0;
  private stepStartTime: number = 0;
  private capturedPhoto: string = '';
  
  // 动作检测状态
  private blinkDetected: boolean = false;
  private mouthOpenDetected: boolean = false;
  private faceCentered: boolean = false;
  
  // 核验步骤
  private verificationSteps: VerificationStep[] = [
    {
      name: 'position',
      tip: '请将脸部对准绿色圆圈中心，保持正对摄像头，距离适中',
      condition: () => this.faceCentered,
      duration: 2000
    },
    {
      name: 'blink',
      tip: '请眨眨眼',
      condition: () => this.blinkDetected,
      duration: 3000
    },
    {
      name: 'mouth',
      tip: '请张嘴',
      condition: () => this.mouthOpenDetected,
      duration: 3000
    },
    {
      name: 'light',
      tip: '正在进行炫彩打光...',
      condition: () => true,
      duration: 2000
    }
  ];

  constructor() {
    this.initializeElements();
    this.initializeMediaPipe();
    this.bindEvents();
  }

  private initializeElements(): void {
    this.video = document.getElementById('video') as HTMLVideoElement;
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.startBtn = document.getElementById('startBtn') as HTMLButtonElement;
    this.terminateBtn = document.getElementById('terminateBtn') as HTMLButtonElement;
    this.restartBtn = document.getElementById('restartBtn') as HTMLButtonElement;
    this.tipArea = document.getElementById('tipArea') as HTMLDivElement;
    this.resultArea = document.getElementById('resultArea') as HTMLDivElement;
    this.resultPhoto = document.getElementById('resultPhoto') as HTMLDivElement;
    this.progressIndicator = document.getElementById('progressIndicator') as HTMLDivElement;
    this.colorBackground = document.getElementById('colorBackground') as HTMLDivElement;
    
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  private resizeCanvas(): void {
    const rect = this.video.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
  }

  private async initializeMediaPipe(): Promise<void> {
    this.updateTip('正在加载模型...');
    this.faceDetector = new FaceDetector({
      cpuContext: this.ctx,
      configs: {
        drawFaceLandmarks: true,
        drawPositionGuide: true
      },
      canvasSizer: () => ({ width: this.canvas.width, height: this.canvas.height })
    });
    this.updateTip('请将脸部对准圆形取景器');
  }

  private bindEvents(): void {
    this.startBtn.addEventListener('click', () => this.startVerification());
    this.terminateBtn.addEventListener('click', () => this.terminateVerification());
    this.restartBtn.addEventListener('click', () => this.restartVerification());
  }

  private async startVerification(): Promise<void> {
    try {
      this.updateTip('正在启动摄像头...');
      this.startBtn.disabled = true;

      this.video.srcObject = await navigator.mediaDevices.getUserMedia({ 
        video: {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          facingMode: 'user',
          aspectRatio: { exact: 1 }
        } 
      });
      this.video.addEventListener('loadeddata', () => {
        this.webcamRunning = true;
        this.terminateBtn.disabled = false;
        this.startVerificationProcess();
      });

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
      
      this.updateTip(errorMessage);
      this.startBtn.disabled = false;
    }
  }

  private startVerificationProcess(): void {
    this.isVerifying = true;
    this.currentStep = 0;
    this.resetStepStates();
    this.updateProgress();
    this.startStep();
    this.predictWebcam();
  }

  private resetStepStates(): void {
    this.blinkDetected = false;
    this.mouthOpenDetected = false;
    this.faceCentered = false;
    // this.facePositionHistory = []; // 清空位置历史
  }

  private startStep(): void {
    if (this.currentStep >= this.verificationSteps.length) {
      this.completeVerification();
      return;
    }

    const step = this.verificationSteps[this.currentStep];
    this.stepStartTime = Date.now();
    
    // 如果是位置检测步骤，使用动态提示
    if (step.name !== 'position') {
      this.updateTip(step.tip);
    }
    
    this.updateProgress();

    // 如果是炫彩打光步骤，启动背景动画
    if (step.name === 'light') {
      this.startColorBackground();
    }
  }

  private startColorBackground(): void {
    this.colorBackground.style.opacity = '1';
    this.colorBackground.style.animation = 'colorShift 2s ease-in-out';
    
    setTimeout(() => {
      this.colorBackground.style.opacity = '0';
      this.colorBackground.style.animation = 'none';
    }, 2000);
  }

  private updateProgress(): void {
    const steps = this.progressIndicator.children;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i] as HTMLElement;
      step.classList.remove('active', 'completed');
      
      if (i < this.currentStep) {
        step.classList.add('completed');
      } else if (i === this.currentStep) {
        step.classList.add('active');
      }
    }
  }

  private async predictWebcam(): Promise<void> {
    if (!this.webcamRunning || !this.isVerifying) return;
    try {
      const result = this.faceDetector?.detect(this.video);
      if (result === undefined) {
        this.resetStepStates();
      } else if (typeof result === 'string') {
        this.updateTip(result);
        this.checkStepCompletion();
      } else {
        this.faceCentered = true;

        const blinkDetected = this.faceDetector?.detectBlink(result);
        if (blinkDetected) {
          this.blinkDetected = true;
        }

        const mouthOpenDetected = this.faceDetector?.detectMouthOpen(result);
        if (mouthOpenDetected) {
          this.mouthOpenDetected = true;
        }
        
        this.checkStepCompletion();
      }

      if (this.webcamRunning && this.isVerifying) {
        window.requestAnimationFrame(() => this.predictWebcam());
      }
    } catch (error) {
      console.error('预测过程中发生错误:', error);
      // 继续运行，不要因为单次错误而停止
      if (this.webcamRunning && this.isVerifying) {
        window.requestAnimationFrame(() => this.predictWebcam());
      }
    }
  }

  private checkStepCompletion(): void {
    if (this.currentStep >= this.verificationSteps.length) return;
    
    const step = this.verificationSteps[this.currentStep];
    const currentTime = Date.now();
    const stepDuration = 0;
    
    if (step.condition() && (currentTime - this.stepStartTime) >= stepDuration) {
      this.currentStep++;
      this.resetStepStates();
      this.startStep();
    }
  }

  private async completeVerification(): Promise<void> {
    this.isVerifying = false;
    this.updateTip('核验完成，正在获取照片...');
    
    // 等待一下确保用户眼睛是睁开的
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 捕获照片
    this.capturePhoto();
    
    // 停止摄像头
    this.stopCamera();
    
    // 显示结果
    this.showResult();
  }

  private capturePhoto(): void {
    // 创建临时canvas来捕获照片
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d')!;
    
    tempCanvas.width = this.video.videoWidth;
    tempCanvas.height = this.video.videoHeight;
    
    // 绘制视频帧到canvas
    tempCtx.drawImage(this.video, 0, 0);
    
    // 转换为base64
    this.capturedPhoto = tempCanvas.toDataURL('image/jpeg', 0.8);
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
    
    // 设置照片
    if (this.capturedPhoto) {
      this.resultPhoto.innerHTML = `<img src="${this.capturedPhoto}" alt="核验照片">`;
    }
  }

  private terminateVerification(): void {
    this.isVerifying = false;
    this.stopCamera();
    this.resetUI();
  }

  private restartVerification(): void {
    this.resetUI();
    this.startVerification();
  }

  private resetUI(): void {
    // 隐藏结果区域
    this.resultArea.style.display = 'none';
    
    // 显示预览区域
    const previewContainer = document.getElementById('previewContainer') as HTMLElement;
    const buttonArea = document.querySelector('.button-area') as HTMLElement;
    const progressIndicator = document.getElementById('progressIndicator') as HTMLElement;
    
    if (previewContainer) previewContainer.style.display = 'block';
    if (buttonArea) buttonArea.style.display = 'flex';
    if (progressIndicator) progressIndicator.style.display = 'flex';
    
    // 重置按钮状态
    this.startBtn.disabled = false;
    this.terminateBtn.disabled = true;
    
    // 重置进度
    this.currentStep = 0;
    this.updateProgress();
    this.updateTip('请将脸部对准圆形取景器');
  }

  private stopCamera(): void {
    this.webcamRunning = false;
    
    if (this.video.srcObject) {
      const stream = this.video.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      this.video.srcObject = null;
    }
    
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private updateTip(message: string): void {
    this.tipArea.textContent = message;
  }
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
  new FaceVerification();
});
