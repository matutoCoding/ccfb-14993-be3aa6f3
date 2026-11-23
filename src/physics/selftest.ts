import type { GlassSurface, ZonePolygon } from '../types.ts'
import { N_GLASS_DEFAULT, N_PVB_DEFAULT, MM_PER_M } from './constants.ts'
import type { GlassStack } from './glass_stack.ts'
import { buildGlassStack } from './glass_stack.ts'
import { traceRay } from './ray_tracer.ts'
import { computeDirectDiopterMap, type DiopterInput } from './diopter.ts'
import { v3 } from './vector.ts'

export type SelfTestCase = {
  name: string
  expected: number
  measured: number
  error: number
  pass: boolean
  detail: string
}

// 独立 2D 向量追迹：二分瞄准使外球面落点为 h，返回出射光线方向 (dx,dz)
function handExitDir(
  h: number, eyeZ: number, R: number,
  tOuter: number, tPvb: number, tInner: number,
  ng: number, np: number,
): { dx: number; dz: number; slope: number } {
  const halfPvb = tPvb / 2
  const sag = (x: number) => R - Math.sqrt(Math.max(0, R * R - x * x))

  // 给定发射斜率 m（方向 (m,-1) 未归一化），牛顿法求外球面落点 x
  const landX = (m: number) => {
    let x = m * eyeZ * 0.5
    for (let k = 0; k < 30; k++) x = m * (eyeZ - sag(x) - (tOuter + halfPvb))
    return x
  }
  let lo = 0
  let hi = (2 * h) / eyeZ
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2
    if (landX(mid) < h) lo = mid
    else hi = mid
  }
  const slope = (lo + hi) / 2
  let dx = slope
  let dz = -1
  const normalize2D = () => {
    const l = Math.hypot(dx, dz)
    dx /= l
    dz /= l
  }
  normalize2D()
  let px = h
  let pz = sag(h) + tOuter + halfPvb

  const refract2D = (nx: number, nz: number, n1: number, n2: number) => {
    const cosi = -(dx * nx + dz * nz)
    const eta = n1 / n2
    const cost = Math.sqrt(1 - eta * eta * (1 - cosi * cosi))
    dx = eta * dx + (eta * cosi - cost) * nx
    dz = eta * dz + (eta * cosi - cost) * nz
    normalize2D()
  }
  const marchPlane = (zTarget: number) => {
    const t = (zTarget - pz) / dz
    px += dx * t
    pz += dz * t
  }

  // 外球面梯度法向
  const dzs = h / Math.sqrt(R * R - h * h)
  let nxl = -dzs
  let nzl = 1
  const l = Math.hypot(nxl, nzl)
  nxl /= l; nzl /= l
  refract2D(nxl, nzl, 1, ng)
  marchPlane(halfPvb)
  refract2D(0, 1, ng, np)
  marchPlane(-halfPvb)
  refract2D(0, 1, np, ng)
  marchPlane(-(tInner + halfPvb))
  refract2D(0, 1, ng, 1)
  return { dx, dz, slope }
}

// 手算平凸透镜傍轴光焦度：与引擎同口径——瞄准落点 h，出射角减入射角
export function handPlanoConvexPower(
  R: number, tOuter: number, tPvb: number, tInner: number,
  ng: number, np: number, eyeZ: number,
): number {
  const h = 0.25
  const r = handExitDir(h, eyeZ, R, tOuter, tPvb, tInner, ng, np)
  const exitAngle = Math.atan2(r.dx, -r.dz)
  const incidentAngle = Math.atan(r.slope)
  return ((exitAngle - incidentAngle) / h) * MM_PER_M
}

// 独立解析基准：平凸叠层傍轴光焦度（透镜制造者公式，D），仅适用平行入射
// 外表面单球面承担全部光焦度，平面界面零焦度；Φ = (n-1)/R
export function analyticalPlanoConvexPower(R: number, ng: number): number {
  return ((ng - 1) / R) * MM_PER_M
}

// 平凸透镜：外表面球面半径 R（凸向眼点），内侧面为平面
function planoConvexStack(R: number, width: number, n: number): GlassStack {
  const surface: GlassSurface = {
    id: 'selftest_plano', vehicleId: 'selftest', name: '平凸基准玻璃',
    width, height: width,
    outerThickness: 2.1, pvbThickness: 0.76, innerThickness: 2.1,
    nGlass: N_GLASS_DEFAULT, nPvb: N_PVB_DEFAULT,
    gridNx: n, gridNy: n, loftCurves: [], defects: [], updatedAt: 0,
  }
  const stack = buildGlassStack(surface)
  const halfPvb = surface.pvbThickness / 2
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const x = -width / 2 + (width * ix) / (n - 1)
      const y = -width / 2 + (width * iy) / (n - 1)
      const r2 = Math.max(0, R * R - x * x - y * y)
      const sag = R - Math.sqrt(r2)
      const i = iy * n + ix
      stack.interfaces[0].z[i] = sag + surface.outerThickness + halfPvb
      stack.interfaces[1].z[i] = halfPvb
      stack.interfaces[2].z[i] = -halfPvb
      stack.interfaces[3].z[i] = -surface.innerThickness - halfPvb
    }
  }
  return stack
}

