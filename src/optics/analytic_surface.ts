// 解析曲面：球面、柱面、抛物面等，导数全部解析式给出
// 用于「已知曲率玻璃」精度校验，也作为车型风挡的基础形状
import { HeightField } from './surface'

export interface AnalyticSpec {
  type: 'sphere' | 'cylinder_x' | 'cylinder_y' | 'paraboloid' | 'plane'
  // 曲率半径（米），正值表示曲面凸向 +z；球/柱面在顶点附近展开
  radius: number
  // 抛物面 z=(x²/rx + y²/ry)/2 时使用
  rx?: number
  ry?: number
}

// 严格平面 z=0：曲率恒为零，用于零畸变基准
const plane = (): HeightField => ({
  eval: () => 0,
  dx: () => 0,
  dy: () => 0,
  dxx: () => 0,
  dyy: () => 0,
  dxy: () => 0
})

// 球冠高度场（顶点在原点，凸向 +z）：z = R - sqrt(R² - r²)
// 一阶导 fx = x/sqrt(R²-r²)，二阶导 fxx = R²/(R²-r²)^(3/2)
const sphere = (radius: number): HeightField => {
  const R = radius
  const q = (x: number, y: number) => {
    const v = R * R - x * x - y * y
    if (v <= 0) throw new Error('采样点超出球面定义域')
    return v
  }
  return {
    eval: (x, y) => R - Math.sqrt(q(x, y)),
    dx: (x, y) => x / Math.sqrt(q(x, y)),
    dy: (x, y) => y / Math.sqrt(q(x, y)),
    dxx: (x, y) => (R * R) / Math.pow(q(x, y), 1.5),
    dyy: (x, y) => (R * R) / Math.pow(q(x, y), 1.5),
    dxy: (x, y) => (x * y) / Math.pow(q(x, y), 1.5)
  }
}

// 柱面（母线沿 x 方向，曲率只在 y 方向）
const cylinderX = (radius: number): HeightField => {
  const R = radius
  const q = (y: number) => {
    const v = R * R - y * y
    if (v <= 0) throw new Error('采样点超出柱面定义域')
    return v
  }
  return {
    eval: (_x, y) => R - Math.sqrt(q(y)),
    dx: () => 0,
    dy: (_x, y) => y / Math.sqrt(q(y)),
    dxx: () => 0,
    dyy: (_x, y) => (R * R) / Math.pow(q(y), 1.5),
    dxy: () => 0
  }
}

// 柱面（母线沿 y 方向，曲率只在 x 方向）
const cylinderY = (radius: number): HeightField => {
  const R = radius
  const q = (x: number) => {
    const v = R * R - x * x
    if (v <= 0) throw new Error('采样点超出柱面定义域')
    return v
  }
  return {
    eval: (x, _y) => R - Math.sqrt(q(x)),
    dx: (x, _y) => x / Math.sqrt(q(x)),
    dy: () => 0,
    dxx: (x, _y) => (R * R) / Math.pow(q(x), 1.5),
    dyy: () => 0,
    dxy: () => 0
  }
}

// 抛物面 z = (x²/rx + y²/ry)/2，顶点曲率半径恰为 rx、ry
const paraboloid = (rx: number, ry: number): HeightField => ({
  eval: (x, y) => (x * x / rx + y * y / ry) / 2,
  dx: (x, _y) => x / rx,
  dy: (_x, y) => y / ry,
  dxx: () => 1 / rx,
  dyy: () => 1 / ry,
  dxy: () => 0
})

export const createAnalyticSurface = (spec: AnalyticSpec): HeightField => {
  switch (spec.type) {
    case 'plane':
      return plane()
    case 'sphere':
      return sphere(spec.radius)
    case 'cylinder_x':
      return cylinderX(spec.radius)
    case 'cylinder_y':
      return cylinderY(spec.radius)
    case 'paraboloid':
      return paraboloid(spec.rx ?? spec.radius, spec.ry ?? spec.radius)
  }
}
