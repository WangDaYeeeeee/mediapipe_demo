# 脸部图片捕获功能实现

## 功能概述

本功能实现了通过MediaPipe人脸检测技术，在视频帧中自动识别脸部区域，裁剪出脸部图片并转换为base64格式，同时提供嘴部中心点的坐标信息。

## 实现细节

### 1. 核心方法

在 `src/main.ts` 中新增了 `capturePhoto()` 方法，支持人脸裁剪、缩放和坐标转换：

```typescript
  private capturePhoto(extra?: {
    face: SingleFaceLandmarkerResult, 
    maxWidth: number,
  }): {
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
  
      if (!extra) { // 如果未提供人脸信息，则返回全量视频帧
      return {
        base64: tempCanvas.toDataURL('image/jpeg', 0.8),
      };
    }

    // 获取脸部轮廓点
    const faceLandmarks = extra.face.faceLandmarks;
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
  const padding = Math.min(maxX - minX, maxY - minY) * 0.1;
  minX = Math.max(0, minX - padding);
  maxX = Math.min(this.video.videoWidth, maxX + padding);
  minY = Math.max(0, minY - padding);
  maxY = Math.min(this.video.videoHeight, maxY + padding);
  
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

    // 计算缩放比例
    const scale = Math.min(extra.maxWidth / faceWidth, extra.maxWidth / faceHeight);
    const scaledWidth = Math.round(faceWidth * scale);
    const scaledHeight = Math.round(faceHeight * scale);

    // 如果需要进行缩放
    if (scale < 1) {
      const scaledCanvas = document.createElement('canvas');
      const scaledCtx = scaledCanvas.getContext('2d')!;
      
      scaledCanvas.width = scaledWidth;
      scaledCanvas.height = scaledHeight;
      
      // 使用高质量缩放
      scaledCtx.imageSmoothingEnabled = true;
      scaledCtx.imageSmoothingQuality = 'high';
      
      // 绘制缩放后的图像
      scaledCtx.drawImage(
        faceCanvas,
        0, 0, faceWidth, faceHeight,      // 源图像区域
        0, 0, scaledWidth, scaledHeight   // 目标区域
      );
      
      // 获取原始视频中的嘴部中心点坐标
      const originalMouthCenter = this.faceDetector!.detectMouthCenter(extra.face, {
        width: this.video.videoWidth,
        height: this.video.videoHeight,
      });
      
      // 坐标转换：原始视频坐标 -> 裁剪后坐标 -> 缩放后坐标
      const croppedMouthCenter = {
        x: originalMouthCenter.x - minX,
        y: originalMouthCenter.y - minY,
      };
      
      const scaledMouthCenter = {
        x: croppedMouthCenter.x * scale,
        y: croppedMouthCenter.y * scale,
      };
      
      return {
        base64: scaledCanvas.toDataURL('image/jpeg', 0.8),
        mouthCenter: scaledMouthCenter,
      };
    } else {
      // 不需要缩放，直接返回裁剪后的图片
      const originalMouthCenter = this.faceDetector!.detectMouthCenter(extra.face, {
        width: this.video.videoWidth,
        height: this.video.videoHeight,
      });
      
      // 坐标转换：原始视频坐标 -> 裁剪后坐标
      const croppedMouthCenter = {
        x: originalMouthCenter.x - minX,
        y: originalMouthCenter.y - minY,
      };
      
      return {
        base64: faceCanvas.toDataURL('image/jpeg', 0.8),
        mouthCenter: croppedMouthCenter,
      };
    }
}
```

### 2. 嘴部中心点检测

在 `src/face_detection.ts` 中新增了 `detectMouthCenter()` 方法：

### 3. 剪切板复制功能

在 `src/main.ts` 中新增了 `copyToClipboard()` 方法：

```typescript
private async copyToClipboard(data: ReflectDataSuccess): Promise<void> {
  try {
    // 将数据转换为JSON字符串
    const jsonString = JSON.stringify(data, null, 2);
    
    // 使用现代Clipboard API
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(jsonString);
      console.log('结果已复制到剪切板');
    } else {
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
      }
    }
  } catch (error) {
    console.error('复制到剪切板时发生错误:', error);
  }
}
```

```typescript
public detectMouthCenter(singleResult: SingleFaceLandmarkerResult, size: Size): { x: number, y: number } {
  const mouthOval = FaceLandmarker.FACE_LANDMARKS_LIPS;
  const sum: {x: number, y: number} = mouthOval.reduce((prev, current) => {
    const point = singleResult.faceLandmarks[current.start];
    return { 
      x: prev.x + point.x * size.width, 
      y: prev.y + point.y * size.height,
    }
  }, { x: 0, y: 0 });
  return {
    x: sum.x / mouthOval.length,
    y: sum.y / mouthOval.length,
  };
}
```

