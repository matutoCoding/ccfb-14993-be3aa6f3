import type { GlassSurface, PointCloudSample } from '../types.ts'
import { buildLoftField, buildPointCloudField, makeField, type HeightField } from './heightfield.ts'
import { buildDefectField } from './defects.ts'

// 叠层界面：0 外表面(空气→外玻璃) 1 外玻璃/PVB 2 PVB/内玻璃 3 内表面(内玻璃→空气)
export type GlassStack = {
  interfaces: HeightField[]
  // 每条界面入射侧 / 出射侧介质折射率
  nIncident: number[]
  nTransmit: number[]
  nGlass: number
  nPvb: number
  base: HeightField
  defectField: HeightField
}

export function buildBaseField(surface: GlassSurface): HeightField {
  if (surface.pointCloud && surface.pointCloud.length >= 12) {
    const radius = estimateSearchRadius(surface.pointCloud)
    return buildPointCloudField(
      surface.gridNx, surface.gridNy, surface.width, surface.height,
      surface.pointCloud, radius,
    )
  }
  return buildLoftField(
    surface.gridNx, surface.gridNy, surface.width, surface.height,
    surface.loftCurves,
  )
}

function estimateSearchRadius(cloud: PointCloudSample[]): number {
  // 以平均点间距的 2.5 倍作为 MLS 搜索半径
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity

  for (const p of cloud) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
  }
  const area = Math.max(1, (maxX - minX) * (maxY - minY))
  const spacing = Math.sqrt(area / cloud.length)
  return spacing * 2.5
}

function shiftField(base: HeightField, dz: Float64Array): HeightField {
  const out = makeField(base.nx, base.ny, base.width, base.height)
  for (let i = 0; i < base.z.length; i++) out.z[i] = base.z[i] + dz[i]
  return out
}

// 中面定义在两层玻璃正中；外表面 z 更大（朝向斑马板），缺陷场作用于两个暴露界面
export function buildGlassStack(surface: GlassSurface): GlassStack {
  const { gridNx: nx, gridNy: ny, width, height } = surface
  const base = buildBaseField(surface)
  const defectField = buildDefectField(surface.defects, nx, ny, width, height)

  const halfOuter = surface.outerThickness / 2
  const halfInner = surface.innerThickness / 2
  const halfPvb = surface.pvbThickness / 2
  const n = nx * ny

  const dOuter = new Float64Array(n)
  const dOi = new Float64Array(n)
  const dIo = new Float64Array(n)
  const dInner = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    dOuter[i] = halfOuter + halfPvb + defectField.z[i]
    dOi[i] = -halfOuter + halfPvb
    dIo[i] = halfInner - halfPvb
    dInner[i] = -halfInner - halfPvb - defectField.z[i]
  }

  const ng = surface.nGlass
  const np = surface.nPvb
  return {
    interfaces: [
      shiftField(base, dOuter),
      shiftField(base, dOi),
      shiftField(base, dIo),
      shiftField(base, dInner),
    ],
    nIncident: [1, ng, np, ng],
    nTransmit: [ng, np, ng, 1],
    nGlass: ng,
    nPvb: np,
    base,
    defectField,
  }
}
