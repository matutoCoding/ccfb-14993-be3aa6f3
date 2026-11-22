// 初始种子数据：三个测试车型 + 默认工位 + 默认设置
import { AppSettings, InspectionStation, VehicleModel } from '../models/types'
import { uid } from '../db/indexeddb'
import { DEFAULT_LAYER } from '../optics/laminate'

// 通用 A/B 区：A 区居中视区，B 区为外围更大区域
const standardZones = (limitA: number, limitB: number) => [
  {
    id: uid('zone'),
    name: 'A区',
    limitDiopter: limitA,
    points: [
      { x: 0.32, y: 0.3 },
      { x: 0.68, y: 0.3 },
      { x: 0.68, y: 0.72 },
      { x: 0.32, y: 0.72 }
    ]
  },
  {
    id: uid('zone'),
    name: 'B区',
    limitDiopter: limitB,
    points: [
      { x: 0.12, y: 0.14 },
      { x: 0.88, y: 0.14 },
      { x: 0.88, y: 0.88 },
      { x: 0.12, y: 0.88 }
    ]
  }
]

export const seedVehicles = (): VehicleModel[] => [
  {
    id: 'veh_sedan',
    name: '轿跑 Sedan-S1',
    category: 'sedan',
    installTiltDeg: 30,
    eyePoint: { x: 0, y: 0.05, z: -0.78 },
    width: 1.35,
    height: 0.95,
    zones: standardZones(0.12, 0.22),
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'veh_suv',
    name: 'SUV-X7',
    category: 'suv',
    installTiltDeg: 24,
    eyePoint: { x: 0, y: 0.08, z: -0.92 },
    width: 1.5,
    height: 1.05,
    zones: standardZones(0.14, 0.26),
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'veh_hud',
    name: 'HUD 旗舰 H9',
    category: 'hud',
    installTiltDeg: 27,
    eyePoint: { x: 0, y: 0.06, z: -0.85 },
    width: 1.45,
    height: 1.0,
    // HUD 车型额外增加楔形 PVB 视区，限值更严并标注 HUD 区
    zones: [
      ...standardZones(0.1, 0.2),
      {
        id: uid('zone'),
        name: 'HUD区',
        limitDiopter: 0.08,
        points: [
          { x: 0.34, y: 0.55 },
          { x: 0.66, y: 0.55 },
          { x: 0.66, y: 0.82 },
          { x: 0.34, y: 0.82 }
        ]
      }
    ],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
]

export const seedStation = (): InspectionStation => ({
  id: 'stn_default',
  name: '标准斑马板工位',
  installTiltDeg: 30,
  eye: { x: 0, y: 0.05, z: -0.8 },
  boardDistance: 4,
  stripeAngleDeg: 90,
  stripePeriod: 0.024
})

export const seedSettings = (): AppSettings => ({
  id: 'settings_main',
  defaultLimitA: 0.12,
  defaultLimitB: 0.22,
  marginalBand: 0.03,
  gridResolution: 41,
  cpuFallback: true
})

export { DEFAULT_LAYER }
