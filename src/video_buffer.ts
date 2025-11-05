// 视频帧缓冲区接口
export interface VideoFrameBuffer {
  readonly maxFrames: number;
  addFrame(video: HTMLVideoElement): void;
  getFrames(): Promise<VideoResult>;
  capturedNormalImage(video: HTMLVideoElement): Promise<{
    frame: string;
    width: number;
    height: number;
  }>;
  clear(): void;
}

// 定义返回结果类型
export interface VideoResult {
  blob: Blob;
  duration: number; // 视频时长（秒）
  frameCount: number; // 帧数
  fps: number; // 帧率
}

export namespace VideoFrameBuffer {
  export function create(maxFrames: number = 50): VideoFrameBuffer {
    return new VideoFrameBufferImpl(maxFrames);
  }
}

class VideoFrameBufferImpl implements VideoFrameBuffer {
  private frames: ImageData[] = [];
  readonly maxFrames: number;

  constructor(maxFrames: number) {
    // this.initFFmpeg();
    this.maxFrames = maxFrames;
  }

  // 在类中添加 FFmpeg 实例
  // private ffmpeg: FFmpeg | null = null;
  // private isFFmpegLoaded = false;

  // 初始化 FFmpeg 的方法
  // private async initFFmpeg(): Promise<void> {
  //   if (this.isFFmpegLoaded) return;

  //   try {
  //     // 创建 FFmpeg 实例
  //     this.ffmpeg = new FFmpeg();

  //     // 加载 FFmpeg
  //     await this.ffmpeg.load({
  //       coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/ffmpeg-core.js',
  //       wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/ffmpeg-core.wasm',
  //     });

  //     this.isFFmpegLoaded = true;
  //     console.log('FFmpeg 加载成功');
  //   } catch (error) {
  //     console.error('FFmpeg 初始化失败:', error);
  //     throw new Error('无法加载视频处理组件');
  //   }
  // }

  addFrame(video: HTMLVideoElement): void {
    if (!video.videoWidth || !video.videoHeight) return;

    // 创建临时canvas来捕获帧
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d')!;

    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;

    // 绘制视频帧到canvas
    // tempCtx.drawImage(video, 0, 0);
    // 水平翻转canvas以纠正镜像问题
    tempCtx.scale(-1, 1); // 水平翻转
    tempCtx.drawImage(video, -tempCanvas.width, 0, tempCanvas.width, tempCanvas.height); // 从负宽度开始绘制
    tempCtx.setTransform(1, 0, 0, 1, 0, 0); // 重置变换

    // 获取ImageData并添加到缓冲区
    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    this.frames.push(imageData);
    if (this.frames.length > this.maxFrames) {
      this.frames.shift(); // 移除最旧的帧
    }
  }

