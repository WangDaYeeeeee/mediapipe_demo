import { FFmpeg } from '@ffmpeg/ffmpeg';

// 视频帧缓冲区接口
export interface VideoFrameBuffer {
  readonly maxFrames: number;
  addFrame(video: HTMLVideoElement): void;
  getFrames(): Promise<Blob>;
  clear(): void;  
}

export namespace VideoFrameBuffer {

  export function create(maxFrames: number = 7): VideoFrameBuffer {
    return new VideoFrameBufferImpl(maxFrames);
  }
}

class VideoFrameBufferImpl implements VideoFrameBuffer {
  private frames: ImageData[] = [];
  readonly maxFrames: number;

  constructor(maxFrames: number) {
    this.maxFrames = maxFrames;
  }

  addFrame(video: HTMLVideoElement): void {
    if (!video.videoWidth || !video.videoHeight) return;
    
    // 创建临时canvas来捕获帧
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d')!;
    
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    
    // 绘制视频帧到canvas
    tempCtx.drawImage(video, 0, 0);
    
    // 获取ImageData并添加到缓冲区
    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    this.frames.push(imageData);
    if (this.frames.length > this.maxFrames) {
      this.frames.shift(); // 移除最旧的帧
    }
  }

  async getFrames(): Promise<Blob> {
    const frames = [...this.frames]; // 返回副本
    if (frames.length < this.maxFrames) {
      throw new Error('缓冲区中没有足够的帧数据');
    }
    return new Promise((resolve, reject) => {
      try {
        // 创建canvas用于合成视频
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        
        // 设置canvas尺寸为第一帧的尺寸
        canvas.width = frames[0].width;
        canvas.height = frames[0].height;
        
        // 创建MediaStream
        const stream = canvas.captureStream(30); // 30fps
        
        // 创建MediaRecorder，检查支持的格式
        let mimeType = 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm;codecs=vp8';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm';
          }
        }
        
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: mimeType
        });
        
        const chunks: Blob[] = [];
        
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };
        
        mediaRecorder.onstop = async () => {
          try {
            const webmBlob = new Blob(chunks, { type: 'video/webm' });
            const mp4Blob = await this.webmToMp4(webmBlob);
            resolve(mp4Blob);
          } catch (error) {
            reject(error);
          }
        };
        
        (async () => {
          // 开始录制
          mediaRecorder.start();
          
          // 逐帧播放，每帧显示约5ms
          for (const frame of frames) {
            ctx.putImageData(frame, 0, 0);
            await new Promise(resolve => setTimeout(resolve, 5));
          }
          
          // 停止录制
          mediaRecorder.stop();
        })().catch(reject);
      } catch (error) {
        console.error('生成视频文件时发生错误:', error);
        reject(error);
      }
    });
  }

  private async webmToMp4(webmBlob: Blob): Promise<Blob> {
    try {
      // 创建 FFmpeg 实例
      const ffmpeg = new FFmpeg();
      
      // 加载 FFmpeg
      await ffmpeg.load();
      
      // 将 WebM blob 转换为 ArrayBuffer
      const webmArrayBuffer = await webmBlob.arrayBuffer();
      
      // 写入 WebM 文件到 FFmpeg
      await ffmpeg.writeFile('input.webm', new Uint8Array(webmArrayBuffer));
      
      // 执行转换命令：将 WebM 转换为 MP4
      // 使用更优化的参数设置
      await ffmpeg.exec([
        '-i', 'input.webm',
        '-c:v', 'libx264',           // 使用 H.264 编码器
        '-preset', 'ultrafast',       // 最快的编码预设
        '-crf', '28',                // 稍低的质量以减小文件大小
        '-pix_fmt', 'yuv420p',       // 确保兼容性
        '-movflags', '+faststart',   // 优化 MP4 文件结构
        '-y',                        // 覆盖输出文件
        'output.mp4'
      ]);
      
      // 读取转换后的 MP4 文件
      const mp4Data = await ffmpeg.readFile('output.mp4');
      
      // 清理临时文件
      try {
        await ffmpeg.deleteFile('input.webm');
        await ffmpeg.deleteFile('output.mp4');
      } catch (cleanupError) {
        console.warn('清理临时文件失败:', cleanupError);
      }
      
      // 返回 MP4 blob
      const buffer = mp4Data.slice(0, mp4Data.length);
      return new Blob([buffer], { type: 'video/mp4' });
    } catch (error) {
      console.error('WebM 转 MP4 转换失败:', error);
      // 如果转换失败，返回原始 WebM blob
      return webmBlob;
    }
  }

  clear(): void {
    this.frames = [];
  }
}