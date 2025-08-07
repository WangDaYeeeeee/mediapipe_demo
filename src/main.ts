import { FaceLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";

class FaceDetectionDemo {
  private video!: HTMLVideoElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private startBtn!: HTMLButtonElement;
  private stopBtn!: HTMLButtonElement;
  private status!: HTMLDivElement;
  private debugLog!: HTMLDivElement;
  
  private faceLandmarker: any;
  private runningMode: "IMAGE" | "VIDEO" = "VIDEO";
  private webcamRunning: boolean = false;
  private lastVideoTime: number = -1;
  private results: any;
  private drawingUtils: any;
  
  constructor() {
    this.initializeElements();
    this.initializeMediaPipe();
    this.bindEvents();
    this.logDebug('应用初始化完成');
  }
  
  private initializeElements(): void {
    // 获取DOM元素
    this.video = document.getElementById('video') as HTMLVideoElement;
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.startBtn = document.getElementById('startBtn') as HTMLButtonElement;
    this.stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
    this.status = document.getElementById('status') as HTMLDivElement;
    this.debugLog = document.getElementById('debugLog') as HTMLDivElement;
    
    // 设置canvas尺寸
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    
    // 初始化 DrawingUtils
    this.drawingUtils = new DrawingUtils(this.ctx);
    
    this.logDebug('DOM 元素初始化完成');
    this.logDebug(`navigator.mediaDevices: ${navigator.mediaDevices ? '可用' : '不可用'}`);
    this.logDebug(`getUserMedia 支持: ${navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function' ? '是' : '否'}`);
    this.logDebug(`用户代理: ${navigator.userAgent.substring(0, 100)}...`);
  }
  
  private resizeCanvas(): void {
    const rect = this.video.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    
    // 设置canvas的CSS尺寸以匹配视频
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
  }
  
  private async initializeMediaPipe(): Promise<void> {
    try {
      this.updateStatus('正在加载 MediaPipe 模型...', 'loading');
      this.logDebug('开始加载 MediaPipe 模型');
      
      // 创建 FilesetResolver
      const filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      this.logDebug('FilesetResolver 创建成功');
      
      // 创建 FaceLandmarker
      this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: this.runningMode,
        numFaces: 1
      });
      
      this.logDebug('FaceLandmarker 创建成功');
      this.updateStatus('模型加载完成，点击"开始检测"按钮', 'success');
      
    } catch (error) {
      console.error('初始化 MediaPipe 失败:', error);
      this.logDebug(`MediaPipe 初始化失败: ${error}`);
      this.updateStatus('模型加载失败，请刷新页面重试', 'error');
    }
  }
  
  private bindEvents(): void {
    this.startBtn.addEventListener('click', () => this.startDetection());
    this.stopBtn.addEventListener('click', () => this.stopDetection());
  }
  
  private async startDetection(): Promise<void> {
    try {
      if (!this.faceLandmarker) {
        this.updateStatus('模型尚未加载完成，请稍候...', 'error');
        this.logDebug('FaceLandmarker 未初始化');
        return;
      }
      
      this.updateStatus('正在启动摄像头...', 'loading');
      this.startBtn.disabled = true;
      this.logDebug('开始启动摄像头检测');
      
      // 检查浏览器是否支持 getUserMedia
      this.logDebug(`检查 navigator.mediaDevices: ${navigator.mediaDevices}`);
      this.logDebug(`检查 getUserMedia: ${navigator.mediaDevices?.getUserMedia}`);
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const error = '浏览器不支持摄像头访问';
        this.logDebug(error);
        throw new Error(error);
      }
      
      this.logDebug('getUserMedia 支持检查通过');
      
      // 获取摄像头流
      this.logDebug('开始请求摄像头权限...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        } 
      });
      
      this.logDebug('摄像头权限获取成功');
      this.video.srcObject = stream;
      this.logDebug('视频流设置完成');
      
      // 等待视频加载完成后开始检测
      this.video.addEventListener('loadeddata', () => {
        this.logDebug('视频数据加载完成');
        this.webcamRunning = true;
        this.stopBtn.disabled = false;
        this.updateStatus('检测已启动，请将脸对准摄像头', 'success');
        this.predictWebcam();
      });
      
    } catch (error) {
      console.error('启动失败:', error);
      this.logDebug(`摄像头启动失败: ${String(error)}`);
      this.logDebug(`错误类型: ${error instanceof Error ? error.constructor.name : typeof error}`);
      this.logDebug(`错误名称: ${error instanceof Error ? error.name : 'N/A'}`);
      this.logDebug(`错误消息: ${error instanceof Error ? error.message : String(error)}`);
      
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
          case 'OverconstrainedError':
            errorMessage = '摄像头不支持请求的分辨率';
            break;
          default:
            errorMessage = `摄像头错误: ${error.message}`;
        }
      }
      
      this.updateStatus(errorMessage, 'error');
      this.startBtn.disabled = false;
    }
  }
  
  private stopDetection(): void {
    this.webcamRunning = false;
    this.logDebug('停止摄像头检测');
    
    // 停止摄像头流
    if (this.video.srcObject) {
      const stream = this.video.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      this.video.srcObject = null;
      this.logDebug('摄像头流已停止');
    }
    
    this.startBtn.disabled = false;
    this.stopBtn.disabled = true;
    this.updateStatus('检测已停止', 'info');
    
    // 清除canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  
  private async predictWebcam(): Promise<void> {
    // 设置视频和canvas尺寸
    const videoWidth = 640;
    const radio = this.video.videoHeight / this.video.videoWidth;
    
    this.video.style.width = videoWidth + "px";
    this.video.style.height = videoWidth * radio + "px";
    this.canvas.style.width = videoWidth + "px";
    this.canvas.style.height = videoWidth * radio + "px";
    this.canvas.width = this.video.videoWidth;
    this.canvas.height = this.video.videoHeight;
    
    // 确保运行模式为 VIDEO
    if (this.runningMode === "IMAGE") {
      this.runningMode = "VIDEO";
      await this.faceLandmarker.setOptions({ runningMode: this.runningMode });
    }
    
    let startTimeMs = performance.now();
    
    // 只在视频时间变化时进行检测
    if (this.lastVideoTime !== this.video.currentTime) {
      this.lastVideoTime = this.video.currentTime;
      this.results = this.faceLandmarker.detectForVideo(this.video, startTimeMs);
    }
    
    // 清除上一帧的绘制
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // 绘制人脸特征点
    if (this.results.faceLandmarks) {
      for (const landmarks of this.results.faceLandmarks) {
        // 绘制面部网格
        this.drawingUtils.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_TESSELATION,
          { color: "#C0C0C070", lineWidth: 1 }
        );
        
        // 绘制右眼
        this.drawingUtils.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
          { color: "#FF3030" }
        );
        
        // 绘制右眉毛
        this.drawingUtils.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
          { color: "#FF3030" }
        );
        
        // 绘制左眼
        this.drawingUtils.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
          { color: "#30FF30" }
        );
        
        // 绘制左眉毛
        this.drawingUtils.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
          { color: "#30FF30" }
        );
        
        // 绘制面部轮廓
        this.drawingUtils.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
          { color: "#E0E0E0" }
        );
        
        // 绘制嘴唇
        this.drawingUtils.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_LIPS,
          { color: "#E0E0E0" }
        );
        
        // 绘制右眼虹膜
        this.drawingUtils.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS,
          { color: "#FF3030" }
        );
        
        // 绘制左眼虹膜
        this.drawingUtils.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS,
          { color: "#30FF30" }
        );
      }
    }
    
    // 如果还在运行，继续下一帧
    if (this.webcamRunning) {
      window.requestAnimationFrame(() => this.predictWebcam());
    }
  }
  
  private updateStatus(message: string, type: 'loading' | 'success' | 'error' | 'info' = 'info'): void {
    // 移除所有状态类
    this.status.classList.remove('loading', 'success', 'error', 'info');
    
    // 添加新的状态类
    this.status.classList.add(type);
    
    // 更新文本内容
    if (type === 'loading') {
      this.status.innerHTML = `<span class="loading"></span>${message}`;
    } else {
      this.status.textContent = message;
    }
  }
  
  private logDebug(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.style.fontSize = '12px';
    logEntry.style.marginBottom = '4px';
    logEntry.style.padding = '2px 4px';
    logEntry.style.backgroundColor = '#f0f0f0';
    logEntry.style.borderRadius = '2px';
    logEntry.textContent = `[${timestamp}] ${message}`;
    
    if (this.debugLog) {
      this.debugLog.appendChild(logEntry);
      // 保持最新的 20 条日志
      while (this.debugLog.children.length > 20) {
        this.debugLog.removeChild(this.debugLog.firstChild!);
      }
      // 滚动到底部
      this.debugLog.scrollTop = this.debugLog.scrollHeight;
    }
    
    // 同时输出到控制台
    console.log(`[DEBUG] ${message}`);
  }
}

// 页面加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
  new FaceDetectionDemo();
}); 