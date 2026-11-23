import type { Vec3 } from '../types.ts'
import { add, normalize, scale } from './vector.ts'
import { sampleField, sampleGradient, type HeightField } from './heightfield.ts'
import type { GlassStack } from './glass_stack.ts'

export type TraceResult = {
  hit: boolean
  // 出玻璃后的光线
  origin: Vec3
  direction: Vec3
  // 斑马板平面交点
  boardPoint: Vec3 | null
  // 光线与外表面的第一个交点（玻璃上的落点）
  glassPoint: Vec3 | null
  // 是否发生全反射
  totalReflection: boolean
}

// 矢量形式 Snell 折射；全反射返回 null
export function refract(incident: Vec3, normal: Vec3, n1: number, n2: number): Vec3 | null {
  const eta = n1 / n2
  const cosi = -incident.x * normal.x - incident.y * normal.y - incident.z * normal.z
  const sin2t = eta * eta * (1 - cosi * cosi)
  if (sin2t > 1) return null
  const cost = Math.sqrt(1 - sin2t)
  return normalize({
    x: eta * incident.x + (eta * cosi - cost) * normal.x,
    y: eta * incident.y + (eta * cosi - cost) * normal.y,
    z: eta * incident.z + (eta * cosi - cost) * normal.z,
  })
}

// 光线与高度场 z=f(x,y) 求交：包围盒 slab 内步进，跨界面后二分精化
const fieldBoundsCache = new WeakMap<HeightField, { min: number; max: number }>()

function fieldBounds(field: HeightField) {
  let b = fieldBoundsCache.get(field)
  if (!b) {
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < field.z.length; i++) {
      min = Math.min(min, field.z[i])
      max = Math.max(max, field.z[i])
    }
    b = { min, max }
    fieldBoundsCache.set(field, b)
  }
  return b
}

export function intersectField(
  origin: Vec3, dir: Vec3, field: HeightField,
  step = 0.2, maxSteps = 400000,
): { point: Vec3; normal: Vec3 } | null {
  if (Math.abs(dir.z) < 1e-9) return null
  const b = fieldBounds(field)
  // 光线与 field 包围盒求交，取参数区间 [tEnter, tExit]
  let tEnter = 0
  let tExit = Infinity
  const axes: [number, number, number, number][] = [
    [origin.x, dir.x, -field.width / 2, field.width / 2],
    [origin.y, dir.y, -field.height / 2, field.height / 2],
    [origin.z, dir.z, b.min - 2, b.max + 2],
  ]
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return null
      continue
    }
    const t1 = (lo - o) / d
    const t2 = (hi - o) / d
    tEnter = Math.max(tEnter, Math.min(t1, t2))
    tExit = Math.min(tExit, Math.max(t1, t2))
  }
  if (tExit < tEnter || tExit < 0) return null
  tEnter = Math.max(0, tEnter)

  // 直接跳到包围盒入口，避免长距离空气段空转
  const start = add(origin, scale(dir, tEnter))
  const inside = (p: Vec3) =>
    Math.abs(p.x) <= field.width / 2 && Math.abs(p.y) <= field.height / 2
  let tPrev = 0
  let gPrev = gap(start, field)
  let active = inside(start)
  const span = tExit - tEnter
  const steps = Math.min(maxSteps, Math.ceil(span / step) + 1)

  for (let i = 1; i <= steps; i++) {
    const tLocal = Math.min(span, i * step)
    const p = add(start, scale(dir, tLocal))
    if (!inside(p)) {
      active = false
      tPrev = tLocal
      continue
    }
    const g = gap(p, field)
    if (!active) {
      // 首次进入 footprint：以此处为寻根起点
      active = true
      tPrev = tLocal
      gPrev = g
      continue
    }
    if (g * gPrev <= 0) {
      let lo = tPrev
      let hi = tLocal
      for (let k = 0; k < 28; k++) {
        const mid = (lo + hi) / 2
        const pm = add(start, scale(dir, mid))
        if (gap(pm, field) * gap(add(start, scale(dir, lo)), field) <= 0) hi = mid
        else lo = mid
      }
      const point = add(start, scale(dir, (lo + hi) / 2))
      const grad = sampleGradient(field, point.x, point.y)
      const normal = normalize({ x: -grad.dzdx, y: -grad.dzdy, z: 1 })
      return { point, normal }
    }
    tPrev = tLocal
    gPrev = g
    if (tLocal >= span) break
  }
  return null
}

function gap(p: Vec3, field: HeightField): number {
  if (Math.abs(p.x) > field.width / 2 || Math.abs(p.y) > field.height / 2) return 1
  return p.z - sampleField(field, p.x, p.y)
}

function planeIntersect(origin: Vec3, dir: Vec3, zPlane: number): Vec3 | null {
  if (Math.abs(dir.z) < 1e-12) return null
  const t = (zPlane - origin.z) / dir.z
  if (t < 0) return null
  return add(origin, scale(dir, t))
}

// 完整追迹：眼点出发，依次穿过 4 个界面，落到斑马板
export function traceRay(stack: GlassStack, origin: Vec3, direction: Vec3, boardZ: number): TraceResult {
  let o = origin
  let d = normalize(direction)
  let glassPoint: Vec3 | null = null

  for (let i = 0; i < stack.interfaces.length; i++) {
    const hit = intersectField(o, d, stack.interfaces[i])
    if (!hit) {
      // 未命中玻璃 footprint：直线传播
      if (i === 0) {
        return {
          hit: false, origin: o, direction: d,
          boardPoint: planeIntersect(o, d, boardZ), glassPoint: null,
          totalReflection: false,
        }
      }
      return { hit: true, origin: o, direction: d, boardPoint: null, glassPoint, totalReflection: false }
    }
    if (i === 0) glassPoint = hit.point
    const refracted = refract(d, hit.normal, stack.nIncident[i], stack.nTransmit[i])
    if (!refracted) {
      return { hit: true, origin: hit.point, direction: d, boardPoint: null, glassPoint, totalReflection: true }
    }
    o = add(hit.point, scale(refracted, 1e-3))
    d = refracted
  }

  return {
    hit: true, origin: o, direction: d,
    boardPoint: planeIntersect(o, d, boardZ), glassPoint, totalReflection: false,
  }
}

// 仅追迹穿玻璃后的出射方向（屈光度差分用）
export function traceExitDirection(stack: GlassStack, origin: Vec3, direction: Vec3): Vec3 | null {
  const r = traceRay(stack, origin, direction, 0)
  return r.totalReflection ? null : r.direction
}
