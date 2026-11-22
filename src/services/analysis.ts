// 检测分析服务：逐点屈光度 -> 分区套限值 -> 判定结论
import { HeightField } from '../optics/surface'
import { LayerSpec } from '../optics/laminate'
import { StationSpec } from '../optics/station'
import { computeDiopterField, DiopterField, GridSpec } from '../optics/diopter'
import { AppSettings, VehicleModel, Verdict, ZonePolygon } from '../models/types'

export interface ZoneVerdict {
  zoneId: string
  zoneName: string
  limit: number
  maxDiopter: number
  exceed: boolean
  // 超标采样点（归一化玻璃坐标 + 屈光度）
  exceedPoints: { xNorm: number; yNorm: number; d: number }[]
}

export interface AnalysisResult {
  field: DiopterField
  zones: ZoneVerdict[]
  verdict: Verdict
  maxDiopter: number
}

const pointInPolygon = (px: number, py: number, poly: { x: number; y: number }[]): boolean => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y
    const xj = poly[j].x, yj = poly[j].y
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export const analyzeGlass = (
  heightField: HeightField,
  layer: LayerSpec,
  station: StationSpec,
  vehicle: VehicleModel,
  settings: AppSettings,
  grid: GridSpec
): AnalysisResult => {
  const field = computeDiopterField(heightField, layer, station, grid)
  const zones: ZoneVerdict[] = vehicle.zones.map((z: ZonePolygon) => ({
    zoneId: z.id,
    zoneName: z.name,
    limit: z.limitDiopter,
    maxDiopter: 0,
    exceed: false,
    exceedPoints: []
  }))

  for (const s of field.samples) {
    const xNorm = (s.x - grid.xMin) / (grid.xMax - grid.xMin)
    const yNorm = (s.y - grid.yMin) / (grid.yMax - grid.yMin)
    for (let zi = 0; zi < vehicle.zones.length; zi++) {
      const zone = vehicle.zones[zi]
      if (pointInPolygon(xNorm, yNorm, zone.points)) {
        const zv = zones[zi]
        zv.maxDiopter = Math.max(zv.maxDiopter, Math.abs(s.dMax))
        if (Math.abs(s.dMax) > zone.limitDiopter) {
          zv.exceed = true
          zv.exceedPoints.push({ xNorm, yNorm, d: s.dMax })
        }
      }
    }
  }

  const maxDiopter = zones.reduce((m, z) => Math.max(m, z.maxDiopter), 0)
  const anyExceed = zones.some((z) => z.exceed)
  // marginal：任一区域最大值进入限值下方 marginalBand 内
  const nearLimit = zones.some((z) => z.maxDiopter > z.limit - settings.marginalBand)
  const verdict: Verdict = anyExceed ? 'fail' : nearLimit ? 'marginal' : 'pass'

  return { field, zones, verdict, maxDiopter }
}
