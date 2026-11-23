// WebGPU 渲染器：GPU 光线追迹可视化通道
// 注意：权威屈光度数值以 CPU f64 物理内核为准，WebGPU 只负责高速成像与交互预览
import type { GlassStack } from '@/physics/glass_stack'
import type { InspectionStation, VehicleProfile } from '@/types'

export type GpuContext = {
  device: GPUDevice
  context: GPUCanvasContext
  format: GPUTextureFormat
}

export async function initWebGpu(canvas: HTMLCanvasElement): Promise<GpuContext | null> {
  if (!navigator.gpu) return null
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) return null
  const device = await adapter.requestDevice()
  const context = canvas.getContext('webgpu')
  if (!context) return null
  const format = navigator.gpu.getPreferredCanvasFormat()
  context.configure({ device, format, alphaMode: 'premultiplied' })
  return { device, context, format }
}

// 高度场打包成 GPU 纹理（r32float）
export function uploadField(device: GPUDevice, field: GlassStack['interfaces'][number]): GPUTexture {
  const data = new Float32Array(field.z.length)
  for (let i = 0; i < field.z.length; i++) data[i] = field.z[i]
  const texture = device.createTexture({
    size: { width: field.nx, height: field.ny },
    format: 'r32float',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  })
  device.queue.writeTexture(
    { texture },
    data,
    { bytesPerRow: field.nx * 4, rowsPerImage: field.ny },
    { width: field.nx, height: field.ny },
  )
  return texture
}

const SHADER = /* wgsl */ `
struct Uniforms {
  eye: vec3<f32>,
  boardDistance: f32,
  stripePeriod: f32,
  stripeAngle: f32,
  width: f32,
  height: f32,
  nx: f32,
  ny: f32,
}
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var fieldTex: texture_2d<f32>;

fn sampleField(uv: vec2<f32>) -> f32 {
  let p = uv * vec2<f32>(u.nx - 1.0, u.ny - 1.0);
  return textureLoad(fieldTex, vec2<i32>(p), 0).r;
}

@vertex
fn vs(@builtin(vertex_index) idx: u32) -> @builtin(position) vec4<f32> {
  var pos = array<vec2<f32>, 6>(
    vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0),
    vec2(-1.0, 1.0), vec2(1.0, -1.0), vec2(1.0, 1.0),
  );
  return vec4(pos[idx], 0.0, 1.0);
}

// 斑马板条纹（像素级可视化，不参与权威数值计算）
@fragment
fn fs(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
  let aspect = 1.0;
  let ndc = vec2<f32>(
    frag.x / 400.0 * 2.0 - 1.0,
    1.0 - frag.y / 400.0 * 2.0,
  );
  let dir = normalize(vec3<f32>(ndc.x * 0.27 * aspect, ndc.y * 0.27, -1.0));
  let boardZ = u.eye.z - u.boardDistance;
  let t = (boardZ - u.eye.z) / dir.z;
  let bx = u.eye.x + dir.x * t;
  let by = u.eye.y + dir.y * t;
  let a = u.stripeAngle;
  let along = bx * cos(a) + by * sin(a);
  let phase = along / u.stripePeriod;
  let stripe = 0.5 + 0.5 * cos(phase * 6.2831853);
  let gray = mix(0.06, 0.97, stripe);
  return vec4<f32>(vec3<f32>(gray), 1.0);
}
`

export function createZebraPipeline(gpu: GpuContext) {
  const module = gpu.device.createShaderModule({ code: SHADER })
  return gpu.device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format: gpu.format }] },
    primitive: { topology: 'triangle-list' },
  })
}

export type ZebraUniform = {
  eye: VehicleProfile['eyePoint']
  station: InspectionStation
  width: number
  height: number
  nx: number
  ny: number
}

export function renderZebraGpu(
  gpu: GpuContext,
  pipeline: GPURenderPipeline,
  fieldTexture: GPUTexture,
  data: ZebraUniform,
) {
  const uniform = new Float32Array([
    data.eye.x, data.eye.y, data.eye.z,
    data.station.boardDistance,
    data.station.stripePeriod,
    (data.station.stripeAngleDeg * Math.PI) / 180,
    data.width, data.height, data.nx, data.ny,
    0, 0, 0, 0, 0, 0,
  ])
  const uniformBuffer = gpu.device.createBuffer({
    size: uniform.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  gpu.device.queue.writeBuffer(uniformBuffer, 0, uniform)
  const bind = gpu.device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: fieldTexture.createView() },
    ],
  })
  const encoder = gpu.device.createCommandEncoder()
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: gpu.context.getCurrentTexture().createView(),
      clearValue: { r: 0.05, g: 0.07, b: 0.1, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    }],
  })
  pass.setPipeline(pipeline)
  pass.setBindGroup(0, bind)
  pass.draw(6)
  pass.end()
  gpu.device.queue.submit([encoder.finish()])
}
