# MediaPipe FaceLandmarker Demo

基于 MediaPipe Tasks Vision 的人脸特征识别 H5 应用，使用最新的 FaceLandmarker API。

## 功能特性

- 🎭 实时人脸特征点检测
- 👁️ 精确的眼部、眉毛、嘴唇轮廓识别
- 🖼️ 面部网格可视化
- 📱 响应式设计，支持移动端
- ⚡ 基于 WebGL 的 GPU 加速
- 🎨 现代化的 UI 设计

## 技术栈

- **MediaPipe Tasks Vision**: 最新的人脸特征识别 API
- **TypeScript**: 类型安全的 JavaScript
- **Vite**: 快速的构建工具
- **HTML5 Canvas**: 实时绘制人脸特征点

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run dev
```

应用将在 `http://localhost:3000` 启动。

### 构建生产版本

```bash
npm run build
```

## 使用方法

1. 打开应用后，等待 MediaPipe 模型加载完成
2. 点击"开始检测"按钮
3. 允许浏览器访问摄像头
4. 将脸对准摄像头，观察实时的人脸特征点检测
5. 点击"停止检测"按钮结束检测

## 检测特征

应用可以检测以下人脸特征：

- **面部轮廓** (Face Oval): 白色线条
- **左眼** (Left Eye): 绿色线条
- **右眼** (Right Eye): 红色线条
- **左眉毛** (Left Eyebrow): 绿色线条
- **右眉毛** (Right Eyebrow): 红色线条
- **嘴唇** (Lips): 白色线条
- **左眼虹膜** (Left Iris): 绿色线条
- **右眼虹膜** (Right Iris): 红色线条
- **面部网格** (Face Tesselation): 半透明网格

## 浏览器兼容性

- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

**注意**: 需要支持 WebGL 和 getUserMedia API。

## 项目结构

```
mediapipe-face/
├── src/
│   └── main.ts          # 主要应用逻辑
├── index.html           # HTML 页面
├── package.json         # 项目配置
├── vite.config.ts       # Vite 配置
└── README.md           # 项目说明
```

## 开发说明

### 主要类: FaceDetectionDemo

- `initializeElements()`: 初始化 DOM 元素
- `initializeMediaPipe()`: 加载 MediaPipe 模型
- `startDetection()`: 启动摄像头检测
- `stopDetection()`: 停止检测
- `predictWebcam()`: 实时预测和绘制
- `updateStatus()`: 更新状态显示

### 状态管理

应用包含四种状态类型：
- `loading`: 加载中状态
- `success`: 成功状态
- `error`: 错误状态
- `info`: 信息状态

## 故障排除

### 常见问题

1. **模型加载失败**
   - 检查网络连接
   - 刷新页面重试

2. **摄像头无法启动**
   - 检查浏览器权限设置
   - 确保摄像头未被其他应用占用

3. **检测不准确**
   - 确保光线充足
   - 保持面部在摄像头中心
   - 避免快速移动

## 许可证

本项目基于 Apache License 2.0 开源。

## 更新日志

### v1.0.0
- 升级到 MediaPipe Tasks Vision 0.10.3
- 使用新的 FaceLandmarker API
- 改进 UI 设计和用户体验
- 添加状态管理和错误处理 