import type { DiopterMap, DiopterSample, InspectionStation, VehicleProfile, ZonePolygon } from '../types.ts'
import { MM_PER_M } from './constants.ts'
import { v3 } from './vector.ts'
import type { GlassStack } from './glass_stack.ts'
import { traceExitDirection, traceRay } from './ray_tracer.ts'

export type DiopterInput = {
  stack: GlassStack
  width: number
  height: number
  nx: number
  ny: number
  eye: { x: number; y: number; z: number }
  boardDistance: number
  derivativeStep: number
  zones: ZonePolygon[]
  limitA: number
  limitB: number
}

type BoardMap = { bx: Float64Array; by: Float64Array; valid: Uint8Array }

// 每个玻璃采样点：眼点→该点→追迹→斑马板交点
function buildBoardMap(input: DiopterInput): BoardMap {
  const { stack, width, height, nx, ny, eye } = input
  const count = nx * ny
  const bx = new Float64Array(count)
  const by = new Float64Array(count)
  const valid = new Uint8Array(count)
  const boardZ = eye.z - boardDistanceOf(input)

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const idx = iy * nx + ix
      const x = -width / 2 + (width * ix) / (nx - 1)
      const y = -height / 2 + (height * iy) / (ny - 1)
      const dir = v3(x - eye.x, y - eye.y, -eye.z)
      const r = traceRay(stack, eye, dir, boardZ)
      if (r.hit && r.boardPoint && !r.totalReflection) {
        bx[idx] = r.boardPoint.x
        by[idx] = r.boardPoint.y
        valid[idx] = 1
      }
    }
  }
  return { bx, by, valid }
}

function boardDistanceOf(input: DiopterInput): number {
  return input.boardDistance
}

function lookup(arr: Float64Array, valid: Uint8Array, nx: number, ny: number, ix: number, iy: number) {
  const cx = Math.min(nx - 2, Math.max(0, ix))
  const cy = Math.min(ny - 2, Math.max(0, iy))
  const i00 = cy * nx + cx
  return {
    v: valid[i00] === 1,
    value: arr[i00],
  }
}

// 点在区域多边形内（射线法）
export function pointInZone(x: number, y: number, poly: { x: number; y: number }[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y
    const xj = poly[j].x, yj = poly[j].y
    const intersect = ((yi > y) !== (yj > y))
      && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }
  return inside
}

export function classifyZone(x: number, y: number, zones: ZonePolygon[]): 'A' | 'B' | 'outside' {
  const zoneA = zones.find((z) => z.zone === 'A')
  const zoneB = zones.find((z) => z.zone === 'B')
  if (zoneA && pointInZone(x, y, zoneA.points)) return 'A'
  if (zoneB && pointInZone(x, y, zoneB.points)) return 'B'
  return 'outside'
}

// 直接计算：板上映射放大率法（与反演同源，D = (1/M - 1)(1/b + 1/g)）
// 另出角偏导法 angularDx/angularDy 作为独立口径互验
export function computeDirectDiopterMap(input: DiopterInput): DiopterMap {
  const { nx, ny, width, height, eye, zones, limitA, limitB, derivativeStep } = input
  const map = buildBoardMap(input)
  const b = -eye.z // 眼到玻璃距离 mm
  const g = input.boardDistance // 玻璃到斑马板距离 mm
  const geoFactor = MM_PER_M * (1 / b + 1 / g)
  const dxMm = width / (nx - 1)
  const dyMm = height / (ny - 1)

  const samples: DiopterSample[] = []
  let maxAbsError = 0

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const idx = iy * nx + ix
      const x = -width / 2 + (width * ix) / (nx - 1)
      const y = -height / 2 + (height * iy) / (ny - 1)
      const zone = classifyZone(x, y, zones)
      if (!map.valid[idx]) {
        samples.push({ x, y, dx: 0, dy: 0, power: 0, zone, pass: true })
        continue
      }

      const il = lookup(map.bx, map.valid, nx, ny, ix - 1, iy)
      const ir = lookup(map.bx, map.valid, nx, ny, ix + 1, iy)
      const jd = lookup(map.by, map.valid, nx, ny, ix, iy - 1)
      const ju = lookup(map.by, map.valid, nx, ny, ix, iy + 1)
      const mx = il.v && ir.v ? (ir.value - il.value) / (2 * dxMm) : 1
      const my = jd.v && ju.v ? (ju.value - jd.value) / (2 * dyMm) : 1

      const dx = (1 / mx - 1) * geoFactor
      const dy = (1 / my - 1) * geoFactor
      const angular = angularDiopter(input, x, y, derivativeStep)
      const power = (Math.abs(dx) + Math.abs(dy)) / 2
      const limit = zone === 'A' ? limitA : zone === 'B' ? limitB : Infinity
      const pass = zone === 'outside' || Math.abs(dx) <= limit && Math.abs(dy) <= limit

      if (angular) {
        maxAbsError = Math.max(maxAbsError, Math.abs(angular.dx - dx), Math.abs(angular.dy - dy))
      }
      samples.push({ x, y, dx, dy, power, zone, pass })
    }
  }

  return { nx, ny, width, height, samples, maxAbsError }
}

// 独立口径：出射光线角偏导 D = dθ/dx（中心差分，f64）
function angularDiopter(
  input: DiopterInput, x: number, y: number, h: number,
): { dx: number; dy: number } | null {
  const { stack, eye } = input
  // 角偏导法：目标点（玻璃落点）固定，从不同眼点发出指向该点的光线
  const angleOf = (ex: number, ey: number, tx: number, ty: number) => {
    const origin = { x: ex, y: ey, z: eye.z }
    const dir = v3(tx - ex, ty - ey, -eye.z)
    return traceExitDirection(stack, origin, dir)
  }
  const lx = angleOf(eye.x - h, eye.y, x - h, y)
  const rx = angleOf(eye.x + h, eye.y, x + h, y)
  const dy1 = angleOf(eye.x, eye.y - h, x, y - h)
  const dy2 = angleOf(eye.x, eye.y + h, x, y + h)
  if (!lx || !rx || !dy1 || !dy2) return null

  const ax = (d: NonNullable<typeof lx>) => Math.atan2(d.x, -d.z)
  const ay = (d: NonNullable<typeof lx>) => Math.atan2(d.y, -d.z)
  return {
    dx: MM_PER_M * (ax(rx) - ax(lx)) / (2 * h),
    dy: MM_PER_M * (ay(dy2) - ay(dy1)) / (2 * h),
  }
}

// 相机针孔光线生成（相机位于眼点，看向 -z）
export function cameraRay(
  eye: { x: number; y: number; z: number },
  station: InspectionStation,
  px: number, py: number,
): { origin: typeof eye; direction: { x: number; y: number; z: number } } {
  const aspect = station.cameraWidth / station.cameraHeight
  const half = Math.tan(((station.cameraFovDeg * Math.PI) / 180) / 2)
  const nx = (px / station.cameraWidth) * 2 - 1
  const ny = 1 - (py / station.cameraHeight) * 2
  return {
    origin: eye,
    direction: v3(nx * half * aspect, ny * half, -1),
  }
}

export type StationContext = {
  vehicle: VehicleProfile
  station: InspectionStation
}