### 3. 集成到炫彩打光流程

在 `dazzle()` 方法中集成了脸部图片捕获、坐标转换和剪切板复制功能：

```typescript
for (const color of colorList) {
  const [r, g, b, a] = color;
  this.colorBackground.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
  this.colorBackground.style.opacity = '1';

  // 等待一小段时间确保视频帧更新
  await new Promise((resolve) => setTimeout(resolve, 50));

  // 获取一帧脸部图片（通过MediaPipe计算出的脸部信息，在全量视频帧的基础上，裁剪出脸部区域）
  if (typeof frameCache === 'string') {
    invalid = true;
  } else if (!invalid) {
    const { base64, mouthCenter } = this.capturePhoto({ face: frameCache, maxWidth: 180 });
    // 将脸部图片转换为base64并添加到结果中
    result.reflectFrames.push({
      frame: base64.split(',')[1],
      time: Date.now() * 1000,
      x: mouthCenter!.x,
      y: mouthCenter!.y,
    });
  }

  await new Promise((resolve) => setTimeout(resolve, 50));
}

// 复制结果到剪切板
await this.copyToClipboard(reflectDataSuccess);
```

### 4. 技术要点

#### 4.1 脸部边界框计算
- 使用MediaPipe的 `FACE_LANDMARKS_FACE_OVAL` 轮廓点
- 遍历所有轮廓点计算最小和最大坐标
- 添加10%的边距确保完整捕获脸部

#### 4.2 嘴部中心点计算
- 使用MediaPipe的 `FACE_LANDMARKS_LIPS` 轮廓点
- 计算所有嘴唇轮廓点的平均值作为中心点
- 将归一化坐标转换为实际像素坐标

#### 4.3 图像缩放
- 根据指定的最大宽度计算缩放比例
- 使用 `Math.min(maxWidth / width, maxWidth / height)` 保持宽高比
- 启用高质量图像平滑处理
- 支持不同尺寸的输出（如120px、180px、240px）

#### 4.4 坐标转换
- 从原始视频坐标转换为裁剪后的坐标
- 从裁剪后坐标转换为缩放后坐标
- 使用公式：`scaledX = (originalX - cropX) * scale`
- 确保坐标在最终图片范围内有效

#### 4.5 Canvas裁剪
- 创建临时canvas捕获完整视频帧
- 使用 `drawImage()` 方法裁剪指定区域
- 创建新的canvas存储裁剪后的脸部图片

#### 4.6 Base64转换
- 使用 `toDataURL('image/jpeg', 0.8)` 转换为JPEG格式
- 质量设置为0.8，平衡文件大小和图片质量
- 移除base64前缀，只保留数据部分

#### 4.7 剪切板复制
- 支持现代Clipboard API和传统execCommand降级方案
- 自动检测安全上下文和API可用性
- 将完整结果数据转换为JSON格式
- 提供用户友好的状态反馈

### 5. 错误处理

- 检查人脸检测结果是否为有效数据
- 验证裁剪区域的有效性（宽度和高度大于0）
- 捕获异常并记录错误日志
- 使用try-catch包装坐标转换逻辑
- 在无效状态下跳过图片捕获
- 剪切板操作的异常处理和降级方案

### 6. 测试文件

创建了 `test-face-capture.html` 测试文件，包含：
- 摄像头启动和视频显示
- 实时人脸检测和轮廓绘制
- 多种尺寸的脸部图片捕获（120px、180px、240px）
- 嘴部中心点的可视化标记
- 捕获结果的实时显示
- 缩放功能的验证
- 剪切板复制功能测试
- 结果数据的存储和管理

## 使用方法

1. 在炫彩打光流程中，每次颜色变化时会自动捕获脸部图片
2. 捕获的图片会以base64格式存储在 `result.reflectFrames` 数组中
3. 支持指定最大宽度进行缩放，保持宽高比
4. 核验完成后，结果会自动复制到剪切板
5. 每个帧包含：
   - `frame`: base64编码的图片数据（移除前缀）
   - `time`: 捕获时间戳（微秒级）
   - `x`, `y`: 嘴部中心点在最终图片中的坐标（已考虑裁剪和缩放）

## 依赖

- MediaPipe Tasks Vision
- FaceLandmarker 用于人脸检测
- Canvas API 用于图像处理

## 注意事项

1. 确保摄像头权限已授权
2. 人脸检测模型需要正确加载
3. 视频分辨率会影响裁剪精度
4. 建议在光线充足的环境下使用
