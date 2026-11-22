// 逐点屈光度计算（正算）
// 口径一 optical_power：出射角度对采样平面坐标的梯度（1/m = D），用于透镜公式校验
// 口径二 zebra_standard：斑马板命中位置对采样坐标的雅可比，折算为偏角梯度
// 两者在近轴下严格等价；生产判定以标准限值口径为准
import { HeightField } from './surface'
import { LayerSpec, traceLaminate } from './laminate'
import { StationSpec, traceToBoard, eyeDistance, jacobianToDiopter } from './station'
import { normalize, singularValues2x2 } from './vector'
import { GridSpec, DiopterSample, DiopterField } from './diopter_support'

export type { GridSpec, DiopterSample, DiopterField } from './diopter_support'


const central = (
  fn: (x: number, y: number) => { u: number; v: number } | null,
  x: number,
  y: number,
  h: number
) => {
  const xp = fn(x + h, y)
  const xm = fn(x - h, y)
  const yp = fn(x, y + h)
  const ym = fn(x, y - h)
  if (!xp || !xm || !yp || !ym) return null
  return {
    dux: (xp.u - xm.u) / (2 * h),
    dvx: (xp.v - xm.v) / (2 * h),
    duy: (yp.u - ym.u) / (2 * h),
    dvy: (yp.v - ym.v) / (2 * h)
  }
}

// 斑马板标准口径：D = (1/L) * 雅可比主导项，L 为板距
// 板上位置 u ≈ L·θ_u，故 ∂θ/∂x = (1/L)·∂u/∂x
export const computeDiopterField = (
  field: HeightField,
  layer: LayerSpec,
  station: StationSpec,
  grid: GridSpec
): DiopterField => {
  const dx = (grid.xMax - grid.xMin) / (grid.nx - 1)
  const dy = (grid.yMax - grid.yMin) / (grid.ny - 1)
  const h = Math.min(dx, dy) * 0.25
  const L = station.boardDistance

  const probe = (x: number, y: number) => {
    const r = traceToBoard(field, layer, station, x, y)
    if (!r) return null
    return { u: r.boardU, v: r.boardV }
  }

  const matrix: (DiopterSample | null)[][] = []
  const samples: DiopterSample[] = []
  let maxAbs = 0

  for (let iy = 0; iy < grid.ny; iy++) {
    const row: (DiopterSample | null)[] = []
    const y = grid.yMin + iy * dy
    for (let ix = 0; ix < grid.nx; ix++) {
      const x = grid.xMin + ix * dx
      const center = probe(x, y)
      const jac = central(probe, x, y, h)
      if (!center || !jac || ix === 0 || ix === grid.nx - 1 || iy === 0 || iy === grid.ny - 1) {
        row.push(null)
        continue
      }
      // 板坐标雅可比经透视基线折算为净畸变屈光度（D）
      const lEye = eyeDistance(station, x, y, field.eval(x, y))
      const [jxx, jyx, jxy, jyy] = jacobianToDiopter(
        [jac.dux, jac.dvx, jac.duy, jac.dvy],
        lEye,
        L
      )
      const [s1] = singularValues2x2([jxx, jxy, jyx, jyy])
      const dMax = s1
      maxAbs = Math.max(maxAbs, Math.abs(dMax))
      const s: DiopterSample = {
        x,
        y,
        dxx: jxx,
        dyy: jyy,
        dxy: (jxy + jyx) / 2,
        dMax,
        boardU: center.u,
        boardV: center.v,
        valid: true
      }
      samples.push(s)
      row.push(s)
    }
    matrix.push(row)
  }
  return { grid, samples, matrix, maxAbs }
}

// 光学功率口径：出射角对玻璃处光线高度的梯度（D = 1/m）
// 这是屈光度的通用定义，对任意共轭距离成立，与斑马板偏角梯度口径同源
// 近轴下 θ≈tanθ=方向分量之比，h 即玻璃平面坐标 (x,y)
export const computeOpticalPowerAt = (
  field: HeightField,
  layer: LayerSpec,
  station: StationSpec,
  x: number,
  y: number,
  h = 1e-4,
  planoBack = false
): { dMax: number; dxx: number; dyy: number } | null => {
  const probe = (px: number, py: number) => {
    const r = traceToBoard(field, layer, station, px, py, planoBack)
    if (!r) return null
    const o = r.outgoing
    // 出射光线对 z 轴的倾角斜率 tanθ（近轴即角度，弧度）
    return { ax: o.x / o.z, ay: o.y / o.z }
  }
  const cp = probe(x + h, y)
  const cm = probe(x - h, y)
  const dp = probe(x, y + h)
  const dm = probe(x, y - h)
  if (!cp || !cm || !dp || !dm) return null
  // 出射角对光线高度（玻璃平面坐标）的雅可比
  const pxx = (cp.ax - cm.ax) / (2 * h)
  const pxy = (cp.ay - cm.ay) / (2 * h)
  const pyx = (dp.ax - dm.ax) / (2 * h)
  const pyy = (dp.ay - dm.ay) / (2 * h)
  const [dMax] = singularValues2x2([pxx, pxy, pyx, pyy])
  return { dMax, dxx: pxx, dyy: pyy }
}

// 平行光校验口径：固定入射为平行束（dir 沿 +z），在不同玻璃高度追迹
// 出射角对高度的梯度即透镜固有功率，与眼点距离/共轭无关
// 这是对照 lensmaker 公式的权威校验路径
export const computeCollimatedPower = (
  field: HeightField,
  layer: LayerSpec,
  x: number,
  y: number,
  h = 1e-4,
  planoBack = false
): { dMax: number; dxx: number; dyy: number } | null => {
  const probe = (px: number, py: number) => {
    const z0 = field.eval(px, py)
    // 起点放在内表面（-z 侧）之前，平行光沿 +z 反向穿过玻璃
    const start = { x: px, y: py, z: z0 - 0.02 }
    const tr = traceLaminate(field, layer, start, normalize({ x: 0, y: 0, z: 1 }), planoBack)
    if (!tr) return null
    const o = tr.exitDir
    return { ax: o.x / o.z, ay: o.y / o.z }
  }
  const cp = probe(x + h, y)
  const cm = probe(x - h, y)
  const dp = probe(x, y + h)
  const dm = probe(x, y - h)
  if (!cp || !cm || !dp || !dm) return null
  const pxx = (cp.ax - cm.ax) / (2 * h)
  const pxy = (cp.ay - cm.ay) / (2 * h)
  const pyx = (dp.ax - dm.ax) / (2 * h)
  const pyy = (dp.ay - dm.ay) / (2 * h)
  const [dMax] = singularValues2x2([pxx, pxy, pyx, pyy])
  return { dMax, dxx: pxx, dyy: pyy }
}

// 厚透镜 lensmaker 公式（空气中，单一曲率面 R1、平面 R2），单位 D
export const lensmakerPower = (R1: number, thickness: number, n: number): number => {
  const phi1 = (n - 1) / R1
  const phi2 = (1 - n) / Infinity
  // 双面对折：P = P1 + P2 - (t/n) P1 P2，平面侧 P2=0 时退化为单面
  return phi1 + phi2 - (thickness / n) * phi1 * phi2
}
