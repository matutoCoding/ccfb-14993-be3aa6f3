// 全局领域类型定义：单位约定 长度 mm，角度 deg，折射率无量纲，屈光度 D = m^-1

export type Vec3 = { x: number; y: number; z: number }

// 单条 loft 控制曲线：固定 y 高度上，x 方向的 sagitta(z) 控制点
export type LoftCurve = {
  id: string
  y: number
  points: { x: number; z: number }[]
}

// 导入的点云采样点（玻璃局部坐标系）
export type PointCloudSample = { x: number; y: number; z: number }

export type DefectType = 'thickness' | 'ripple' | 'edge_bulge'

export type Defect = {
  id: string
  type: DefectType
  name: string
  // 中心位置与幅度（厚度类单位 mm；波纹/凸起为高度 mm）
  cx: number
  cy: number
  amplitude: number
  // 高斯特征宽度 mm
  sigma: number
  // 波纹专用：波长 mm 与走向角 deg（0 = 沿 x 方向波动）
  wavelength: number
  angleDeg: number
  enabled: boolean
}

export type GlassSurface = {
  id: string
  vehicleId: string
  name: string
  width: number
  height: number
  outerThickness: number
  pvbThickness: number
  innerThickness: number
  nGlass: number
  nPvb: number
  gridNx: number
  gridNy: number
  loftCurves: LoftCurve[]
  pointCloud?: PointCloudSample[]
  defects: Defect[]
  updatedAt: number
}

// 区域多边形（玻璃局部 xy 平面，单位 mm）
export type ZonePolygon = {
  zone: 'A' | 'B'
  points: { x: number; y: number }[]
}

export type VehicleProfile = {
  id: string
  name: string
  code: string
  category: 'sedan' | 'suv' | 'hud'
  description: string
  // 装车倾角：玻璃绕 x 轴后倾角 deg
  rakeDeg: number
  // 驾驶员眼点（玻璃局部坐标 mm）
  eyePoint: Vec3
  // 玻璃在整车中的安装参考点（世界系 mm）
  mountOrigin: Vec3
  zones: ZonePolygon[]
  hudArea?: { x: number; y: number; w: number; h: number }
  defaultSurfaceId?: string
  defaultStationId?: string
  createdAt: number
  updatedAt: number
}

export type InspectionStation = {
  id: string
  vehicleId: string
  name: string
  // 斑马板到玻璃 nominal 平面距离 mm
  boardDistance: number
  // 条纹周期宽度 mm、条纹走向角 deg
  stripePeriod: number
  stripeAngleDeg: number
  // 相机像素
  cameraWidth: number
  cameraHeight: number
  // 相机 FOV deg 与眼点偏移（相对车型眼点）
  cameraFovDeg: number
  eyeOffset: Vec3
  updatedAt: number
}

// 逐点屈光度采样
export type DiopterSample = {
  x: number
  y: number
  // 水平/垂直方向光焦度 D
  dx: number
  dy: number
  // 主方向光焦度 D
  power: number
  zone: 'A' | 'B' | 'outside'
  pass: boolean
}

export type DiopterMap = {
  nx: number
  ny: number
  width: number
  height: number
  samples: DiopterSample[]
  // 反演对照
  inverseSamples?: DiopterSample[]
  maxAbsError: number
}

export type BatchRecord = {
  id: string
  batchNo: string
  vehicleId: string
  surfaceId: string
  stationId: string
  // 单块玻璃：缺陷参数快照 + 判定
  pieces: {
    serial: string
    defects: Defect[]
    maxPowerA: number
    maxPowerB: number
    verdict: 'pass' | 'reject'
    measuredAt: number
  }[]
  createdAt: number
}

export type LimitSettings = {
  limitA: number
  limitB: number
  // 数值差分步长 mm
  derivativeStep: number
  // 相位反演采样分辨率
  inverseNx: number
  inverseNy: number
}

export type AppSettings = {
  id: 'global'
  limits: LimitSettings
  // 斑马板条纹相移步数（反演用）
  phaseShiftSteps: number
  // 渲染分辨率倍率
  renderScale: number
  updatedAt: number
}
