/**
 * 将RGBA颜色数组转换为十六进制颜色字符串
 * 如果颜色是半透明的，通过混色模拟底部有黑底的效果
 */
export const rgbaToHex = (colorArray: number[]): string => {
  try {
    const [r, g, b, a = 255] = colorArray
    
    // 如果没有alpha通道或alpha为255（完全不透明），直接返回RGB
    if (a === 255 || a === undefined) {
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    }
    
    // 如果有alpha通道且不是完全不透明，进行混色计算
    // 假设底部是黑色背景 (0, 0, 0)
    const alpha = a / 255 // 归一化到0-1
    const blendedR = Math.round(r * alpha)
    const blendedG = Math.round(g * alpha)
    const blendedB = Math.round(b * alpha)
    
    return `#${blendedR.toString(16).padStart(2, '0')}${blendedG.toString(16).padStart(2, '0')}${blendedB.toString(16).padStart(2, '0')}`
  } catch {
    return '#ff0000' // 默认红色
  }
}

/**
 * 解析颜色列表，将JSON字符串转换为十六进制颜色
 * 支持RGBA颜色，自动处理透明度混色
 */
export const parseColorList = (colorList: string[]): string[] => {
  return colorList.map(colorStr => {
    try {
      const colorArray = JSON.parse(colorStr)
      return rgbaToHex(colorArray)
    } catch {
      return '#ff0000'
    }
  })
}

/**
 * 根据帧索引和总帧数计算光源颜色
 * 直接根据帧的进度选择对应的颜色，不进行插值
 */
export const calculateLightColor = (
  frameIndex: number,
  totalFrames: number,
  colorSequence: string[]
): string => {
  if (colorSequence.length === 0) {
    return '#ff0000' // 默认红色
  }
  
  if (colorSequence.length === 1) {
    return colorSequence[0]
  }
  
  // 计算当前帧在所有帧中的进度 (0-1)
  const progress = frameIndex / (totalFrames - 1)
  
  // 根据进度直接选择对应的颜色索引
  const colorIndex = Math.round(progress * (colorSequence.length - 1))
  
  // 确保索引在有效范围内
  const safeColorIndex = Math.min(colorIndex, colorSequence.length - 1)
  
  return colorSequence[safeColorIndex]
}

/**
 * 测试颜色选择效果
 */
export const testColorGradient = (colorSequence: string[], totalFrames: number): void => {
  console.log('=== 颜色选择测试 ===')
  console.log('颜色序列:', colorSequence)
  console.log('总帧数:', totalFrames)
  console.log('每帧颜色:')
  
  for (let i = 0; i < totalFrames; i++) {
    const color = calculateLightColor(i, totalFrames, colorSequence)
    const progress = i / (totalFrames - 1)
    const colorIndex = Math.round(progress * (colorSequence.length - 1))
    console.log(`帧 ${i + 1} (进度: ${(progress * 100).toFixed(1)}%): ${color} [颜色索引: ${colorIndex}]`)
  }
}

/**
 * 测试RGBA混色效果
 */
export const testRgbaBlending = (): void => {
  console.log('=== RGBA混色测试 ===')
  
  const testCases = [
    { rgba: [255, 0, 0, 255], description: '完全不透明红色' },
    { rgba: [255, 0, 0, 128], description: '半透明红色 (alpha=128)' },
    { rgba: [255, 0, 0, 64], description: '较透明红色 (alpha=64)' },
    { rgba: [0, 255, 0, 128], description: '半透明绿色 (alpha=128)' },
    { rgba: [0, 0, 255, 128], description: '半透明蓝色 (alpha=128)' },
    { rgba: [255, 255, 0, 128], description: '半透明黄色 (alpha=128)' },
    { rgba: [255, 0, 255, 128], description: '半透明紫色 (alpha=128)' },
    { rgba: [0, 255, 255, 128], description: '半透明青色 (alpha=128)' }
  ]
  
  testCases.forEach(({ rgba, description }) => {
    const hex = rgbaToHex(rgba)
    console.log(`${description}: [${rgba.join(', ')}] -> ${hex}`)
  })
}
