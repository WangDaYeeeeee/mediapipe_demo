# MediaPipe 人脸识别 Demo

基于 MediaPipe 的 H5 人脸特征识别演示项目。

## 功能特性

- 实时人脸检测
- 人脸特征识别
- 移动端适配
- 炫彩背景效果

## 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

## GitHub Pages 部署

### 自动部署（推荐）

1. 确保代码已推送到 GitHub 仓库的 `main` 或 `master` 分支
2. 在 GitHub 仓库设置中启用 GitHub Pages：
   - 进入仓库 Settings > Pages
   - Source 选择 "GitHub Actions"
3. 推送代码到主分支，GitHub Actions 会自动构建并部署

### 手动部署

```bash
# 安装 gh-pages
npm install --save-dev gh-pages

# 部署到 GitHub Pages
npm run deploy
```

## 访问地址

部署完成后，可以通过以下地址访问：
`https://wangdayeeeeee.github.io/mediapipe_demo/`

## 技术栈

- TypeScript
- Vite
- MediaPipe
- FFmpeg.wasm

## 浏览器兼容性

- Chrome 88+
- Safari 14+
- Firefox 85+
- Edge 88+

## 注意事项

- 需要 HTTPS 环境才能正常使用摄像头
- 建议在移动设备上使用以获得最佳体验 