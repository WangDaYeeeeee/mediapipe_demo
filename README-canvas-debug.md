# Canvas调试功能说明

## 概述

为`capturePhoto`方法添加了调试功能，可以实时查看tempCanvas和faceCanvas的绘制内容，帮助开发者验证人脸裁剪功能是否正确。

## 功能特性

### 1. capturePhoto方法增强
- **新增返回值**: 增加了`tempCanvasDataUrl`、`faceCanvasDataUrl`和`faceArea`字段
- **完整数据**: 提供原始视频帧和裁剪后人脸的完整base64数据
- **调试信息**: 包含人脸区域坐标信息，便于调试

### 2. 界面调试功能
- **调试按钮**: 在调试信息区域添加"捕获照片调试"按钮
- **实时预览**: 点击按钮后显示两个canvas的内容
- **可视化对比**: 左侧显示原始视频帧，右侧显示裁剪后人脸

### 3. 调试信息展示
- **原始视频帧**: 显示完整的视频帧内容（tempCanvas）
- **裁剪后人脸**: 显示根据人脸区域裁剪后的图片（faceCanvas）
- **分辨率信息**: 实时显示两个canvas的分辨率（宽度 × 高度）
- **控制台日志**: 输出详细的调试信息到浏览器控制台

## 使用方法

### 1. 在主界面中
1. 启动摄像头并确保检测到人脸
2. 点击调试信息区域中的"捕获照片调试"按钮
3. 查看底部弹出的canvas调试区域
4. 对比原始视频帧和裁剪后人脸的差异

### 2. 调试信息解读
- **tempCanvas**: 原始视频帧，包含完整的摄像头画面
- **faceCanvas**: 裁剪后的人脸图片，只包含检测到的人脸区域
- **分辨率显示**: 每个canvas下方显示其实际分辨率（宽度 × 高度）
- **控制台信息**: 包含人脸区域坐标、嘴部中心点、canvas尺寸等详细信息

### 3. 测试功能
可以使用`test-canvas-debug.html`页面来测试canvas调试功能：
```bash
# 在浏览器中打开测试页面
open test-canvas-debug.html
```

## 技术实现

### 1. capturePhoto方法修改
```typescript
private capturePhoto(face: SingleFaceLandmarkerResult): {
  base64: string;
  mouthCenter?: { x: number, y: number };
  tempCanvasDataUrl: string; // 新增：原始视频帧的base64数据
  faceCanvasDataUrl: string; // 新增：裁剪后的人脸图片base64数据
  faceArea: { minX: number, minY: number, maxX: number, maxY: number }; // 新增：人脸区域信息
}
```

### 2. 调试界面实现
```typescript
private showCanvasDebug(): void {
  // 检查前置条件
  if (!this.faceDetector || !this.cameraOn) {
    showNotification('请先启动摄像头并检测到人脸', 'error');
    return;
  }

  // 获取当前检测结果
  const result = this.faceDetector.detect(this.video);
  if (typeof result === 'string') {
    showNotification('未检测到人脸，无法捕获照片', 'error');
    return;
  }

  // 调用capturePhoto方法并显示结果
  const photoData = this.capturePhoto(result);
  // 更新界面显示...
}
```

### 3. HTML结构
```html
<!-- Canvas调试区域 -->
<div class="canvas-debug" id="canvasDebug">
  <button class="canvas-debug-close" id="canvasDebugClose">关闭</button>
  <h3>Canvas调试信息</h3>
  <div class="canvas-debug-content">
    <div class="canvas-item">
      <h4>原始视频帧 (tempCanvas)</h4>
      <div class="canvas-resolution" id="tempCanvasResolution">分辨率: -</div>
      <img id="tempCanvasImg" src="" alt="原始视频帧">
    </div>
    <div class="canvas-item">
      <h4>裁剪后人脸 (faceCanvas)</h4>
      <div class="canvas-resolution" id="faceCanvasResolution">分辨率: -</div>
      <img id="faceCanvasImg" src="" alt="裁剪后人脸">
    </div>
  </div>
</div>
```

## 调试信息说明

### 1. tempCanvas（原始视频帧）
- **尺寸**: 与视频流相同的尺寸（通常是640x480，根据摄像头设置）
- **内容**: 完整的摄像头画面
- **用途**: 作为人脸裁剪的源图像
- **分辨率显示**: 实时显示实际的分辨率信息

### 2. faceCanvas（裁剪后人脸）
- **尺寸**: 根据检测到的人脸区域动态计算
- **内容**: 只包含人脸区域的图片
- **用途**: 最终输出的人脸图片
- **分辨率显示**: 显示裁剪后的实际尺寸（宽度 × 高度）

### 3. 人脸区域信息
```typescript
faceArea: {
  minX: number, // 人脸区域左上角X坐标
  minY: number, // 人脸区域左上角Y坐标
  maxX: number, // 人脸区域右下角X坐标
  maxY: number  // 人脸区域右下角Y坐标
}
```

### 4. 嘴部中心点坐标
```typescript
mouthCenter: {
  x: number, // 嘴部中心点X坐标（相对于裁剪后图片）
  y: number  // 嘴部中心点Y坐标（相对于裁剪后图片）
}
```

### 5. 分辨率显示功能
- **tempCanvas分辨率**: 显示原始视频帧的实际分辨率（如：640 × 480）
- **faceCanvas分辨率**: 显示裁剪后人脸图片的实际分辨率（如：200 × 180）
- **实时更新**: 每次调用capturePhoto方法时都会更新分辨率信息
- **格式**: 使用"宽度 × 高度"的格式显示，便于理解

## 常见问题排查

### 1. 人脸检测失败
- **现象**: 点击按钮后提示"未检测到人脸"
- **解决**: 确保摄像头正常工作，人脸在画面中清晰可见

### 2. 裁剪区域不正确
- **现象**: faceCanvas显示的人脸区域不准确
- **排查**: 检查faceArea坐标值，确认人脸检测算法是否正常工作

### 3. 图片显示异常
- **现象**: canvas图片显示为空白或异常
- **排查**: 检查canvas绘制过程，确认drawImage参数是否正确

### 4. 性能问题
- **现象**: 点击按钮后响应缓慢
- **解决**: canvas调试功能会生成base64数据，在性能较差的设备上可能较慢

## 调试技巧

### 1. 对比分析
- 观察tempCanvas中的人脸位置
- 对比faceCanvas的裁剪结果
- 验证裁剪区域是否准确

### 2. 坐标验证
- 在控制台查看faceArea坐标
- 手动计算裁剪区域大小
- 验证坐标转换是否正确

### 3. 实时调试
- 在不同人脸位置测试
- 观察不同角度下的裁剪效果
- 验证算法的鲁棒性

## 移动端适配

在移动设备上，canvas调试区域会：
- 调整位置和大小以适应小屏幕
- 减小图片显示尺寸
- 保持功能的完整性

## 注意事项

1. **性能影响**: canvas调试功能会生成大量base64数据，可能影响性能
2. **内存使用**: 频繁调用可能增加内存使用量
3. **隐私考虑**: 调试信息包含实际的视频帧数据，注意隐私保护
4. **浏览器兼容性**: 需要支持canvas和toDataURL的现代浏览器

## 未来改进

1. **性能优化**: 降低图片质量或尺寸以减少数据量
2. **更多信息**: 添加裁剪前后的对比图
3. **交互功能**: 支持手动调整裁剪区域
4. **数据导出**: 支持将调试数据保存为文件
