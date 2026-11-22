// 领域模型：车型、玻璃曲面、检测工位、缺陷、批次记录
import { LayerSpec } from '../optics/laminate'
import { StationSpec } from '../optics/station'

export interface ZonePolygon {
  id: string
  name: string
  // 玻璃系归一化坐标 [0,1] 的多边形顶点，运行时映射到玻璃尺寸
  points: { x: number; y: number }[]
  // 限值（最大主屈光度，D）
  limitDiopter: number
}

export interface VehicleModel {
  id: string
  name: string
  category: 'sedan' | 'suv' | 'hud'
  // 装车倾角（度）
  installTiltDeg: number
  // 驾驶员眼点（玻璃系，米）
  eyePoint: { x: number; y: number; z: number }
  // 玻璃外接尺寸（米）：宽 x 高
  width: number
  height: number
  // A 区 / B 区多边形
  zones: ZonePolygon[]
  createdAt: number
  updatedAt: number
}

// 控制曲线生成参数：2~3 条截面曲线，每条用若干控制点描述高度
export interface ControlCurve {
  // 曲线所在的归一化 y 位置 [0,1]
  yNorm: number
  // 控制点：归一化 x -> 矢高（米）
  points: { xNorm: number; sag: number }[]
}

export type DefectType = 'thickness_uneven' | 'forming_ripple' | 'edge_stress'

export interface ManufactureDefect {
  id: string
  type: DefectType
  // 中心位置（归一化玻璃坐标）
  xNorm: number
  yNorm: number
  // 幅度（厚度不均/应力：米；波纹：无量纲矢高比）
  amplitude: number
  // 影响半径（米）
  radius: number
  // 波纹专用：空间频率（1/米）
  frequency: number
  enabled: boolean
}

export interface GlassSurface {
  id: string
  vehicleId: string
  name: string
  // 生成方式：控制曲线 或 点云拟合
  source: 'control_curves' | 'point_cloud'
  controlCurves: ControlCurve[]
  // 点云拟合输入（米），source=point_cloud 时使用
  pointCloud?: { x: number; y: number; z: number }[]
  layer: LayerSpec
  defects: ManufactureDefect[]
  updatedAt: number
}

export interface InspectionStation extends StationSpec {
  id: string
  name: string
}

export type Verdict = 'pass' | 'fail' | 'marginal'

export interface GlassRecord {
  id: string
  batchId: string
  serialNo: string
  vehicleId: string
  surfaceId: string
  // 该块玻璃的缺陷参数快照
  defects: ManufactureDefect[]
  verdict: Verdict
  // 分区超标情况
  zoneResults: { zoneId: string; zoneName: string; maxDiopter: number; limit: number; exceed: boolean }[]
  maxDiopter: number
  measuredAt: number
}

export interface BatchRecord {
  id: string
  name: string
  vehicleId: string
  stationId: string
  createdAt: number
  records: GlassRecord[]
}

export interface AppSettings {
  id: string
  // 默认 A/B 区限值（D）
  defaultLimitA: number
  defaultLimitB: number
  // 判定裕量：marginal 区间宽度（D）
  marginalBand: number
  // 仿真网格分辨率
  gridResolution: number
  // WebGPU 不可用时是否启用 CPU 光栅
  cpuFallback: boolean
}
