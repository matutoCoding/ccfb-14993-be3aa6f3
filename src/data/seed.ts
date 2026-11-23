import type {
  Defect, GlassSurface, InspectionStation, VehicleProfile, ZonePolygon,
} from '@/types'
import {
  DEFAULT_BOARD_DISTANCE, DEFAULT_GRID_NX, DEFAULT_STRIPE_PERIOD,
  N_GLASS_DEFAULT, N_PVB_DEFAULT, uid,
} from '@/physics/constants'

const now = Date.now()

function zoneRect(cx: number, cy: number, w: number, h: number, zone: 'A' | 'B'): ZonePolygon {
  return {
    zone,
    points: [
      { x: cx - w / 2, y: cy - h / 2 },
      { x: cx + w / 2, y: cy - h / 2 },
      { x: cx + w / 2, y: cy + h / 2 },
      { x: cx - w / 2, y: cy + h / 2 },
    ],
  }
}

// 三条 loft 控制曲线：底边较平、中部和顶边渐弯，z 为相对中面的 sagitta
function sedanLoft(width: number) {
  const bend = (x: number, k: number) => k * (1 - (2 * x) / width) ** 2
  return [-350, 0, 350].map((y, idx) => ({
    id: uid('loft'),
    y,
    points: [-width / 2, -width / 4, 0, width / 4, width / 2].map((x) => ({
      x,
      z: bend(x, [6, 10, 14][idx]),
    })),
  }))
}

function makeSurface(vehicleId: string, name: string, width: number, height: number): GlassSurface {
  return {
    id: uid('surf'),
    vehicleId,
    name: `${name}前挡夹层玻璃`,
    width,
    height,
    outerThickness: 2.1,
    pvbThickness: 0.76,
    innerThickness: 2.1,
    nGlass: N_GLASS_DEFAULT,
    nPvb: N_PVB_DEFAULT,
    gridNx: DEFAULT_GRID_NX,
    gridNy: DEFAULT_GRID_NX,
    loftCurves: sedanLoft(width),
    defects: [],
    updatedAt: now,
  }
}

function makeStation(vehicleId: string, name: string): InspectionStation {
  return {
    id: uid('station'),
    vehicleId,
    name: `${name}斑马板检测工位`,
    boardDistance: DEFAULT_BOARD_DISTANCE,
    stripePeriod: DEFAULT_STRIPE_PERIOD,
    stripeAngleDeg: 90,
    cameraWidth: 640,
    cameraHeight: 640,
    cameraFovDeg: 30,
    eyeOffset: { x: 0, y: 0, z: 0 },
    updatedAt: now,
  }
}

export function makeDefect(type: Defect['type'], name: string, cx: number, cy: number): Defect {
  const presets: Record<Defect['type'], Partial<Defect>> = {
    thickness: { amplitude: 0.08, sigma: 60, wavelength: 0, angleDeg: 0 },
    ripple: { amplitude: 0.03, sigma: 90, wavelength: 24, angleDeg: 0 },
    edge_bulge: { amplitude: 0.12, sigma: 35, wavelength: 0, angleDeg: 0 },
  }
  return {
    id: uid('defect'),
    type,
    name,
    cx,
    cy,
    amplitude: presets[type].amplitude ?? 0.05,
    sigma: presets[type].sigma ?? 50,
    wavelength: presets[type].wavelength ?? 0,
    angleDeg: presets[type].angleDeg ?? 0,
    enabled: true,
  }
}

export type SeedBundle = {
  vehicle: VehicleProfile
  surface: GlassSurface
  station: InspectionStation
}

function buildVehicle(
  code: string, name: string, category: VehicleProfile['category'],
  rakeDeg: number, width: number, height: number, hud = false,
): SeedBundle {
  const vehicleId = uid('veh')
  const vehicle: VehicleProfile = {
    id: vehicleId,
    name,
    code,
    category,
    description: hud ? '带 HUD 投影区域的前挡车型' : `${name}平台车型`,
    rakeDeg,
    eyePoint: { x: 0, y: -80, z: 500 },
    mountOrigin: { x: 0, y: 0, z: 0 },
    zones: [
      zoneRect(0, -40, width * 0.42, height * 0.4, 'A'),
      zoneRect(0, -40, width * 0.72, height * 0.66, 'B'),
    ],
    hudArea: hud ? { x: -180, y: 60, w: 360, h: 180 } : undefined,
    createdAt: now,
    updatedAt: now,
  }
  const surface = makeSurface(vehicleId, name, width, height)
  const station = makeStation(vehicleId, name)
  vehicle.defaultSurfaceId = surface.id
  vehicle.defaultStationId = station.id
  // 每种车型预置一个典型缺陷，方便首次进入就看到效果
  surface.defects = [
    makeDefect('ripple', '成型波纹（顶部）', 0, height * 0.3),
  ]
  return { vehicle, surface, station }
}

export function buildSeedData(): SeedBundle[] {
  return [
    buildVehicle('SED-01', '家用轿车', 'sedan', 28, 1300, 900),
    buildVehicle('SUV-02', '城市SUV', 'suv', 35, 1400, 950),
    buildVehicle('HUD-03', 'HUD旗舰车型', 'hud', 31, 1350, 920, true),
  ]
}
