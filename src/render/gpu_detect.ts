// WebGPU 能力探测
export interface GpuCapability {
  supported: boolean
  adapter: GPUAdapter | null
  device: GPUDevice | null
  reason?: string
}

let cached: GpuCapability | null = null

export const detectWebGpu = async (): Promise<GpuCapability> => {
  if (cached) return cached
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    cached = { supported: false, adapter: null, device: null, reason: '当前浏览器不支持 WebGPU' }
    return cached
  }
  try {
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) {
      cached = { supported: false, adapter: null, device: null, reason: '未找到可用 GPU 适配器' }
      return cached
    }
    const device = await adapter.requestDevice()
    cached = { supported: true, adapter, device }
    return cached
  } catch (e) {
    cached = {
      supported: false,
      adapter: null,
      device: null,
      reason: `GPU 初始化失败：${e instanceof Error ? e.message : String(e)}`
    }
    return cached
  }
}
