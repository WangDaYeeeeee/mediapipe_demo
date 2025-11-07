// API服务工具类，用于处理3D建模和重打光接口

import { ReflectFrame } from './main';

// 3D人脸建模接口配置
const MODELING_SERVER_URL = 'https://david-server.fliggy.test:80';
const MODELING_ENDPOINT = '/process_with_base64';

// 人脸重打光接口配置
const RELIGHT_SERVER_URL = 'https://lamplighter.fliggy.test:80';
const RELIGHT_ENDPOINT = '/relight/';

// 3D建模响应结果
export interface DAViDResponse {
  readonly depth_map: string;
  readonly normal_map: string;
  readonly foreground_mask: string;
  readonly background_removed: string;
  readonly status: string;
  readonly error?: string;
}

// 重打光响应结果
export interface RelightingResponse {
  success: boolean;
  data: {
    readonly frame: string;
    readonly time: number;
    readonly x: number;
    readonly y: number;
  };
}

/**
 * 3D人脸建模接口
 * 对输入的人脸图片进行3D建模，返回深度图和法线图
 * @param imageBase64 未经裁剪的原始帧base64（使用uncroppedFrame保证建模质量）
 * @returns 包含深度图和法线图的响应对象
 * @throws 如果请求失败或响应格式不正确
 */
export async function requestDAViD(imageBase64: string): Promise<DAViDResponse> {
  try {
    const response = await fetch(`${MODELING_SERVER_URL}${MODELING_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64 }),
    });

    if (!response.ok) {
      throw new Error(`3D建模请求失败: HTTP ${response.status} ${response.statusText}`);
    }

    return await response.json() as DAViDResponse;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`3D人脸建模失败: ${error.message}`);
    }
    throw new Error(`3D人脸建模失败: ${String(error)}`);
  }
}

/**
 * 人脸重打光接口
 * 对输入的人脸帧进行重打光处理
 * @param frame ReflectFrame对象，包含帧信息
 * @param color 颜色字符串，格式为 #RRGGBB，例如 #1FBF46
 * @returns 包含重打光后图片的响应对象
 * @throws 如果请求失败或响应格式不正确
 */
export async function requestRelighting(
  frame: ReflectFrame,
  color: string
): Promise<RelightingResponse> {
  try {
    // 验证颜色格式
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      throw new Error(`颜色格式不正确: ${color}，应为 #RRGGBB 格式`);
    }

    const response = await fetch(`${RELIGHT_SERVER_URL}${RELIGHT_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frame, color }),
    });

    if (!response.ok) {
      throw new Error(`重打光请求失败: HTTP ${response.status} ${response.statusText}`);
    }

    const result: RelightingResponse = await response.json();

    // 验证响应格式
    if (typeof result.success !== 'boolean') {
      throw new Error('重打光响应格式不正确: 缺少 success 字段');
    }

    if (!result.success) {
      throw new Error('重打光处理失败: 服务器返回 success=false');
    }

    if (!result.data || !result.data.frame) {
      throw new Error('重打光响应格式不正确: 缺少 data.frame 字段');
    }

    return result;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`人脸重打光失败: ${error.message}`);
    }
    throw new Error(`人脸重打光失败: ${String(error)}`);
  }
}

