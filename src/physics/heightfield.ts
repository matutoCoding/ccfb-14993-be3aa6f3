import { bilerp, catmull, clamp } from './vector.ts'

// 规则网格高度场 z = f(x, y)，x∈[-w/2,w/2]，y∈[-h/2,h/2]
export type HeightField = {
  nx: number
  ny: number
  width: number
  height: number
  // 行优先 z[iy*nx+ix]
  z: Float64Array
}

export const fieldValueAt = (f: HeightField, ix: number, iy: number): number =>
  f.z[clamp(iy, 0, f.ny - 1) * f.nx + clamp(ix, 0, f.nx - 1)]

// 双三次（Catmull-Rom）采样高度
export function sampleField(f: HeightField, x: number, y: number): number {
  const gx = ((x + f.width / 2) / f.width) * (f.nx - 1)
  const gy = ((y + f.height / 2) / f.height) * (f.ny - 1)
  const ix = Math.floor(gx)
  const iy = Math.floor(gy)
  const tx = gx - ix
  const ty = gy - iy
  const rows = [0, 1, 2, 3].map((k) => {
    const j = iy - 1 + k
    return catmull(
      fieldValueAt(f, ix - 1, j), fieldValueAt(f, ix, j),
      fieldValueAt(f, ix + 1, j), fieldValueAt(f, ix + 2, j), tx,
    )
  })
  return catmull(rows[0], rows[1], rows[2], rows[3], ty)
}

// 解析偏导（有限差分，步长网格间距 1/4）
export function sampleGradient(f: HeightField, x: number, y: number) {
  const dx = f.width / (f.nx - 1) / 4
  const dy = f.height / (f.ny - 1) / 4
  return {
    dzdx: (sampleField(f, x + dx, y) - sampleField(f, x - dx, y)) / (2 * dx),
    dzdy: (sampleField(f, x, y + dy) - sampleField(f, x, y - dy)) / (2 * dy),
  }
}

export function makeField(nx: number, ny: number, width: number, height: number): HeightField {
  return { nx, ny, width, height, z: new Float64Array(nx * ny) }
}

export function fillField(f: HeightField, fn: (x: number, y: number) => number): HeightField {
  for (let iy = 0; iy < f.ny; iy++) {
    for (let ix = 0; ix < f.nx; ix++) {
      const x = -f.width / 2 + (f.width * ix) / (f.nx - 1)
      const y = -f.height / 2 + (f.height * iy) / (f.ny - 1)
      f.z[iy * f.nx + ix] = fn(x, y)
    }
  }
  return f
}

// 由 loft 控制曲线生成基准高度场：每条曲线给 z(x)，曲线间沿 y 做三次插值
export function buildLoftField(
  nx: number, ny: number, width: number, height: number,
  curves: { y: number; points: { x: number; z: number }[] }[],
): HeightField {
  const sorted = [...curves].sort((a, b) => a.y - b.y)
  if (sorted.length === 0) return makeField(nx, ny, width, height)
  const evalCurve = (c: { points: { x: number; z: number }[] }, x: number): number => {
    const p = c.points
    if (x <= p[0].x) return p[0].z
    if (x >= p[p.length - 1].x) return p[p.length - 1].z
    let i = 0
    while (i < p.length - 2 && p[i + 1].x < x) i++
    const t = (x - p[i].x) / (p[i + 1].x - p[i].x)
    return p[i].z + (p[i + 1].z - p[i].z) * clamp(t, 0, 1)
  }
  return fillField(makeField(nx, ny, width, height), (x, y) => {
    if (sorted.length === 1) return evalCurve(sorted[0], x)
    if (y <= sorted[0].y) return evalCurve(sorted[0], x)
    if (y >= sorted[sorted.length - 1].y) return evalCurve(sorted[sorted.length - 1], x)
    let k = 0
    while (k < sorted.length - 2 && sorted[k + 1].y < y) k++
    const span = sorted[k + 1].y - sorted[k].y
    const t = span > 0 ? clamp((y - sorted[k].y) / span, 0, 1) : 0
    const i0 = clamp(k - 1, 0, sorted.length - 1)
    const i3 = clamp(k + 2, 0, sorted.length - 1)
    return catmull(
      evalCurve(sorted[i0], x), evalCurve(sorted[k], x),
      evalCurve(sorted[k + 1], x), evalCurve(sorted[i3], x), t,
    )
  })
}

// 点云 MLS 局部二次加权最小二乘拟合到规则网格
export function buildPointCloudField(
  nx: number, ny: number, width: number, height: number,
  cloud: { x: number; y: number; z: number }[],
  searchRadius: number,
): HeightField {
  const field = makeField(nx, ny, width, height)
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = -width / 2 + (width * ix) / (nx - 1)
      const y = -height / 2 + (height * iy) / (ny - 1)
      field.z[iy * nx + ix] = mlsQuadratic(cloud, x, y, searchRadius)
    }
  }
  return field
}

// 局部加权二次曲面 z = a0+a1x+a2y+a3x²+a4xy+a5y²，6 参数正规方程
function mlsQuadratic(
  cloud: { x: number; y: number; z: number }[],
  x0: number, y0: number, radius: number,
): number {
  const n = 6
  const ata = Array.from({ length: n }, () => new Float64Array(n))
  const atb = new Float64Array(n)
  let used = 0
  for (const p of cloud) {
    const dx = p.x - x0
    const dy = p.y - y0
    const r2 = dx * dx + dy * dy
    if (r2 > radius * radius) continue
    const w = Math.exp(-r2 / (radius * radius * 0.25))
    const basis = [1, dx, dy, dx * dx, dx * dy, dy * dy]
    for (let i = 0; i < n; i++) {
      atb[i] += w * basis[i] * p.z
      for (let j = 0; j < n; j++) ata[i][j] += w * basis[i] * basis[j]
    }
    used++
  }
  if (used < 9) return nearestCloudZ(cloud, x0, y0)
  const coef = solve6(ata, atb)
  return coef ? coef[0] : nearestCloudZ(cloud, x0, y0)
}

function nearestCloudZ(cloud: { x: number; y: number; z: number }[], x: number, y: number): number {
  let best = cloud[0]
  let bd = Infinity
  for (const p of cloud) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2
    if (d < bd) { bd = d; best = p }
  }
  return best.z
}

// 6 阶高斯消元（带主元）
function solve6(a: Float64Array[], b: Float64Array): Float64Array | null {
  const n = 6
  const m = a.map((row, i) => Float64Array.from([...row, b[i]]))
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[piv][col])) piv = r
    if (Math.abs(m[piv][col]) < 1e-12) return null
    ;[m[col], m[piv]] = [m[piv], m[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = m[r][col] / m[col][col]
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c]
    }
  }
  return Float64Array.from(m.map((row, i) => row[n] / row[i]))
}

export function sampleBilinearField(f: HeightField, x: number, y: number): number {
  const gx = ((x + f.width / 2) / f.width) * (f.nx - 1)
  const gy = ((y + f.height / 2) / f.height) * (f.ny - 1)
  const ix = clamp(Math.floor(gx), 0, f.nx - 2)
  const iy = clamp(Math.floor(gy), 0, f.ny - 2)
  return bilerp(
    f.z[iy * f.nx + ix], f.z[iy * f.nx + ix + 1],
    f.z[(iy + 1) * f.nx + ix], f.z[(iy + 1) * f.nx + ix + 1],
    gx - ix, gy - iy,
  )
}
