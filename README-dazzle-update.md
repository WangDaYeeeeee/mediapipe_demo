# 炫彩打光逻辑改造说明

## 修改内容

### 1. 改造前
- 使用CSS动画实现炫彩效果
- 固定的红、蓝、绿、黄渐变背景
- 动画持续2秒，透明度从0到0.8再到0

### 2. 改造后
- 使用JavaScript动态控制颜色变化
- 每次闪光间隔120ms
- 使用指定的18种颜色序列

## 颜色序列

```javascript
const colorList = [
  [0, 0, 0, 76],        // 黑色，透明度76
  [15, 95, 35, 159],    // 深绿色，透明度159
  [31, 191, 70, 242],   // 亮绿色，透明度242
  [31, 191, 70, 242],   // 亮绿色，透明度242
  [31, 191, 70, 242],   // 亮绿色，透明度242
  [31, 191, 70, 242],   // 亮绿色，透明度242
  [55, 30, 200, 242],   // 蓝色，透明度242
  [55, 30, 200, 242],   // 蓝色，透明度242
  [55, 30, 200, 242],   // 蓝色，透明度242
  [55, 30, 200, 242],   // 蓝色，透明度242
  [31, 191, 70, 242],   // 亮绿色，透明度242
  [31, 191, 70, 242],   // 亮绿色，透明度242
  [31, 191, 70, 242],   // 亮绿色，透明度242
  [31, 191, 70, 242],   // 亮绿色，透明度242
  [31, 191, 70, 242],   // 亮绿色，透明度242
  [15, 95, 35, 159],    // 深绿色，透明度159
  [0, 0, 0, 76],        // 黑色，透明度76
  [204, 204, 204, 17]   // 浅灰色，透明度17
];
```

## 技术实现

### 1. 修改的文件
- `src/main.ts`: 修改 `dazzle` 方法
- `index.html`: 移除CSS动画，改为JavaScript控制

### 2. 核心逻辑
```javascript
private async dazzle(onFrame: OnFrame): Promise<void> {
  return new Promise((resolve, _) => {
    let currentIndex = 0;
    
    const updateColor = () => {
      if (currentIndex < colorList.length) {
        const [r, g, b, a] = colorList[currentIndex];
        this.colorBackground.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${a / 255})`;
        this.colorBackground.style.opacity = '1';
        currentIndex++;
        setTimeout(updateColor, 120);
      } else {
        this.colorBackground.style.opacity = '0';
        resolve();
      }
    };
    
    updateColor();
  });
}
```

### 3. CSS修改
```css
.color-background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0);
  opacity: 0;
  pointer-events: none;
  z-index: 1;
  transition: background-color 0.1s ease;
}
```

## 测试

创建了 `test-dazzle.html` 测试页面，可以独立测试炫彩效果：

1. 打开 `test-dazzle.html`
2. 点击"开始测试"按钮
3. 观察颜色变化效果
4. 查看状态显示当前颜色信息

## 效果说明

- 总时长：18个颜色 × 120ms = 2160ms ≈ 2.16秒
- 颜色变化：从黑色开始，经过绿色、蓝色，最后回到浅灰色
- 透明度变化：从76到242，提供丰富的视觉效果
- 平滑过渡：使用CSS transition实现颜色平滑切换

## 注意事项

1. 颜色数组中的透明度值需要除以255转换为CSS的rgba格式
2. 使用setTimeout确保120ms的精确间隔
3. 动画结束后自动隐藏背景元素
4. 保持了原有的Promise异步处理机制
