import { FaceDetector, SingleFaceLandmarkerResult } from "./face_detection";
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { VideoFrameBuffer } from "./video_buffer";

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
  new FaceVerification();
});

interface UIState {
  readonly tipMessage?: string;
}

type VerificationStep = 'preparing' | 'error' | 'detecting_blink' | 'detecting_mouth_open' | 'dazzling' | 'done';

type OnFrame = (frame: string | SingleFaceLandmarkerResult) => void;

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

  private faceDetector: FaceDetector | undefined;
  private videoBuffer = VideoFrameBuffer.create();
  private onFrame: OnFrame | undefined;
  private cameraOn: boolean = false;

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
    this.resultPhoto = document.getElementById('resultPhoto') as HTMLDivElement;
    this.progressIndicator = document.getElementById('progressIndicator') as HTMLDivElement;
    this.colorBackground = document.getElementById('colorBackground') as HTMLDivElement;
    
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.restartBtn.addEventListener('click', () => {
      this.resetUI();
      this.startDetect();
    });
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
        this.faceDetector = await this.createFaceDetector();;
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
    await this.detectBlink((frame) => {
      if (typeof frame === 'string') {
        this.updateUI('detecting_blink', { tipMessage: frame });
      } else {
        this.updateUI('detecting_blink', { tipMessage: '请眨眼' });
      }
    });

    // 张嘴检测
    await this.detectMouthOpen((frame) => {
      if (typeof frame === 'string') {
        this.updateUI('detecting_mouth_open', { tipMessage: frame });
      } else {
        this.updateUI('detecting_mouth_open', { tipMessage: '请张大嘴巴' });
      }
    });

    // 活体检测（炫彩）
    await this.dazzle((frame) => {
      if (typeof frame === 'string') {
        this.updateUI('dazzling', { tipMessage: frame });
      } else {
        this.updateUI('dazzling', { tipMessage: '请保持不动' });
      }
    });

    this.updateUI('done', { tipMessage: '核验完成，请稍等' });
    // 捕获照片
    const photo = this.capturePhoto();
    // 停止摄像头
    this.cameraOn = false;
    this.stopCamera();
    // 显示结果
    this.showResult(photo);
  }

  private async createFaceDetector(): Promise<FaceDetector> {
    return await FaceDetector.create({
      cpuContext: this.ctx,
      configs: {
        drawFaceLandmarks: true,
        drawPositionGuide: true
      },
      canvasSizer: () => ({ width: this.canvas.width, height: this.canvas.height })
    });
  }

  private async startCamera(): Promise<void> {
    this.video.srcObject = await navigator.mediaDevices.getUserMedia({ 
      video: {
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
        facingMode: 'user',
        aspectRatio: { exact: 1 }
      },
    });
    return new Promise((resolve, _) => {
      this.video.addEventListener('loadeddata', () => resolve());
    });
  }

  private async detectBlink(onFrame: OnFrame): Promise<void> {
    return new Promise((resolve, _) => {
      this.onFrame = (frame) => {
        try {          
          if (typeof frame === 'string') {
            // do nothing.
          } else {
            const blinkDetected = this.faceDetector!.detectBlink(frame);
            if (blinkDetected) {
              // 检测到眨眼，生成视频
              this.videoBuffer.getFrames().then((blob) => {
                if (blob) this.downloadFile(blob, 'action_1.webm');
              });
              resolve();
            }
          }
        } finally {
          onFrame(frame);
        }
      };
    });
  }

  private async detectMouthOpen(onFrame: OnFrame): Promise<void> {
    return new Promise((resolve, _) => {
      this.onFrame = (frame) => {
        try {          
          if (typeof frame === 'string') {
            // do nothing.
          } else {
            const mouthOpenDetected = this.faceDetector!.detectMouthOpen(frame);
            if (mouthOpenDetected) {
              // 检测到张嘴，生成视频
              this.videoBuffer.getFrames().then((blob) => {
                if (blob) this.downloadFile(blob, 'action_2.webm');
              });
              resolve();
            }
          }
        } finally {
          onFrame(frame);
        }
      };
    });
  }

  private async dazzle(onFrame: OnFrame): Promise<void> {
    this.onFrame = (frame) => {
      onFrame(frame);
    };

    const colorList = [
      [0, 0, 0, 76],
      [15, 95, 35, 159],
      [31, 191, 70, 242],
      [31, 191, 70, 242],
      [31, 191, 70, 242],
      [31, 191, 70, 242],
      [55, 30, 200, 242],
      [55, 30, 200, 242],
      [55, 30, 200, 242],
      [55, 30, 200, 242],
      [31, 191, 70, 242],
      [31, 191, 70, 242],
      [31, 191, 70, 242],
      [31, 191, 70, 242],
      [31, 191, 70, 242],
      [15, 95, 35, 159],
      [0, 0, 0, 76],
      [204, 204, 204, 17]
    ];
    for (const color of colorList) {
      const [r, g, b, a] = color;
      this.colorBackground.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
      this.colorBackground.style.opacity = '1';
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    this.colorBackground.style.opacity = '0';
  }

  private predictWebcam() {
    if (!this.cameraOn) {
      return;
    }
    try {
      const result = this.faceDetector!.detect(this.video);
      this.videoBuffer.addFrame(this.video);
      this.onFrame?.(result);
    } catch (error) {
      console.error('预测过程中发生错误:', error);
    } finally {
      window.requestAnimationFrame(() => this.predictWebcam());
    }
  }

  private capturePhoto(): string {
    // 创建临时canvas来捕获照片
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d')!;
    
    tempCanvas.width = this.video.videoWidth;
    tempCanvas.height = this.video.videoHeight;
    
    // 绘制视频帧到canvas
    tempCtx.drawImage(this.video, 0, 0);
    
    // 转换为base64
    return tempCanvas.toDataURL('image/jpeg', 0.8);
  }

  private stopCamera(): void {    
    if (this.video.srcObject) {
      const stream = this.video.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      this.video.srcObject = null;
    }
    
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private showResult(photo: string): void {
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
    this.resultPhoto.innerHTML = `<img src="${photo}" alt="核验照片">`;
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
  }

  // 下载文件
  private downloadFile(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}