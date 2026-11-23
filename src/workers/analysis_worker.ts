// 物理计算 Worker：接收结构化参数，返回屈光度图，避免阻塞主线程
import { buildGlassStack } from '@/physics/glass_stack'
import { computeDirectDiopterMap } from '@/physics/diopter'
import { computeInverseDiopterMap } from '@/physics/inverse'
import type { DiopterMap, GlassSurface, InspectionStation, VehicleProfile } from '@/types'

export type AnalysisRequest = {
  kind: 'direct' | 'inverse'
  surface: GlassSurface
  vehicle: VehicleProfile
  station: InspectionStation
  nx: number
  ny: number
  limitA: number
  limitB: number
  derivativeStep: number
}

export type AnalysisResponse = {
  kind: 'direct' | 'inverse'
  map: DiopterMap
  durationMs: number
}

self.onmessage = (ev: MessageEvent<AnalysisRequest>) => {
  const req = ev.data
  const start = performance.now()
  const stack = buildGlassStack(req.surface)
  const eye = {
    x: req.vehicle.eyePoint.x + req.station.eyeOffset.x,
    y: req.vehicle.eyePoint.y + req.station.eyeOffset.y,
    z: req.vehicle.eyePoint.z + req.station.eyeOffset.z,
  }

  let map: DiopterMap
  if (req.kind === 'direct') {
    map = computeDirectDiopterMap({
      stack,
      width: req.surface.width,
      height: req.surface.height,
      nx: req.nx,
      ny: req.ny,
      eye,
      boardDistance: req.station.boardDistance,
      derivativeStep: req.derivativeStep,
      zones: req.vehicle.zones,
      limitA: req.limitA,
      limitB: req.limitB,
    })
  } else {
    map = computeInverseDiopterMap({
      stack,
      vehicle: req.vehicle,
      station: req.station,
      nx: req.nx,
      ny: req.ny,
      limitA: req.limitA,
      limitB: req.limitB,
    })
  }

  const res: AnalysisResponse = { kind: req.kind, map, durationMs: performance.now() - start }
  self.postMessage(res)
}
