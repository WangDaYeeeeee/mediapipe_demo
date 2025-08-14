import { FaceDetector, SingleFaceLandmarkerResult } from "./face_detection";
import { FaceLandmarker } from "@mediapipe/tasks-vision";
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
  readonly time: number;
  readonly x: number;
  readonly y: number;
}

const WIDTH_SAFE_MARGIN = 0.05;

class FaceVerification {
  private video!: HTMLVideoElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private restartBtn!: HTMLButtonElement;
  private tipArea!: HTMLDivElement;
  private resultArea!: HTMLDivElement;
  private progressIndicator!: HTMLDivElement;
  private colorBackground!: HTMLDivElement;

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
          validWidth: { min: 160 / (1 + 2 * WIDTH_SAFE_MARGIN), max: 180 / (1 + 2 * WIDTH_SAFE_MARGIN) },
          validArea: { minX: 120, minY: 80, maxX: 360, maxY: 560 },
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
    const isMobile = /iPhone|iPad|iPod|Android|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/.test(navigator.userAgent);
    this.video.srcObject = await navigator.mediaDevices.getUserMedia({ 
      video: isMobile ? {
        width: 640,
        height: 480,
        facingMode: 'user',
        frameRate: { ideal: 30 },
      } : {
        width: { ideal: 480 },
        height: { ideal: 640 },
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
      if (dazzling) {
        if (typeof frame === 'string') {
          // do nothing.
        } else {
          const { base64, mouthCenter } = this.capturePhoto(frame);
          // 将脸部图片转换为base64并添加到结果中
          reflectFrames.push({
            frame: base64.split(',')[1],
            time: Date.now() * 1000,
            x: mouthCenter!.x,
            y: mouthCenter!.y,
          });
        }
      }
      onFrame(frame);
    };
    for (const color of colorList) {
      const [r, g, b, _] = color;
      // 在炫彩打光过程中，每个颜色都叠加白色背景以提升打光效率
      // this.colorBackground.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
      this.colorBackground.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
      this.colorBackground.style.opacity = '1';
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.colorBackground.style.backgroundColor = 'rgb(0, 0, 0)';
    this.colorBackground.style.opacity = '0';
    dazzling = false;
    
    // 如果帧数超过60帧，均匀随机地删除多余帧
    const maxFrames = 60;
    let processedFrames = reflectFrames;
    
    if (reflectFrames.length > maxFrames) {
      processedFrames = this.uniformlySampleFrames(reflectFrames, maxFrames);
    }
    
    const result: ReflectDataSuccess = {
      colorData: '1 120 3 2 3 3 1 1 ;ejEHAAMAAAAAAAAAeAAAAAAAAAD9D5BoAAAAAHYQBQAAAAAAAAAATOY1h/Ifv0by5jWH8gMAAAACAAAAAwAAAAUAAAAFAAAABQAAAAUAAAAFAAAABQAAAAUAAAAFAAAABQAAAAUAAAAFAAAABQAAAAUAAAAFAAAABQAAAAUAAAA=;5864ec2c19c7136fb09a1c7f6909cf3a',
      colorList: [
        "[0,0,0,76]", "[115,26,67,159]", "[230,53,135,242]", "[230,53,135,242]", "[230,53,135,242]", "[230,53,135,242]",
        "[31,191,70,242]", "[31,191,70,242]", "[31,191,70,242]", "[230,53,135,242]", "[230,53,135,242]", "[230,53,135,242]",
        "[230,53,135,242]", "[230,53,135,242]", "[115,26,67,159]", "[0,0,0,76]", "[204,204,204,17]",
      ],
      reflectFrames: processedFrames,
    };
    return result;
  }

  private predictWebcam() {
    if (!this.cameraOn) {
      return;
    }
    try {
      if (this.lastVideoTime !== this.video.currentTime) {
        this.lastVideoTime = this.video.currentTime;
        
        const result = this.faceDetector!.detect(this.video);
        this.videoBuffer.addFrame(this.video);
        this.onFrame?.(result);
      }
    } catch (error) {
      console.error('预测过程中发生错误:', error);
    } finally {
      window.requestAnimationFrame(() => this.predictWebcam());
    }
  }

  private capturePhoto(face: SingleFaceLandmarkerResult): {
    base64: string;
    mouthCenter?: { x: number, y: number }; // 嘴部中心点坐标，以裁剪、缩放后的照片为坐标系！！！
  } {
    // 创建临时canvas来捕获照片
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d')!;
    
    tempCanvas.width = this.video.videoWidth;
    tempCanvas.height = this.video.videoHeight;
    
    // 绘制视频帧到canvas
    tempCtx.drawImage(this.video, 0, 0);

    // 获取脸部轮廓点
    const faceLandmarks = face.faceLandmarks;
    const faceOval = FaceLandmarker.FACE_LANDMARKS_FACE_OVAL;
    
    // 计算脸部边界框
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const conn of faceOval) {
      const point = faceLandmarks[conn.start];
      const x = point.x * this.video.videoWidth;
      const y = point.y * this.video.videoHeight;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    
    // 添加一些边距，确保完整捕获脸部
    const padding = (maxX - minX) * WIDTH_SAFE_MARGIN;
    minX = Math.max(0, minX - padding);
    maxX = Math.min(this.video.videoWidth, maxX + padding);
    
    // 裁剪脸部区域
    const faceWidth = maxX - minX;
    const faceHeight = maxY - minY;
    
    // 确保裁剪区域有效
    if (faceWidth <= 0 || faceHeight <= 0) {
      throw new Error('脸部裁剪区域无效');
    }
    
    // 创建新的canvas来存储裁剪后的脸部图片
    const faceCanvas = document.createElement('canvas');
    const faceCtx = faceCanvas.getContext('2d')!;
    
    faceCanvas.width = faceWidth;
    faceCanvas.height = faceHeight;
    
    // 从原canvas裁剪脸部区域
    faceCtx.drawImage(
      tempCanvas,
      minX, minY, faceWidth, faceHeight,  // 源图像裁剪区域
      0, 0, faceWidth, faceHeight          // 目标canvas绘制区域
    );
    
    // 获取原始视频中的嘴部中心点坐标
    const originalMouthCenter = this.faceDetector!.detectMouthCenter(face, {
      width: this.video.videoWidth,
      height: this.video.videoHeight,
    });
    
    // 坐标转换：原始视频坐标 -> 裁剪后坐标 -> 缩放后坐标
    const croppedMouthCenter = {
      x: originalMouthCenter.x - minX,
      y: originalMouthCenter.y - minY,
    };
    
    return {
      base64: faceCanvas.toDataURL('image/jpeg'),
      mouthCenter: croppedMouthCenter,
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
    if (frames.length <= targetCount) {
      return frames;
    }

    const result: ReflectFrame[] = [];
    const step = frames.length / targetCount;
    const usedIndices = new Set<number>(); // 用于跟踪已使用的索引
    
    // 均匀采样，在每个区间内随机选择一帧
    for (let i = 0; i < targetCount; i++) {
      const startIndex = Math.floor(i * step);
      const endIndex = Math.min(Math.floor((i + 1) * step), frames.length);
      
      // 在当前区间内找到未使用的帧
      let randomIndex: number;
      let attempts = 0;
      const maxAttempts = 10; // 防止无限循环
      
      do {
        const rangeSize = endIndex - startIndex;
        randomIndex = startIndex + Math.floor(Math.random() * rangeSize);
        attempts++;
        
        // 如果当前区间所有帧都被使用了，尝试下一个区间
        if (attempts > maxAttempts) {
          // 寻找下一个可用的帧
          for (let j = startIndex; j < frames.length; j++) {
            if (!usedIndices.has(j)) {
              randomIndex = j;
              break;
            }
          }
          break;
        }
      } while (usedIndices.has(randomIndex));
      
      // 标记为已使用并添加到结果
      usedIndices.add(randomIndex);
      if (frames[randomIndex]) {
        result.push(frames[randomIndex]);
      }
    }
    
    // 确保结果按时间顺序排列
    result.sort((a, b) => a.time - b.time);
    
    return result;
  }
}