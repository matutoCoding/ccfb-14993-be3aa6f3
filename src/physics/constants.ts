// 物理常量与默认工程参数
export const MM_PER_M = 1000

// 钠黄光附近常用折射率
export const N_GLASS_DEFAULT = 1.52
export const N_PVB_DEFAULT = 1.49
export const N_AIR = 1

// 光学畸变限值（GB 9656 / ISO 3539 常用量级，D）
export const LIMIT_A_DEFAULT = 0.12
export const LIMIT_B_DEFAULT = 0.23

// 典型几何默认值，单位 mm
export const DEFAULT_BOARD_DISTANCE = 4000
export const DEFAULT_STRIPE_PERIOD = 32
export const DEFAULT_EYE_DISTANCE = 500

export const DEFAULT_GRID_NX = 221
export const DEFAULT_GRID_NY = 221

export const DEFAULT_INVERSE_NX = 101
export const DEFAULT_INVERSE_NY = 101
export const DEFAULT_DERIVATIVE_STEP = 0.5

// 五个折射界面顺序：空气→外玻璃→PVB→内玻璃→空气
export const INTERFACE_COUNT = 5

export const DEFECT_LABEL: Record<string, string> = {
  thickness: '局部厚度不均',
  ripple: '成型波纹',
  edge_bulge: '边部应力凸起',
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
