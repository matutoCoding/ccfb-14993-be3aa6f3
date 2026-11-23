import type { DiopterMap, DiopterSample, InspectionStation, VehicleProfile } from '../types.ts'
import { MM_PER_M } from './constants.ts'
import { deg2rad, v3 } from './vector.ts'
import type { GlassStack } from './glass_stack.ts'
import { traceRay } from './ray_tracer.ts'
import { phaseShiftIntensity, wrappedPhase } from './zebra.ts'
import { classifyZone } from './diopter.ts'
import { clamp } from './vector.ts'

export type InverseInput = {
  stack: GlassStack
  vehicle: VehicleProfile
  station: InspectionStation
  nx: number
  ny: number
  limitA: number
  limitB: number
}

type PixelRecord = {
  gx: number
  gy: number
  phase: number
  valid: boolean
}

// 仿真相机拍四步相移条纹 → 提取相位 → 解包裹 → 按玻璃坐标重采样 → 屈光度
export function computeInverseDiopterMap(input: InverseInput): DiopterMap {
  const { stack, vehicle, station, nx, ny } = input
  const eye = {
    x: vehicle.eyePoint.x + station.eyeOffset.x,
    y: vehicle.eyePoint.y + station.eyeOffset.y,
    z: vehicle.eyePoint.z + station.eyeOffset.z,
  }
  const boardZ = eye.z - station.boardDistance
  const field = stack.interfaces[0]
  const { width, height } = field
  const pixels = new Array<PixelRecord>(nx * ny)
  const aspect = station.cameraWidth / station.cameraHeight
  const halfTan = Math.tan(deg2rad(station.cameraFovDeg) / 2)

  for (let py = 0; py < ny; py++) {
    for (let px = 0; px < nx; px++) {
      const u = (px / (nx - 1)) * 2 - 1
      const v = 1 - (py / (ny - 1)) * 2
      const dir = v3(u * halfTan * aspect, v * halfTan, -1)
      const intensities: number[] = []
      let gx = 0
      let gy = 0
      let valid = true

      for (let s = 0; s < 4; s++) {
        const r = traceRay(stack, eye, dir, boardZ)
        if (!r.hit || !r.boardPoint || r.totalReflection || !r.glassPoint) {
          valid = false
          break
        }
        gx = r.glassPoint.x
        gy = r.glassPoint.y
        intensities.push(
          phaseShiftIntensity(
            r.boardPoint.x, r.boardPoint.y,
            station.stripePeriod, station.stripeAngleDeg, s, 4,
          ),
        )
      }
      pixels[py * nx + px] = {
        gx, gy,
        phase: valid ? wrappedPhase(intensities[0], intensities[1], intensities[2], intensities[3]) : 0,
        valid,
      }
    }
  }

  const unwrapped = unwrapPhase(pixels, nx, ny)
  return resampleToGlass(input, pixels, unwrapped, eye, width, height)
}

// 行优先解包裹，再按列做偏移修正
function unwrapPhase(pixels: PixelRecord[], nx: number, ny: number): Float64Array {
  const out = new Float64Array(nx * ny)
  for (let py = 0; py < ny; py++) {
    let acc = 0
    let prev = 0
    for (let px = 0; px < nx; px++) {
      const i = py * nx + px
      if (!pixels[i].valid) { out[i] = acc; continue }
      if (px > 0 && pixels[i - 1].valid) acc += unwrapDelta(pixels[i].phase, prev)
      out[i] = acc
      prev = pixels[i].phase
    }
  }
  for (let px = 0; px < nx; px++) {
    let columnShift = 0
    let prev = out[px]
    for (let py = 1; py < ny; py++) {
      const i = py * nx + px
      if (!pixels[i].valid) continue
      columnShift += unwrapDelta(out[i], prev)
      out[i] += columnShift
      prev = out[i] - columnShift
    }
  }
  return out
}

function unwrapDelta(cur: number, prev: number): number {
  let d = cur - prev
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return d
}

// 像素记录按玻璃落点建包围盒网格索引，双线性查相位
function makePhaseSampler(
  pixels: PixelRecord[], phase: Float64Array,
  width: number, height: number, nx: number,
) {
  const cell = Math.max(width, height) / nx
  const cols = Math.ceil(width / cell) + 2
  const rows = Math.ceil(height / cell) + 2
  const buckets: number[][] = Array.from({ length: cols * rows }, () => [])
  pixels.forEach((p, i) => {
    if (!p.valid) return
    const cx = clamp(Math.floor((p.gx + width / 2) / cell), 0, cols - 1)
    const cy = clamp(Math.floor((p.gy + height / 2) / cell), 0, rows - 1)
    buckets[cy * cols + cx].push(i)
  })

  return (gx: number, gy: number): { p: number; ok: boolean } => {
    const cx = clamp(Math.floor((gx + width / 2) / cell), 0, cols - 1)
    const cy = clamp(Math.floor((gy + height / 2) / cell), 0, rows - 1)
    let sumW = 0
    let sumP = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bx = cx + dx
        const by = cy + dy
        if (bx < 0 || by < 0 || bx >= cols || by >= rows) continue
        for (const idx of buckets[by * cols + bx]) {
          const p = pixels[idx]
          const d2 = (p.gx - gx) ** 2 + (p.gy - gy) ** 2
          const w = 1 / (d2 + 1e-6)
          sumW += w
          sumP += w * phase[idx]
        }
      }
    }
    return sumW > 0 ? { p: sumP / sumW, ok: true } : { p: 0, ok: false }
  }
}

function resampleToGlass(
  input: InverseInput, pixels: PixelRecord[], phase: Float64Array,
  eye: { x: number; y: number; z: number }, width: number, height: number,
): DiopterMap {
  const { nx, ny, station, vehicle } = input
  const samplePhase = makePhaseSampler(pixels, phase, width, height, nx)
  const samples: DiopterSample[] = []
  const b = -eye.z
  const g = station.boardDistance
  const geoFactor = MM_PER_M * (1 / b + 1 / g)
  const k = station.stripePeriod / (2 * Math.PI)
  const hStep = width / (nx - 1)
  const vStep = height / (ny - 1)
  const a = deg2rad(station.stripeAngleDeg)
  let maxAbsError = 0

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const gx = -width / 2 + (width * ix) / (nx - 1)
      const gy = -height / 2 + (height * iy) / (ny - 1)
      const zone = classifyZone(gx, gy, vehicle.zones)
      const pl = samplePhase(gx - hStep, gy)
      const pr = samplePhase(gx + hStep, gy)
      const pd = samplePhase(gx, gy - vStep)
      const pu = samplePhase(gx, gy + vStep)
      const ok = pl.ok && pr.ok && pd.ok && pu.ok
      const dSdx = ok ? k * (pr.p - pl.p) / (2 * hStep) : 1
      const dSdy = ok ? k * (pu.p - pd.p) / (2 * vStep) : 1
      // 条纹法向方向的板上位移放大率
      const m = dSdx * Math.cos(a) + dSdy * Math.sin(a)
      const d = ok ? (1 / m - 1) * geoFactor : 0
      const limit = zone === 'A' ? input.limitA : zone === 'B' ? input.limitB : Infinity
      const pass = zone === 'outside' || (Math.abs(d) <= limit)
      if (ok) maxAbsError = Math.max(maxAbsError, Math.abs((1 / m - 1) * geoFactor))
      samples.push({ x: gx, y: gy, dx: d, dy: d, power: Math.abs(d), zone, pass })
    }
  }

  return { nx, ny, width, height, samples, maxAbsError }
}
