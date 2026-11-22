// 玻璃曲面构建：控制曲线插值 / 点云拟合，叠加制造缺陷，输出 HeightField
import { HeightField, fieldFromFn } from './surface'
import { ControlCurve, GlassSurface, ManufactureDefect } from '../models/types'
import { clamp } from './vector'

// 一维线性插值（控制点按 xNorm 排序）
const interp1d = (xs: number[], ys: number[], x: number): number => {
  if (x <= xs[0]) return ys[0]
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1]
  for (let i = 0; i < xs.length - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      const t = (x - xs[i]) / (xs[i + 1] - xs[i])
      return ys[i] + (ys[i + 1] - ys[i]) * t
    }
  }
  return ys[ys.length - 1]
}

// 控制曲线 -> 基准矢高场 f0(x,y)
// 归一化坐标 xNorm、yNorm 由玻璃宽高映射
export const controlCurveField = (
  curves: ControlCurve[],
  width: number,
  height: number
): HeightField => {
  const sorted = [...curves].sort((a, b) => a.yNorm - b.yNorm)
  const yNorms = sorted.map((c) => c.yNorm)
  const fn = (x: number, y: number) => {
    const xNorm = clamp(x / width + 0.5, 0, 1)
    const yNorm = clamp(y / height + 0.5, 0, 1)
    // 每条曲线在该 x 的矢高
    const sags = sorted.map((c) => {
      const pts = [...c.points].sort((a, b) => a.xNorm - b.xNorm)
      return interp1d(
        pts.map((p) => p.xNorm),
        pts.map((p) => p.sag),
        xNorm
      )
    })
    return interp1d(yNorms, sags, yNorm)
  }
  return fieldFromFn(fn, 1e-5)
}

// 点云最小二乘二次曲面拟合：z = a + bx + cy + dx² + ey² + fxy
// 返回解析 HeightField，拟合系数可在视图层展示
export interface QuadFit {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export const fitPointCloud = (cloud: { x: number; y: number; z: number }[]): QuadFit => {
  const n = cloud.length
  // 正规方程 A^T A c = A^T z，6 个基函数
  const AT = Array.from({ length: 6 }, () => new Array(n).fill(0))
  const zVec = new Array(n).fill(0)
  cloud.forEach((p, i) => {
    AT[0][i] = 1
    AT[1][i] = p.x
    AT[2][i] = p.y
    AT[3][i] = p.x * p.x
    AT[4][i] = p.y * p.y
    AT[5][i] = p.x * p.y
    zVec[i] = p.z
  })
  const ATA = Array.from({ length: 6 }, (_, r) =>
    Array.from({ length: 6 }, (_, c) => {
      let s = 0
      for (let i = 0; i < n; i++) s += AT[r][i] * AT[c][i]
      return s
    })
  )
  const ATz = AT.map((row) => row.reduce((s, v, i) => s + v * zVec[i], 0))
  const coef = solveLinear6(ATA, ATz)
  return { a: coef[0], b: coef[1], c: coef[2], d: coef[3], e: coef[4], f: coef[5] }
}

// 6 阶高斯消元（带部分主元）
const solveLinear6 = (M: number[][], b: number[]): number[] => {
  const m = M.map((row, r) => [...row, b[r]])
  for (let col = 0; col < 6; col++) {
    let piv = col
    for (let r = col + 1; r < 6; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r
    ;[m[col], m[piv]] = [m[piv], m[col]]
    for (let r = 0; r < 6; r++) {
      if (r === col) continue
      const f = m[r][col] / m[col][col]
      for (let c = col; c <= 6; c++) m[r][c] -= f * m[col][c]
    }
  }
  return m.map((row, i) => row[6] / row[i])
}

export const quadField = (q: QuadFit): HeightField =>
  fieldFromFn(
    (x, y) => q.a + q.b * x + q.c * y + q.d * x * x + q.e * y * y + q.f * x * y,
    1e-5,
    {
      dx: (x, _y) => q.b + 2 * q.d * x,
      dy: (_x, y) => q.c + 2 * q.e * y,
      dxx: () => 2 * q.d,
      dyy: () => 2 * q.e,
      dxy: () => q.f
    }
  )

// 制造缺陷对矢高的扰动
const defectOffset = (def: ManufactureDefect, x: number, y: number, width: number, height: number): number => {
  if (!def.enabled) return 0
  const cx = (def.xNorm - 0.5) * width
  const cy = (def.yNorm - 0.5) * height
  const r2 = (x - cx) ** 2 + (y - cy) ** 2
  const r = def.radius
  switch (def.type) {
    // 局部厚度不均：高斯鼓包/凹陷
    case 'thickness_uneven':
      return def.amplitude * Math.exp(-r2 / (2 * r * r))
    // 弯曲成型波纹：高斯包络内的正弦波纹
    case 'forming_ripple':
      return (
        def.amplitude *
        Math.exp(-r2 / (2 * r * r)) *
        Math.sin(2 * Math.PI * def.frequency * (x - cx))
      )
    // 边部应力凸起：靠近边缘的局部隆起，用边缘距离衰减
    case 'edge_stress': {
      const edgeX = width / 2 - Math.abs(x)
      const edgeY = height / 2 - Math.abs(y)
      const edgeDist = Math.min(edgeX, edgeY)
      const edgeGate = Math.exp(-Math.max(0, edgeDist) / r)
      return def.amplitude * edgeGate * Math.exp(-r2 / (2 * r * r))
    }
  }
}

// 构建带缺陷的最终高度场（基准 + 缺陷扰动）
export const buildGlassField = (
  surface: GlassSurface,
  width: number,
  height: number,
  fit?: QuadFit
): HeightField => {
  const base: HeightField =
    surface.source === 'point_cloud' && fit
      ? quadField(fit)
      : controlCurveField(surface.controlCurves, width, height)
  const fn = (x: number, y: number) => {
    let z = base.eval(x, y)
    for (const d of surface.defects) z += defectOffset(d, x, y, width, height)
    return z
  }
  return fieldFromFn(fn, 1e-5)
}
