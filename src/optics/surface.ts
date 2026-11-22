// 玻璃曲面统一表示：高度场 z = f(x, y)
// 风挡玻璃在自身坐标系内是浅曲面，高度场表示足以覆盖装车工况
// 提供值、一阶梯度、二阶导（曲率），全部解析/差分两种来源可混用
export interface HeightField {
  eval(x: number, y: number): number
  dx(x: number, y: number): number
  dy(x: number, y: number): number
  dxx(x: number, y: number): number
  dyy(x: number, y: number): number
  dxy(x: number, y: number): number
}

// 由纯函数构建高度场，缺省导数用中心差分补齐
export const fieldFromFn = (
  fn: (x: number, y: number) => number,
  step = 1e-5,
  deriv?: Partial<Pick<HeightField, 'dx' | 'dy' | 'dxx' | 'dyy' | 'dxy'>>
): HeightField => {
  const dx =
    deriv?.dx ?? ((x, y) => (fn(x + step, y) - fn(x - step, y)) / (2 * step))
  const dy =
    deriv?.dy ?? ((x, y) => (fn(x, y + step) - fn(x, y - step)) / (2 * step))
  const dxx =
    deriv?.dxx ??
    ((x, y) => (fn(x + step, y) - 2 * fn(x, y) + fn(x - step, y)) / (step * step))
  const dyy =
    deriv?.dyy ??
    ((x, y) => (fn(x, y + step) - 2 * fn(x, y) + fn(x, y - step)) / (step * step))
  const dxy =
    deriv?.dxy ??
    ((x, y) =>
      (fn(x + step, y + step) -
        fn(x + step, y - step) -
        fn(x - step, y + step) +
        fn(x - step, y - step)) /
      (4 * step * step))
  return { eval: fn, dx, dy, dxx, dyy, dxy }
}

// 解析单位换算后的法向量（指向 +z 一侧）
export const fieldNormal = (s: HeightField, x: number, y: number) => {
  const fx = s.dx(x, y)
  const fy = s.dy(x, y)
  const len = Math.hypot(fx, fy, 1)
  return { x: -fx / len, y: -fy / len, z: 1 / len }
}

// 光线与高度场求交：光线 P(t)=origin+t*dir，求 t 使 Pz = f(Px,Py)
// 牛顿迭代为主（浅曲面二次收敛），离开正区间或发散时用对分法兜底
export const intersectHeightField = (
  s: HeightField,
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  tHint: number,
  maxIter = 40,
  tol = 1e-12
): { t: number; x: number; y: number; z: number } | null => {
  const gap = (t: number) => {
    const x = origin.x + dir.x * t
    const y = origin.y + dir.y * t
    const z = origin.z + dir.z * t
    return { g: z - s.eval(x, y), x, y, z }
  }
  const slopeAt = (x: number, y: number) =>
    dir.z - s.dx(x, y) * dir.x - s.dy(x, y) * dir.y

  // 牛顿迭代
  let t = tHint
  for (let i = 0; i < maxIter; i++) {
    const { g, x, y, z } = gap(t)
    if (Math.abs(g) < tol) return { t, x, y, z }
    const gp = slopeAt(x, y)
    if (Math.abs(gp) < 1e-14) break
    const tNext = t - g / gp
    if (Number.isFinite(tNext) && tNext > 0 && Math.abs(tNext - t) > tol * 0.1) {
      t = tNext
      continue
    }
    if (Number.isFinite(tNext) && tNext > 0) t = tNext
    break
  }
  if (Number.isFinite(t) && t > 0 && Math.abs(gap(t).g) < tol * 1e3) {
    const { x, y } = gap(t)
    return { t, x, y, z: s.eval(x, y) }
  }

  // 对分兜底：起点必须在曲面来光侧（g>0），倍增找上界后对分
  const g0 = gap(1e-9)
  if (!(g0.g > 0)) return null
  let lo = 1e-9
  let hi = Math.max(tHint, 1e-4)
  let guard = 0
  while (gap(hi).g >= 0 && guard < 60) {
    hi *= 2
    guard++
  }
  if (gap(hi).g >= 0) return null
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    const { g, x, y } = gap(mid)
    if (Math.abs(g) < tol) return { t: mid, x, y, z: s.eval(x, y) }
    if (g > 0) lo = mid
    else hi = mid
  }
  const mid = (lo + hi) / 2
  const { x, y } = gap(mid)
  return { t: mid, x, y, z: s.eval(x, y) }
}
