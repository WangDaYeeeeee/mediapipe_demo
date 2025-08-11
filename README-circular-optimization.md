# 圆形预览框优化说明

## 优化概述

本次优化主要针对圆形预览框的显示效果，确保摄像头画面和人脸网格能够正确显示在圆形区域内，提供更好的用户体验。

## 主要优化内容

### 1. 视频和Canvas尺寸优化 (`src/main.ts`)

#### 新增 `optimizeCircularPreview()` 方法
- 获取圆形预览容器的实际尺寸
- 确保视频和canvas的尺寸与圆形容器匹配
- 设置视频的 `object-fit: cover` 属性，确保视频填满圆形区域
- 保持视频的宽高比，避免变形

#### 优化 `resizeCanvas()` 方法
- 获取圆形预览容器的尺寸而不是视频的尺寸
- 设置canvas为正方形，与圆形容器匹配
- 确保canvas的CSS尺寸与实际尺寸一致

#### 窗口大小改变时的处理
- 在窗口大小改变时重新计算尺寸
- 如果摄像头正在运行，自动重新优化圆形预览框

### 2. 人脸网格绘制优化 (`src/face_detection.ts`)

#### 优化 `drawFaceLandmarks()` 方法
- 添加圆形裁剪区域，确保人脸网格只在圆形区域内显示
- 使用 `ctx.save()` 和 `ctx.restore()` 保护绘制上下文
- 使用 `ctx.clip()` 创建圆形裁剪路径

#### 优化 `drawPositionGuide()` 方法
- 添加圆形裁剪区域，确保位置指导线只在圆形区域内显示
- 调整目标区域圆圈的大小为圆形预览框的60%
- 优化人脸中心点和连线的显示效果

### 3. 人脸检测验证逻辑优化

#### 优化 `checkCentering()` 方法
- 调整人脸居中检测的阈值
- 人脸中心距离圆形中心不超过圆形半径的15%

#### 优化 `checkFaceSize()` 方法
- 调整人脸大小检测的范围
- 人脸大小应该在圆形直径的40%-80%之间

## 技术实现细节

### 圆形裁剪技术
```typescript
// 创建圆形裁剪区域
const centerX = canvasSize.width / 2;
const centerY = canvasSize.height / 2;
const radius = Math.min(canvasSize.width, canvasSize.height) / 2;

this.ctx?.beginPath();
this.ctx?.arc(centerX, centerY, radius, 0, 2 * Math.PI);
this.ctx?.clip();
```

### 尺寸计算优化
```typescript
// 获取圆形预览容器的实际尺寸
const previewContainer = this.video.parentElement as HTMLElement;
const containerRect = previewContainer.getBoundingClientRect();
const containerSize = Math.min(containerRect.width, containerRect.height);
```

### 视频适配
```typescript
// 确保视频填满圆形区域，保持宽高比
this.video.style.width = containerSize + 'px';
this.video.style.height = containerSize + 'px';
this.video.style.objectFit = 'cover';
```

## 测试验证

创建了 `test-circular.html` 测试页面，用于验证圆形预览框的优化效果：

1. 摄像头画面正确显示在圆形区域内
2. 人脸网格只在圆形区域内绘制
3. 位置指导线正确显示
4. 窗口大小改变时自动适配

## 兼容性说明

- 支持现代浏览器的 Canvas API
- 支持 MediaDevices API 用于摄像头访问
- 响应式设计，适配不同屏幕尺寸
- 保持原有的功能完整性

## 使用建议

1. 确保圆形预览容器的CSS样式正确设置
2. 在移动端使用时，注意摄像头权限的获取
3. 定期测试不同设备和浏览器的兼容性
4. 监控性能，确保人脸检测的流畅性

## 后续优化方向

1. 添加更多的视觉反馈效果
2. 优化人脸检测的准确性
3. 增加更多的自定义选项
4. 提升移动端的性能表现
