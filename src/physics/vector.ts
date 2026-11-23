import type { Vec3 } from '../types.ts'

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z })
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})

export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a)
  if (l < 1e-15) return { x: 0, y: 0, z: 0 }
  return scale(a, 1 / l)
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

// 双线性插值
export function bilerp(
  q00: number, q10: number, q01: number, q11: number,
  tx: number, ty: number,
): number {
  const a = q00 + (q10 - q00) * tx
  const b = q01 + (q11 - q01) * tx
  return a + (b - a) * ty
}

// Catmull-Rom 一维插值（t in [0,1]）
export function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (
    2 * p1
    + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  )
}

export const clamp = (x: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, x))

export const deg2rad = (d: number): number => (d * Math.PI) / 180
export const rad2deg = (r: number): number => (r * 180) / Math.PI
