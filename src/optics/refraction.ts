// 矢量形式 Snell 折射，f64 精度
// 约定：入射方向 i 指向界面，法线 n 指向入射侧；均无需单位化（内部归一）
import { Vec3, dot, normalize, scale, add } from './vector'

export interface RefractResult {
  dir: Vec3
  // 是否发生全反射
  tir: boolean
}

export const refract = (
  i: Vec3,
  n: Vec3,
  eta: number
): RefractResult => {
  const id = normalize(i)
  let nd = normalize(n)
  // 让法线与入射方向处于相反半球（cosI < 0）
  const cosCheck = dot(id, nd)
  if (cosCheck > 0) nd = scale(nd, -1)
  const cosI = -dot(id, nd)
  const sin2T = eta * eta * Math.max(0, 1 - cosI * cosI)
  if (sin2T > 1) {
    // 全反射：返回反射方向兜底（风挡常规入射角不会走到这里）
    const r = add(id, scale(nd, 2 * cosI))
    return { dir: normalize(r), tir: true }
  }
  const cosT = Math.sqrt(1 - sin2T)
  // t = eta*i + (eta*cosI - cosT)*n
  const t = add(scale(id, eta), scale(nd, eta * cosI - cosT))
  return { dir: normalize(t), tir: false }
}

// 平面界面折射（法线已知，省去曲面求交），用于板上投影等
export const refractPlane = refract
