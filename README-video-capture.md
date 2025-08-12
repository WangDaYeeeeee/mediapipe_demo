# 视频帧捕获功能说明

## 功能概述

本项目新增了视频帧捕获功能，能够在检测到用户眨眼或张嘴的瞬间，自动捕获前7帧画面并生成视频文件。

## 功能特性

- **实时帧缓冲**: 维护一个长度为7的视频帧缓冲区
- **自动触发**: 在检测到眨眼或张嘴时自动生成视频
- **文件命名**: 
  - 眨眼检测: `action_1.mp4`
  - 张嘴检测: `action_2.mp4`
- **格式支持**: 生成MP4格式视频文件（使用FFmpeg.wasm转换）
- **兼容性**: 自动降级为WebM格式（如果FFmpeg加载失败）

## 技术实现

### 1. 视频帧缓冲区

```typescript
interface VideoFrameBuffer {
  frames: ImageData[];
  maxFrames: number;
  addFrame(frame: ImageData): void;
  getFrames(): ImageData[];
  clear(): void;
}
```

- 使用循环缓冲区存储最近7帧
- 自动移除最旧的帧以保持固定长度
- 线程安全的帧管理

### 2. 帧捕获流程

1. **实时捕获**: 在每一帧检测过程中捕获当前画面
2. **缓冲区更新**: 将捕获的帧添加到缓冲区
3. **触发检测**: 当检测到眨眼或张嘴时触发视频生成
4. **视频合成**: 使用MediaRecorder API合成视频文件

### 3. 视频生成

```typescript
private async generateMP4FromBuffer(filename: string): Promise<void> {
  // 1. 获取缓冲区中的帧
  const frames = this.frameBuffer.getFrames();
  
  // 2. 创建canvas和MediaStream
  const canvas = document.createElement('canvas');
  const stream = canvas.captureStream(30);
  
  // 3. 使用MediaRecorder录制WebM
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'video/webm;codecs=vp9'
  });
  
  // 4. 逐帧播放并录制
  for (const frame of frames) {
    ctx.putImageData(frame, 0, 0);
    await new Promise(resolve => setTimeout(resolve, 33));
  }
  
  // 5. 使用FFmpeg转换为MP4
  await this.convertToMP4(webmBlob, filename);
}
```

### 4. MP4转换

```typescript
private async convertToMP4(webmBlob: Blob, filename: string): Promise<void> {
  // 1. 将WebM写入FFmpeg
  await this.ffmpeg.writeFile('input.webm', webmData);
  
  // 2. 执行转换命令
  await this.ffmpeg.exec([
    '-i', 'input.webm',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-y', 'output.mp4'
  ]);
  
  // 3. 读取并下载MP4文件
  const mp4Data = await this.ffmpeg.readFile('output.mp4');
  this.downloadFile(mp4Blob, filename);
}
```

## 使用方法

### 1. 主应用

启动主应用后，按照提示进行人脸核验：

1. 正对摄像头
2. 眨眼（自动生成 `action_1.mp4`）
3. 张嘴（自动生成 `action_2.mp4`）
4. 完成活体检测

### 2. 测试页面

使用 `test-video-capture.html` 进行功能测试：

1. 打开测试页面
2. 点击"开始测试"启动摄像头
3. 点击"模拟眨眼"或"模拟张嘴"测试视频生成
4. 查看生成的视频文件

## 文件结构

```
src/
├── main.ts                 # 主应用逻辑（包含视频捕获功能）
├── face_detection.ts       # 面部检测逻辑
└── ...

test-video-capture.html     # 测试页面
README-video-capture.md     # 本说明文档
```

## 技术细节

### 帧率控制

- 捕获帧率: 30fps
- 视频帧率: 30fps
- 帧间隔: 33ms

### 内存管理

- 自动清理旧帧
- 及时释放Blob URL
- 缓冲区大小固定为7帧

### 浏览器兼容性

- 支持所有现代浏览器
- 需要HTTPS环境（摄像头访问）
- 需要用户授权摄像头权限

## 注意事项

1. **文件格式**: 优先生成MP4格式，如果FFmpeg加载失败则降级为WebM格式
2. **文件大小**: 7帧视频文件通常较小（几KB到几十KB）
3. **性能影响**: 帧捕获对性能影响很小，不会影响检测流畅度
4. **存储位置**: 文件会自动下载到用户的下载文件夹
5. **FFmpeg依赖**: 需要网络连接来加载FFmpeg.wasm文件

## 故障排除

### 常见问题

1. **摄像头权限被拒绝**
   - 检查浏览器设置
   - 确保使用HTTPS协议

2. **视频生成失败**
   - 检查浏览器是否支持MediaRecorder
   - 确认有足够的帧数据

3. **文件下载失败**
   - 检查浏览器下载设置
   - 确认没有弹窗拦截

### 调试方法

1. 打开浏览器开发者工具
2. 查看控制台日志输出
3. 使用测试页面进行功能验证

## 未来改进

1. **格式转换**: 集成FFmpeg.wasm实现真正的MP4格式
2. **质量优化**: 支持不同的视频质量和编码参数
3. **存储选项**: 支持云端存储或本地数据库
4. **批量处理**: 支持批量视频生成和管理
