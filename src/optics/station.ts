// 检测工位几何：玻璃按装车倾角斜置，眼点在驾驶舱侧，斑马板在来光侧
// 统一坐标约定（世界系，米）：
//   玻璃基准面顶点位于原点，玻璃自身坐标 x 横向、y 竖向、z 凸向车头
//   倾角安装后绕 x 轴旋转，眼点在 -z 侧（车内），斑马板在 +z 侧
import { HeightField } from './surface'
import { LayerSpec, traceLaminate } from './laminate'
import { Vec3, add, cross, deg2rad, normalize, scale, sub } from './vector'

export interface StationSpec {
  // 装车倾角：玻璃与铅垂面的夹角（度），轿车约 28~32，SUV 约 22~25
  installTiltDeg: number
  // 眼点相对玻璃顶点的位置（玻璃系，米）
  eye: Vec3
  // 斑马板沿玻璃法线方向到玻璃基准面的距离（米）
  boardDistance: number
  // 斑马条纹：角度（度，相对水平 x 轴）、亮暗周期宽度（米）
  stripeAngleDeg: number
  stripePeriod: number
}

export const DEFAULT_STATION: StationSpec = {
  installTiltDeg: 30,
  eye: { x: 0, y: 0, z: -0.8 },
  boardDistance: 4,
  stripeAngleDeg: 90,
  stripePeriod: 0.024
}

// 玻璃系 -> 世界系：绕 x 轴旋转（倾角把玻璃顶部压向车头）
export const glassToWorld = (p: Vec3, tiltDeg: number): Vec3 => {
  const a = deg2rad(tiltDeg)
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c }
}

// 世界系 -> 玻璃系
export const worldToGlass = (p: Vec3, tiltDeg: number): Vec3 => {
  const a = deg2rad(tiltDeg)
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: p.x, y: p.y * c + p.z * s, z: -p.y * s + p.z * c }
}

// 斑马板平面（世界系）：过板参考点、法线沿玻璃顶点世界法线
export interface BoardPlane {
  point: Vec3
  normal: Vec3
  u: Vec3 // 条纹周期方向（板平面内）
  v: Vec3 // 条纹走向（板平面内）
}

export const buildBoard = (station: StationSpec): BoardPlane => {
  // 玻璃顶点法线在玻璃系为 +z，旋转后即板法线
  const normal = normalize(glassToWorld({ x: 0, y: 0, z: 1 }, station.installTiltDeg))
  const point = scale(normal, station.boardDistance)
  const a = deg2rad(station.stripeAngleDeg)
  // 板平面正交基：right 由法线与世界 y 叉积保证落在板内且沿水平，up 再正交补齐
  const worldY = { x: 0, y: 1, z: 0 }
  const right = normalize(cross(worldY, normal))
  const up = normalize(cross(normal, right))
  // stripeAngle 为条纹走向；周期方向 u 相对水平 right 旋转 (90°-走向角)
  // 90° 竖条纹 → u=right；0° 横条纹 → u=up
  const ua = Math.PI / 2 - a
  const u = normalize(add(scale(right, Math.cos(ua)), scale(up, Math.sin(ua))))
  // v 为板内与 u 正交的条纹走向
  const v = normalize(cross(normal, u))
  return { point, normal, u, v }
}

// 射线与平面求交
export const rayPlane = (origin: Vec3, dir: Vec3, board: BoardPlane): Vec3 | null => {
  const denom = dir.x * board.normal.x + dir.y * board.normal.y + dir.z * board.normal.z
  if (Math.abs(denom) < 1e-12) return null
  const t =
    (board.normal.x * (board.point.x - origin.x) +
      board.normal.y * (board.point.y - origin.y) +
      board.normal.z * (board.point.z - origin.z)) /
    denom
  if (t <= 0) return null
  return add(origin, scale(dir, t))
}

export interface RayResult {
  // 玻璃上的采样点（玻璃系）
  sample: Vec3
  // 眼点发出的入射方向（玻璃系）
  incoming: Vec3
  // 穿出玻璃后的方向（玻璃系）
  outgoing: Vec3
  // 斑马板命中点（世界系）
  boardPoint: Vec3
  // 命中点在板平面内的 u/v 坐标（米）
  boardU: number
  boardV: number
  tir: boolean
}

// 从眼点穿过玻璃采样点 (x,y) 追光到斑马板
// 反向追迹：从眼点（-z 侧）向斑马板（+z 侧）发射，物理等价于来光正向传播
export const traceToBoard = (
  field: HeightField,
  layer: LayerSpec,
  station: StationSpec,
  x: number,
  y: number,
  planoBack = false
): RayResult | null => {
  const sample: Vec3 = { x, y, z: field.eval(x, y) }
  const eyeWorld = glassToWorld(station.eye, station.installTiltDeg)
  const sampleWorld = glassToWorld(sample, station.installTiltDeg)
  // 眼点 -> 采样点：指向 +z 来光侧
  const incomingWorld = normalize(sub(sampleWorld, eyeWorld))
  const incoming = worldToGlass(incomingWorld, station.installTiltDeg)
  // 起点放在眼点与采样点之间、玻璃内表面（-z 侧）之前
  const start = sub(sample, scale(incoming, 0.02))
  const tr = traceLaminate(field, layer, start, incoming, planoBack)
  if (!tr) return null
  const exitWorld = glassToWorld(add(tr.hits[3].point, scale(tr.exitDir, 1e-6)), station.installTiltDeg)
  const outWorld = glassToWorld(tr.exitDir, station.installTiltDeg)
  const board = buildBoard(station)
  const hit = rayPlane(exitWorld, outWorld, board)
  if (!hit) return null
  const rel = sub(hit, board.point)
  return {
    sample,
    incoming,
    outgoing: tr.exitDir,
    boardPoint: hit,
    boardU: rel.x * board.u.x + rel.y * board.u.y + rel.z * board.u.z,
    boardV: rel.x * board.v.x + rel.y * board.v.y + rel.z * board.v.z,
    tir: tr.tir
  }
}

// 眼点到玻璃采样点的距离（玻璃系，米）
export const eyeDistance = (station: StationSpec, x: number, y: number, surfaceZ: number): number => {
  const e = station.eye
  return Math.hypot(x - e.x, y - e.y, surfaceZ - e.z)
}

// 板坐标雅可比 -> 屈光度矩阵（D）
// 总偏角梯度 = (1/L)·雅可比；无玻璃时板上位移含完整透视，基线为
// (L+L_eye)/(L·L_eye) = 1/L + 1/L_eye，对角元扣除后平板净畸变严格归零
// 交叉项无透视基线，不扣；正算与反推共用此换算保证数值一致
// 输入/输出均为行主序 2x2：[xx, yx, xy, yy]（行=板分量，列=玻璃坐标）
export const jacobianToDiopter = (
  boardJac: [number, number, number, number],
  lEye: number,
  boardDistance: number
): [number, number, number, number] => {
  const baseline = 1 / boardDistance + 1 / lEye
  const [xx, yx, xy, yy] = boardJac
  return [
    xx / boardDistance - baseline,
    yx / boardDistance,
    xy / boardDistance,
    yy / boardDistance - baseline
  ]
}