// 引擎实测：远眼点平行入射光线（在玻璃平面落到 h），出射偏角 / 入射高度
// 远眼点使入射角趋近 0，与透镜制造者公式的平行入射假设严格同口径
function measuredCentralPower(stack: GlassStack, eyeZ: number): number {
  const h = 0.25
  const eye = v3(0, 0, eyeZ)
  const slope = h / eyeZ
  const r = traceRay(stack, eye, v3(slope, 0, -1), -4000)
  if (!r.boardPoint) return NaN
  const exitAng = Math.atan2(r.direction.x, -r.direction.z)
  return ((exitAng - slope) / h) * MM_PER_M
}

export function runSelfTests(): SelfTestCase[] {
  const results: SelfTestCase[] = []
  const eyeZ = 500
  const zones: ZonePolygon[] = []
  const ng = N_GLASS_DEFAULT
  const np = N_PVB_DEFAULT
  const tOuter = 2.1
  const tPvb = 0.76
  const tInner = 2.1

  // 用例 1：平板玻璃，全场屈光度应为 0
  {
    const width = 200
    const n = 251
    const surface: GlassSurface = {
      id: 'selftest_flat', vehicleId: 'selftest', name: '平板玻璃',
      width, height: width, outerThickness: tOuter, pvbThickness: tPvb, innerThickness: tInner,
      nGlass: ng, nPvb: np, gridNx: n, gridNy: n,
      loftCurves: [{ id: 'c', y: 0, points: [{ x: -width / 2, z: 0 }, { x: width / 2, z: 0 }] }],
      defects: [], updatedAt: 0,
    }
    const stack = buildGlassStack(surface)
    const input: DiopterInput = {
      stack, width, height: width, nx: 31, ny: 31,
      eye: v3(0, 0, eyeZ), boardDistance: 4000, derivativeStep: 0.5,
      zones, limitA: 0.12, limitB: 0.23,
    }
    const map = computeDirectDiopterMap(input)
    const maxD = Math.max(...map.samples.map((s) => Math.max(Math.abs(s.dx), Math.abs(s.dy))))
    results.push(makeCase('平板玻璃零屈光度', 0, maxD, '全场最大 |D|'))
  }

  // 用例 2-4：平凸透镜三种曲率，远眼平行入射下引擎追迹 vs 透镜制造者解析公式
  const farEyeZ = 50000
  for (const R of [3000, 1500, 8000]) {
    const width = 120
    const stack = planoConvexStack(R, width, R > 5000 ? 251 : 161)
    const expected = analyticalPlanoConvexPower(R, ng)
    const measured = measuredCentralPower(stack, farEyeZ)
    const hand = handPlanoConvexPower(R, tOuter, tPvb, tInner, ng, np, farEyeZ)
    results.push(makeCase(
      `平凸玻璃 R=${R}mm 中心屈光度`, expected, measured,
      `透镜制造者公式 vs 3D追迹（独立2D手算 ${hand.toFixed(5)}D）`,
    ))
  }

  // 用例 5：直接计算两种口径互验（板上映射法 vs 角偏导法），平板零场最干净
  {
    const width = 200
    const n = 251
    const surface: GlassSurface = {
      id: 'selftest_flat2', vehicleId: 'selftest', name: '平板玻璃',
      width, height: width, outerThickness: tOuter, pvbThickness: tPvb, innerThickness: tInner,
      nGlass: ng, nPvb: np, gridNx: n, gridNy: n,
      loftCurves: [{ id: 'c', y: 0, points: [{ x: -width / 2, z: 0 }, { x: width / 2, z: 0 }] }],
      defects: [], updatedAt: 0,
    }
    const stack = buildGlassStack(surface)
    const input: DiopterInput = {
      stack, width, height: width, nx: 61, ny: 61,
      eye: v3(0, 0, eyeZ), boardDistance: 4000, derivativeStep: 0.5,
      zones, limitA: 0.12, limitB: 0.23,
    }
    const map = computeDirectDiopterMap(input)
    results.push(makeCase('直接计算双口径互验（平板）', 0, map.maxAbsError, '板上映射法与角偏导法最大偏差'))
  }

  return results
}

function makeCase(name: string, expected: number, measured: number, detail: string): SelfTestCase {
  const error = Math.abs(expected - measured)
  return { name, expected, measured, error, pass: error < 0.01, detail }
}