  // 根据采集的视频帧 生成动作视频
  async getFrames(): Promise<VideoResult> {
    const frames = [...this.frames]; // 返回副本
    if (frames.length === 0) {
      throw new Error('没有可处理的视频帧');
    }

    if (frames.length < this.maxFrames) {
      console.warn(`缓冲区中帧数不足: ${frames.length}/${this.maxFrames}`);
    }
    console.log(`捕获${frames.length}个视频帧`);

    return new Promise((resolve, reject) => {
      try {
        // 创建canvas用于合成视频
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;

        // 设置canvas尺寸为第一帧的尺寸
        canvas.width = frames[0].width;
        canvas.height = frames[0].height;

        // 创建MediaStream - 设置合适的帧率
        const targetFPS = 30;
        const stream = canvas.captureStream(targetFPS);

        // 优先尝试使用MP4格式
        const mp4MimeTypes = [
          'video/mp4', // 通用MP4
          'video/mp4; codecs="avc1.640028"', // High Profile
          'video/mp4; codecs="avc1.42E01E"', // Baseline Profile
        ];

        let supportedMimeType = '';
        for (const mimeType of mp4MimeTypes) {
          if (MediaRecorder.isTypeSupported(mimeType)) {
            supportedMimeType = mimeType;
            break;
          }
        }

        // 如果没有找到支持的MP4格式，回退到WebM
        if (!supportedMimeType) {
          supportedMimeType = 'video/webm; codecs=vp9';
          if (!MediaRecorder.isTypeSupported(supportedMimeType)) {
            supportedMimeType = 'video/webm; codecs=vp8';
            if (!MediaRecorder.isTypeSupported(supportedMimeType)) {
              supportedMimeType = 'video/webm';
            }
          }
        }

        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: supportedMimeType,
          videoBitsPerSecond: 800000, // 设置合适的比特率
        });

        const chunks: Blob[] = [];
        let videoDuration = 0;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          try {
            const videoBlob = new Blob(chunks, { type: supportedMimeType });

            // 计算视频时长（秒）
            videoDuration = frames.length / targetFPS;

            // 返回包含视频时长信息的结果
            resolve({
              blob: videoBlob,
              duration: Number(videoDuration.toFixed(2)),
              frameCount: frames.length,
              fps: targetFPS,
            });
          } catch (error) {
            console.error('生成视频文件时发生错误:', error);
            reject(error);
          }
        };

        // 使用更精确的时间控制和性能适配
        // (async () => {
        //   // 开始录制
        //   mediaRecorder.start();

        //   // 动态检测设备性能并调整帧率
        //   const deviceAdjustedFPS = 30;
        //   const frameInterval = 1000 / deviceAdjustedFPS - 5;

        //   const startTime = performance.now();
        //   let lastFrameTime = startTime;

        //   // 使用RAF进行更精确的时间控制
        //   function processNextFrame() {
        //     const now = performance.now();
        //     const elapsed = now - lastFrameTime;

        //     if (elapsed >= frameInterval) {
        //       // 绘制当前帧到canvas
        //       if (frameIndex < frames.length) {
        //         ctx.putImageData(frames[frameIndex], 0, 0);
        //         frameIndex++;
        //         lastFrameTime = now - (elapsed % frameInterval); // 调整时间避免累积误差
        //       } else {
        //         // 所有帧处理完成，停止录制
        //         mediaRecorder.stop();
        //         return;
        //       }
        //     }

        //     // 使用requestAnimationFrame继续处理
        //     requestAnimationFrame(processNextFrame);
        //   }

        //   let frameIndex = 0;
        //   requestAnimationFrame(processNextFrame);
        // })().catch(reject);
        (async () => {
          // 开始录制
          mediaRecorder.start();

          // 逐帧播放，每帧显示约5ms
          for (const frame of frames) {
            ctx.putImageData(frame, 0, 0);
            await new Promise((resolve) => setTimeout(resolve, 5));
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

  // private async webmToMp4(webmBlob: Blob): Promise<Blob> {
  //   try {
  //     // 确保 FFmpeg 已初始化
  //     // if (!this.isFFmpegLoaded) {
  //     //   await this.initFFmpeg();
  //     // }

  //     if (!this.ffmpeg) {
  //       throw new Error('FFmpeg 未正确初始化');
  //     }

  //     // 使用 fetchFile 将 Blob 转换为 Uint8Array
  //     const webmData = await fetchFile(webmBlob);

  //     // 写入 WebM 文件到 FFmpeg
  //     await this.ffmpeg.writeFile('input.webm', webmData);

  //     // 执行转换命令
  //     await this.ffmpeg.exec([
  //       '-i',
  //       'input.webm',
  //       '-c:v',
  //       'libx264',
  //       '-preset',
  //       'ultrafast',
  //       '-crf',
  //       '28',
  //       '-pix_fmt',
  //       'yuv420p',
  //       '-movflags',
  //       '+faststart',
  //       '-y', // 覆盖输出文件
  //       'output.mp4',
  //     ]);

  //     // 读取转换后的 MP4 文件
  //     const mp4Data = await this.ffmpeg.readFile('output.mp4');

  //     // 清理临时文件
  //     try {
  //       await this.ffmpeg.deleteFile('input.webm');
  //       await this.ffmpeg.deleteFile('output.mp4');
  //     } catch (cleanupError) {
  //       console.warn('清理临时文件失败:', cleanupError);
  //     }

  //     // 返回 MP4 blob
  //     return new Blob([mp4Data], { type: 'video/mp4' });
  //   } catch (error) {
  //     console.error('WebM 转 MP4 转换失败:', error);
  //     // 如果转换失败，返回原始 WebM blob
  //     return webmBlob;
  //   }
  // }

  async capturedNormalImage(video: HTMLVideoElement): Promise<{
    frame: string;
    width: number;
    height: number;
  }> {
    if (!video.videoWidth || !video.videoHeight) {
      throw new Error('视频尺寸无效，无法截取图片');
    }
    const startTime = Date.now();

    // 创建临时canvas来捕获当前帧
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    // 设置canvas尺寸为视频尺寸
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // 水平翻转canvas以纠正镜像问题（与addFrame方法保持一致）
    ctx.save();
    ctx.scale(-1, 1); // 水平翻转
    ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
    ctx.restore();

    // 获取base64数据
    const base64 = canvas.toDataURL('image/jpeg', 0.95);

    // 将canvas转换为blob
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({
              frame: base64.split(',')[1],
              width: canvas.width,
              height: canvas.height,
            });
          } else {
            reject(new Error('无法生成图片blob'));
          }
        },
        'image/jpeg', // 使用JPEG格式
        0.95 // 图片质量，0.95表示高质量
      );
    });
  }

  clear(): void {
    this.frames = [];
  }
}
