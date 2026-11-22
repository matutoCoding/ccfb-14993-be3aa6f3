// 屈光度模块共享类型与工具，独立成文件避免循环依赖
import { singularValues2x2 } from './vector'

export { singularValues2x2 }

export interface GridSpec {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  nx: number
  ny: number
}

export interface DiopterSample {
  x: number
  y: number
  // x/y 方向偏角梯度（D）
  dxx: number
  dyy: number
  dxy: number
  // 最大主屈光度（雅可比最大奇异值折算）
  dMax: number
  // 斑马板命中 u/v
  boardU: number
  boardV: number
  valid: boolean
}

export interface DiopterField {
  grid: GridSpec
  samples: DiopterSample[]
  // 二维索引 [iy][ix]
  matrix: (DiopterSample | null)[][]
  maxAbs: number
}
