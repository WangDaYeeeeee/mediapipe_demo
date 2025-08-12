# FFmpeg WebM 到 MP4 转换功能

本项目实现了基于 FFmpeg 的 WebM 到 MP4 视频格式转换功能。

## 功能特性

- 使用 WebAssembly 版本的 FFmpeg 在浏览器中进行视频转换
- 支持将 WebM 格式视频转换为 MP4 格式
- 优化的转换参数，确保快速转换和良好的兼容性
- 自动清理临时文件
- 完善的错误处理机制

## 实现细节

### 核心转换方法

在 `src/video_buffer.ts` 中实现了 `webmToMp4` 方法：

```typescript
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
    
    // 执行转换命令
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
    return new Blob([mp4Data], { type: 'video/mp4' });
  } catch (error) {
    console.error('WebM 转 MP4 转换失败:', error);
    // 如果转换失败，返回原始 WebM blob
    return webmBlob;
  }
}
```

### FFmpeg 参数说明

- `-c:v libx264`: 使用 H.264 视频编码器
- `-preset ultrafast`: 使用最快的编码预设，优先考虑速度
- `-crf 28`: 设置恒定质量因子为 28，在文件大小和质量之间取得平衡
- `-pix_fmt yuv420p`: 使用 YUV420P 像素格式，确保最大兼容性
- `-movflags +faststart`: 优化 MP4 文件结构，支持流式播放
- `-y`: 自动覆盖输出文件

## 依赖要求

项目需要以下依赖包：

```json
{
  "@ffmpeg/core": "^0.12.6",
  "@ffmpeg/ffmpeg": "^0.12.15",
  "@ffmpeg/util": "^0.12.2"
}
```

## 环境配置

### Vite 配置

在 `vite.config.ts` 中需要配置 CORS 头部以支持 SharedArrayBuffer：

```typescript
export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
  }
})
```

### FFmpeg 初始化

在应用启动时需要初始化 FFmpeg：

```typescript
async function initializeFFmpeg(): Promise<void> {
  try {
    const ffmpeg = new FFmpeg();
    await ffmpeg.load();
    console.log('FFmpeg 初始化成功');
  } catch (error) {
    console.error('FFmpeg 初始化失败:', error);
  }
}
```

## 使用方法

### 在视频缓冲区中使用

```typescript
// 创建视频缓冲区
const videoBuffer = VideoFrameBuffer.create(7);

// 添加视频帧
videoBuffer.addFrame(videoElement);

// 获取视频文件（自动转换为 MP4）
const videoBlob = await videoBuffer.getFrames();
if (videoBlob) {
  // 下载或处理 MP4 文件
  downloadFile(videoBlob, 'video.mp4');
}
```

### 直接转换 WebM 文件

```typescript
async function convertWebmToMp4(webmBlob: Blob): Promise<Blob> {
  const videoBuffer = VideoFrameBuffer.create();
  // 这里需要实现将 WebM blob 转换为帧的逻辑
  // 然后调用 getFrames() 方法
}
```

## 测试页面

项目包含一个测试页面 `test-ffmpeg.html`，可以用来验证转换功能：

1. 打开测试页面
2. 点击"开始录制"录制一段视频
3. 点击"停止录制"完成录制
4. 点击"转换为 MP4"进行格式转换
5. 下载转换后的 MP4 文件

## 注意事项

1. **浏览器兼容性**: 需要支持 SharedArrayBuffer 的现代浏览器
2. **HTTPS 要求**: 必须在 HTTPS 环境下运行
3. **内存使用**: 大文件转换可能消耗较多内存
4. **转换时间**: 转换时间取决于视频长度和复杂度
5. **错误处理**: 转换失败时会返回原始 WebM 文件

## 性能优化

- 使用 `ultrafast` 预设优先考虑转换速度
- 设置合适的 CRF 值平衡质量和文件大小
- 及时清理临时文件释放内存
- 添加错误处理避免程序崩溃

## 故障排除

### 常见问题

1. **FFmpeg 初始化失败**
   - 检查网络连接
   - 确认 CORS 配置正确
   - 检查浏览器是否支持 SharedArrayBuffer

2. **转换失败**
   - 检查输入文件格式是否正确
   - 查看控制台错误信息
   - 尝试减小输入文件大小

3. **内存不足**
   - 减小视频分辨率
   - 缩短视频时长
   - 增加浏览器内存限制

### 调试技巧

- 在浏览器控制台查看详细错误信息
- 使用 `test-ffmpeg.html` 页面进行功能测试
- 检查网络请求是否正常加载 FFmpeg 资源
