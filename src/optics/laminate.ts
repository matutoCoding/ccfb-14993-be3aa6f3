// 夹层风挡层合结构：外片玻璃 / PVB / 内片玻璃
// 几何上四个界面由基准高度场沿法线偏移生成；厚度为法线方向弧长
import { HeightField, fieldNormal, intersectHeightField } from './surface'
import { refract } from './refraction'
import { Vec3, add, normalize, scale, sub } from './vector'

export interface LayerSpec {
  // 各层厚度（米），顺序：外片玻璃、PVB、内片玻璃
  outerGlass: number
  pvb: number
  innerGlass: number
  // 各介质折射率（对 e 光取代表波长 589nm 的 nd）
  nGlass: number
  nPvb: number
}

export const DEFAULT_LAYER: LayerSpec = {
  outerGlass: 0.0021,
  pvb: 0.00076,
  innerGlass: 0.0021,
  nGlass: 1.52,
  nPvb: 1.48
}

export interface TraceHit {
  point: Vec3
  normal: Vec3
}

export interface TraceResult {
  hits: TraceHit[]
  // 穿出内片后的方向（在玻璃坐标系内）
  exitDir: Vec3
  tir: boolean
}

// 沿法线偏移的等距曲面（隐式定义，求值时做一次法线步长推进）
// offset 为沿 +z 侧法线方向的距离
const offsetField = (base: HeightField, offset: number): HeightField => {
  const pt = (x: number, y: number) => {
    const n = fieldNormal(base, x, y)
    return add({ x, y, z: base.eval(x, y) }, scale(n, offset))
  }
  return {
    eval: (x, y) => pt(x, y).z,
    dx: (x, y) => {
      const p = pt(x + 1e-5, y)
      const m = pt(x - 1e-5, y)
      return (p.z - m.z) / 2e-5
    },
    dy: (x, y) => {
      const p = pt(x, y + 1e-5)
      const m = pt(x, y - 1e-5)
      return (p.z - m.z) / 2e-5
    },
    dxx: (x, y) => {
      const p = pt(x + 1e-5, y).z
      const m = pt(x - 1e-5, y).z
      return (p - 2 * base.eval(x, y) + m) / 1e-10
    },
    dyy: (x, y) => {
      const p = pt(x, y + 1e-5).z
      const m = pt(x, y - 1e-5).z
      return (p - 2 * base.eval(x, y) + m) / 1e-10
    },
    dxy: (x, y) => {
      const pp = pt(x + 1e-5, y + 1e-5).z
      const pm = pt(x + 1e-5, y - 1e-5).z
      const mp = pt(x - 1e-5, y + 1e-5).z
      const mm = pt(x - 1e-5, y - 1e-5).z
      return (pp - pm - mp + mm) / 4e-10
    }
  }
}

// 等 z 平面（用于平凸校验玻璃的平面背面）
const planeAtZ = (z: number): HeightField => ({
  eval: () => z,
  dx: () => 0,
  dy: () => 0,
  dxx: () => 0,
  dyy: () => 0,
  dxy: () => 0
})

// 构建四个界面：按 z 从大到小（外片外表面 -> 内片内表面）
// 基准面取外片外表面；各面两侧介质折射率随面给出
// planoBack=true 时后三个界面退化为等 z 平面，构成平凸/平凹校验玻璃
export const buildInterfaces = (
  base: HeightField,
  layer: LayerSpec,
  planoBack = false
) => {
  const t1 = layer.outerGlass
  const t2 = t1 + layer.pvb
  const t3 = t2 + layer.innerGlass
  const f1 = planoBack ? planeAtZ(-t1) : offsetField(base, -t1)
  const f2 = planoBack ? planeAtZ(-t2) : offsetField(base, -t2)
  const f3 = planoBack ? planeAtZ(-t3) : offsetField(base, -t3)
  // 每面记录 zMin 侧（内部）与 zMax 侧（外部）介质
  return [
    { field: base, nMinus: layer.nGlass, nPlus: 1, zOff: 0 },
    { field: f1, nMinus: layer.nPvb, nPlus: layer.nGlass, zOff: -t1 },
    { field: f2, nMinus: layer.nGlass, nPlus: layer.nPvb, zOff: -t2 },
    { field: f3, nMinus: 1, nPlus: layer.nGlass, zOff: -t3 }
  ]
}

// 完整追光：给定玻璃坐标系内的起点与方向，依次穿过四个界面
// 自动识别传播方向：dir.z<0 为正向（外->内），dir.z>0 为眼点反向追迹（内->外）
export const traceLaminate = (
  base: HeightField,
  layer: LayerSpec,
  origin: Vec3,
  dir: Vec3,
  planoBack = false
): TraceResult | null => {
  const all = buildInterfaces(base, layer, planoBack)
  const forward = dir.z <= 0
  const faces = forward ? all : [...all].reverse()
  let p = origin
  let d = normalize(dir)
  const hits: TraceHit[] = []
  let tir = false
  for (const face of faces) {
    const hit = intersectHeightField(face.field, p, d, 0.05)
    if (!hit) return null
    const n = fieldNormal(face.field, hit.x, hit.y)
    hits.push({ point: { x: hit.x, y: hit.y, z: hit.z }, normal: n })
    // 入射侧介质：正向时来光在 zPlus 侧，反向时来光在 zMinus 侧
    const nFrom = forward ? face.nPlus : face.nMinus
    const nTo = forward ? face.nMinus : face.nPlus
    const r = refract(d, n, nFrom / nTo)
    if (r.tir) tir = true
    d = r.dir
    // 沿新方向推进极小距离，避免重复击中同一面
    p = add({ x: hit.x, y: hit.y, z: hit.z }, scale(d, 1e-7))
  }
  return { hits, exitDir: d, tir }
}

// 反向追光（眼点 -> 斑马板）与正向共用同一物理，方向反过来即可
export const traceFromEye = traceLaminate

export const _offsetInternals = { offsetField, sub }
