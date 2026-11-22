// 斑马条纹反推屈光度（反算）
// 合成图存板上命中坐标 u（米）；真实相机图经相位解包裹后同样还原为 u
// 反推屈光度 D = (1/L)·∂u/∂h，与正算 computeDiopterField 完全同一公式，保证对得上
import { HeightField } from './surface'
import { LayerSpec } from './laminate'
import { StationSpec, traceToBoard, buildBoard, eyeDistance, jacobianToDiopter } from './station'
import { GridSpec, DiopterSample, singularValues2x2 } from './diopter_support'

export interface StripeImage {
  grid: GridSpec
  // 板上 u 坐标（米），无法追迹处为 null
  u: (number | null)[][]
  v: (number | null)[][]
  period: number
}

// 正算合成「相机条纹图」：每个玻璃采样点看到的板上 u/v 坐标
export const synthesizeStripeImage = (
  field: HeightField,
  layer: LayerSpec,
  station: StationSpec,
  grid: GridSpec
): StripeImage => {
  const dx = (grid.xMax - grid.xMin) / (grid.nx - 1)
  const dy = (grid.yMax - grid.yMin) / (grid.ny - 1)
  const u: (number | null)[][] = []
  const v: (number | null)[][] = []
  for (let iy = 0; iy < grid.ny; iy++) {
    const rowU: (number | null)[] = []
    const rowV: (number | null)[] = []
    const y = grid.yMin + iy * dy
    for (let ix = 0; ix < grid.nx; ix++) {
      const x = grid.xMin + ix * dx
      const r = traceToBoard(field, layer, station, x, y)
      rowU.push(r ? r.boardU : null)
      rowV.push(r ? r.boardV : null)
    }
    u.push(rowU)
    v.push(rowV)
  }
  return { grid, u, v, period: station.stripePeriod }
}

// 由包裹相位（0~2π）还原连续板坐标：先相位解包裹再乘 period/2π
// 用于对接真实相机图；合成图已是连续坐标，无需调用
export const phaseToCoordinate = (wrapped: (number | null)[][], period: number): (number | null)[][] => {
  const ny = wrapped.length
  const nx = wrapped[0]?.length ?? 0
  const out: (number | null)[][] = Array.from({ length: ny }, () => Array(nx).fill(null))
  const scale = period / (2 * Math.PI)
  // 逐行解包裹
  for (let iy = 0; iy < ny; iy++) {
    let acc = 0
    let prev: number | null = null
    for (let ix = 0; ix < nx; ix++) {
      const p = wrapped[iy][ix]
      if (p === null) {
        prev = null
        continue
      }
      if (prev !== null) {
        let d = p - prev
        while (d > Math.PI) d -= 2 * Math.PI
        while (d < -Math.PI) d += 2 * Math.PI
        acc += d
      } else {
        acc = p
      }
      out[iy][ix] = acc * scale
      prev = p
    }
  }
  return out
}

export interface InversionResult {
  grid: GridSpec
  samples: DiopterSample[]
  matrix: (DiopterSample | null)[][]
  maxAbs: number
}

// 从板坐标图反推屈光度场，公式与正算一致：D = (1/L)·∂(u,v)/∂(x,y)
export const invertDiopterFromImage = (
  image: StripeImage,
  station: StationSpec
): InversionResult => {
  const { grid, u, v } = image
  const dx = (grid.xMax - grid.xMin) / (grid.nx - 1)
  const dy = (grid.yMax - grid.yMin) / (grid.ny - 1)
  const L = station.boardDistance
  const matrix: (DiopterSample | null)[][] = []
  const samples: DiopterSample[] = []
  let maxAbs = 0

  for (let iy = 0; iy < grid.ny; iy++) {
    const row: (DiopterSample | null)[] = []
    const y = grid.yMin + iy * dy
    for (let ix = 0; ix < grid.nx; ix++) {
      const x = grid.xMin + ix * dx
      if (ix === 0 || ix === grid.nx - 1 || iy === 0 || iy === grid.ny - 1) {
        row.push(null)
        continue
      }
      const uxp = u[iy][ix + 1], uxm = u[iy][ix - 1]
      const uyp = u[iy + 1][ix], uym = u[iy - 1][ix]
      const vxp = v[iy][ix + 1], vxm = v[iy][ix - 1]
      const vyp = v[iy + 1][ix], vym = v[iy - 1][ix]
      if ([uxp, uxm, uyp, uym, vxp, vxm, vyp, vym].some((q) => q === null)) {
        row.push(null)
        continue
      }
      // 板坐标对玻璃采样坐标的雅可比
      const dux = (uxp! - uxm!) / (2 * dx)
      const dvx = (vxp! - vxm!) / (2 * dx)
      const duy = (uyp! - uym!) / (2 * dy)
      const dvy = (vyp! - vym!) / (2 * dy)
      // 与正算同一透视基线折算，得净畸变屈光度（D）
      const lEye = eyeDistance(station, x, y, 0)
      const [jxx, jyx, jxy, jyy] = jacobianToDiopter([dux, dvx, duy, dvy], lEye, L)
      const [dMax] = singularValues2x2([jxx, jxy, jyx, jyy])
      maxAbs = Math.max(maxAbs, Math.abs(dMax))
      const s: DiopterSample = {
        x,
        y,
        dxx: jxx,
        dyy: jyy,
        dxy: (jxy + jyx) / 2,
        dMax,
        boardU: u[iy][ix] ?? 0,
        boardV: v[iy][ix] ?? 0,
        valid: true
      }
      samples.push(s)
      row.push(s)
    }
    matrix.push(row)
  }
  return { grid, samples, matrix, maxAbs }
}

export const boardAxes = (station: StationSpec) => buildBoard(station)
