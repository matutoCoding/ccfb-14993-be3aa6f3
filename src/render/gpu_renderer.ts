// WebGPU 片元着色器斑马条纹渲染：逐像素在 GPU 上做近轴双层折射追光
// CPU 物理引擎负责权威数值，这里只做高性能可视化，不参与判定
import { GpuCapability } from './gpu_detect'

const WGSL = /* wgsl */ `
struct Uniforms {
  resolution: vec2<f32>,
  boardDistance: f32,
  stripePeriod: f32,
  stripeAngle: f32,
  eyeZ: f32,
  nGlass: f32,
  nPvb: f32,
  tGlass: f32,
  tPvb: f32,
  curvature: f32,
  defectAmp: f32,
  defectRadius: f32,
  defectFreq: f32,
  defectMode: f32,
  pad: vec2<f32>,
};
@group(0) @binding(0) var<uniform> U: Uniforms;

fn refract2d(ci: f32, eta: f32) -> f32 {
  let sinT = eta * sin(ci);
  return asin(clamp(sinT, -1.0, 1.0));
}

@fragment
fn fsMain(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = frag.xy / U.resolution;
  // 玻璃局部坐标（米），以中心为原点
  let p = (uv - 0.5) * vec2<f32>(1.35, 0.95);
  // 基准球面曲率的局部法线倾角（近轴）
  let baseSlope = U.curvature * p.y;
  // 缺陷扰动法线：高斯鼓包/波纹
  let r2 = dot(p, p);
  let gate = exp(-r2 / (2.0 * U.defectRadius * U.defectRadius));
  var defectSlope = 0.0;
  if (U.defectMode > 0.5 && U.defectMode < 1.5) {
    defectSlope = U.defectAmp * gate * (-(p.y) / (U.defectRadius * U.defectRadius));
  } else if (U.defectMode >= 1.5) {
    let s = sin(6.28318 * U.defectFreq * p.x);
    defectSlope = U.defectAmp * gate * 6.28318 * U.defectFreq * cos(6.28318 * U.defectFreq * p.x);
  }
  let normalAngle = baseSlope + defectSlope;
  // 眼点入射方向（玻璃系，反向追迹沿 +z）
  let inAngle = atan2(p.y, -U.eyeZ);
  // 四界面近轴 Snell 追迹（角度叠加法线偏折）
  var ang = inAngle;
  let eta1 = 1.0 / U.nGlass;
  ang = refract2d(ang - normalAngle, eta1) + normalAngle;
  let eta2 = U.nGlass / U.nPvb;
  ang = refract2d(ang, eta2);
  let eta3 = U.nPvb / U.nGlass;
  ang = refract2d(ang, eta3);
  let eta4 = U.nGlass;
  ang = refract2d(ang + normalAngle, eta4) - normalAngle;
  // 板上命中位置
  let boardU = tan(ang) * U.boardDistance + p.x;
  // 条纹方向旋转
  let a = U.stripeAngle + 1.5708;
  let along = boardU * cos(a);
  let phase = (along / U.stripePeriod) % 1.0;
  let bright = select(0.1, 0.96, phase < 0.5);
  return vec4<f32>(vec3<f32>(bright), 1.0);
}

@vertex
fn vsMain(@builtin(vertex_index) idx: u32) -> @builtin(position) vec4<f32> {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0));
  return vec4<f32>(pos[idx], 0.0, 1.0);
}
`

export interface GpuRenderParams {
  width: number
  height: number
  boardDistance: number
  stripePeriod: number
  stripeAngle: number
  eyeZ: number
  nGlass: number
  nPvb: number
  tGlass: number
  tPvb: number
  curvature: number
  defectAmp: number
  defectRadius: number
  defectFreq: number
  defectMode: number
}

export class GpuStripeRenderer {
  private device: GPUDevice
  private context: GPUCanvasContext
  private format: GPUTextureFormat
  private pipeline: GPURenderPipeline
  private uniformBuffer: GPUBuffer
  private bindGroup: GPUBindGroup

  private constructor(cap: GpuCapability, canvas: HTMLCanvasElement) {
    this.device = cap.device!
    this.context = canvas.getContext('webgpu')!
    this.format = navigator.gpu.getPreferredCanvasFormat()
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'premultiplied' })

    const module = this.device.createShaderModule({ code: WGSL })
    this.pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vsMain' },
      fragment: { module, entryPoint: 'fsMain', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' }
    })
    this.uniformBuffer = this.device.createBuffer({
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })
    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }]
    })
  }

  static async create(canvas: HTMLCanvasElement): Promise<GpuStripeRenderer | null> {
    const { detectWebGpu } = await import('./gpu_detect')
    const cap = await detectWebGpu()
    if (!cap.supported) return null
    return new GpuStripeRenderer(cap, canvas)
  }

  render(p: GpuRenderParams): void {
    const data = new Float32Array([
      p.width, p.height, p.boardDistance, p.stripePeriod,
      p.stripeAngle, p.eyeZ, p.nGlass, p.nPvb,
      p.tGlass, p.tPvb, p.curvature, p.defectAmp,
      p.defectRadius, p.defectFreq, p.defectMode, 0,
      0, 0, 0, 0
    ])
    this.device.queue.writeBuffer(this.uniformBuffer, 0, data)
    const encoder = this.device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0.06, g: 0.08, b: 0.12, a: 1 },
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    })
    pass.setPipeline(this.pipeline)
    pass.setBindGroup(0, this.bindGroup)
    pass.draw(6)
    pass.end()
    this.device.queue.submit([encoder.finish()])
  }
}
