import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

// 视频帧缓冲区接口
export interface VideoFrameBuffer {
  readonly maxFrames: number;
  addFrame(video: HTMLVideoElement): void;
  getFrames(): Promise<Blob|undefined>;
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

  async getFrames(): Promise<Blob|undefined> {
    const frames = [...this.frames]; // 返回副本
    if (frames.length === 0) {
      console.warn('缓冲区中没有帧数据');
      return undefined;
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
          const webmBlob = new Blob(chunks, { type: 'video/webm' });
          const mp4Blob = await this.webmToMp4(webmBlob);
          resolve(mp4Blob);
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
        })();
      } catch (error) {
        console.error('生成视频文件时发生错误:', error);
        reject(error);
      }
    });
  }

  private async webmToMp4(webmBlob: Blob): Promise<Blob> {
    return webmBlob;
  }

  clear(): void {
    this.frames = [];
  }
}