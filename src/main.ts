import { FaceDetector } from "./face_detection";

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
  new FaceVerification();
});

interface UIState {
  readonly tipMessage?: string;
}

type VerificationStep = 'preparing' | 'error' | 'focusing' | 'waiting_blink' | 'waiting_mouth_open' | 'dazzling' | 'done';

class FaceVerification {
  private video!: HTMLVideoElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private restartBtn!: HTMLButtonElement;
  private tipArea!: HTMLDivElement;
  private resultArea!: HTMLDivElement;
  private resultPhoto!: HTMLDivElement;
  private progressIndicator!: HTMLDivElement;
  private colorBackground!: HTMLDivElement;

  private updateUI(state: UIState): void {
    if (!!state.tipMessage) {
      this.tipArea.textContent = state.tipMessage;
    }

    switch (this.step) {
      case 'preparing':
        this.restartBtn.disabled = true;
        this.progressIndicator.style.display = 'none';
        break;
      case 'error':
        this.restartBtn.disabled = true;
        this.progressIndicator.style.display = 'none';
        break;
      case 'focusing':
        this.restartBtn.disabled = true;
        this.progressIndicator.style.display = 'flex';
        this.updateProgress(0);
        break;
      case 'waiting_blink':
        this.restartBtn.disabled = true;
        this.progressIndicator.style.display = 'flex';
        this.updateProgress(1);
        break;
      case 'waiting_mouth_open':
        this.restartBtn.disabled = true;
        this.progressIndicator.style.display = 'flex';
        this.updateProgress(2);
        break;
      case 'dazzling':
        this.restartBtn.disabled = true;
        this.progressIndicator.style.display = 'flex';
        this.updateProgress(3);
        break;
      case 'done':
        this.restartBtn.disabled = false;
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

  private step!: VerificationStep;
  private faceDetector: FaceDetector | undefined;
  private capturedPhoto: string | undefined;

  constructor() {
    this.initializeElements();
    this.initializeMediaPipe();
  }

  private initializeElements(): void {
    this.video = document.getElementById('video') as HTMLVideoElement;
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.restartBtn = document.getElementById('restartBtn') as HTMLButtonElement;
    this.tipArea = document.getElementById('tipArea') as HTMLDivElement;
    this.resultArea = document.getElementById('resultArea') as HTMLDivElement;
    this.resultPhoto = document.getElementById('resultPhoto') as HTMLDivElement;
    this.progressIndicator = document.getElementById('progressIndicator') as HTMLDivElement;
    this.colorBackground = document.getElementById('colorBackground') as HTMLDivElement;
    
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.restartBtn.addEventListener('click', () => this.focus('请正对取景器'));
  }

  private resizeCanvas(): void {
    const rect = this.video.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
  }

  private async initializeMediaPipe(): Promise<void> {
    this.step = 'preparing';
    this.updateUI({ tipMessage: '正在加载模型...' });

    try {
      const faceDetector = await FaceDetector.create({
        cpuContext: this.ctx,
        configs: {
          drawFaceLandmarks: true,
          drawPositionGuide: true
        },
        canvasSizer: () => ({ width: this.canvas.width, height: this.canvas.height })
      });
      this.faceDetector = faceDetector;
    } catch (error) {
      console.error('初始化模型失败:', error);
    }
    if (!this.faceDetector) {
      this.error('人脸核验初始化失败，请刷新页面重试');
      return;
    }
    
    this.focus('正在启动摄像头');
    try {
      this.video.srcObject = await navigator.mediaDevices.getUserMedia({ 
        video: {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          facingMode: 'user',
          aspectRatio: { exact: 1 }
        } 
      });
      this.video.addEventListener('loadeddata', () => {
        this.updateUI({ tipMessage: '请正对取景器' });
        this.predictWebcam();
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
      this.error(errorMessage);
    }
  }

  private async error(errorMessage: string): Promise<void> {
    this.step = 'error';
    this.updateUI({ tipMessage: errorMessage });
  }

  private async focus(tipMessage: string): Promise<void> {
    console.assert(this.step === 'preparing' 
      || this.step === 'focusing' 
      || this.step === 'waiting_blink' 
      || this.step === 'waiting_mouth_open' 
      || this.step === 'dazzling');

    this.step = 'focusing';
    this.updateUI({ tipMessage: tipMessage });
  }

  private async waitBlink(): Promise<void> {
    console.assert(this.step === 'focusing');

    this.step = 'waiting_blink';
    this.updateUI({ tipMessage: '请眨眼' });
  }

  private async waitMouthOpen(): Promise<void> {
    console.assert(this.step === 'waiting_blink');

    this.step = 'waiting_mouth_open';
    this.updateUI({ tipMessage: '请张大嘴巴' });
  }

  private async dazzle(): Promise<void> {
    console.assert(this.step === 'waiting_mouth_open');

    this.step = 'dazzling';
    this.updateUI({ tipMessage: '请张大嘴巴' });
    this.startCountdown(() => {
      if (this.step === 'dazzling') {
        this.done();
      }
    });
  }

  private async done(): Promise<void> {
    console.assert(this.step === 'dazzling');

    this.step = 'dazzling';
    this.updateUI({ tipMessage: '核验完成，请稍等' });
    
    // 捕获照片
    this.capturePhoto();
    // 停止摄像头
    this.stopCamera();
    // 显示结果
    this.showResult();
  }

  private startCountdown(completed: () => void): void {
    this.colorBackground.style.opacity = '1';
    this.colorBackground.style.animation = 'colorShift 2s ease-in-out';
    
    setTimeout(() => {
      this.colorBackground.style.opacity = '0';
      this.colorBackground.style.animation = 'none';
      completed();
    }, 2000);
  }

  private predictWebcam() {
    if (this.step === 'done') {
      return;
    }
    try {
      const result = this.faceDetector!.detect(this.video);
      switch (this.step) {
        case 'focusing':
          if (typeof result === 'string') {
            this.focus(result);
          } else {
            this.waitBlink();
          }
          break;
        case 'waiting_blink':
          if (typeof result === 'string') {
            this.focus(result);
          } else {
            const blinkDetected = this.faceDetector!.detectBlink(result);
            if (blinkDetected) {
              this.waitMouthOpen();
            }
          }
          break;
        case 'waiting_mouth_open':
          if (typeof result === 'string') {
            this.focus(result);
          } else {
            const mouthOpenDetected = this.faceDetector!.detectMouthOpen(result);
            if (mouthOpenDetected) {
              this.dazzle();
            }
          }
          break;
        case 'dazzling':
          if (typeof result === 'string') {
            this.focus(result);
          }
          break;
        default: // 立刻返回，不要再开启下一次检测了
          return;
      }
    } catch (error) {
      console.error('预测过程中发生错误:', error);
    } finally {
      window.requestAnimationFrame(() => this.predictWebcam());
    }
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
    
    // 设置照片
    if (this.capturedPhoto) {
      this.resultPhoto.innerHTML = `<img src="${this.capturedPhoto}" alt="核验照片">`;
    }
  }
}