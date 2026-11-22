import { describe, expect, it } from 'vitest'
import { createAnalyticSurface } from '../optics/analytic_surface'
import { DEFAULT_LAYER, LayerSpec } from '../optics/laminate'
import { computeCollimatedPower, lensmakerPower } from '../optics/diopter'
import { refract } from '../optics/refraction'
import { normalize } from '../optics/vector'

// 校验用单片玻璃：外片取真实厚度，PVB 与内片压到极薄，等效单片厚透镜
const singlePlate = (thickness: number): LayerSpec => ({
  outerGlass: thickness,
  pvb: 1e-6,
  innerGlass: 1e-6,
  nGlass: 1.52,
  nPvb: 1.52
})

describe('Snell 折射基本定律', () => {
  it('空气->玻璃 近轴折射角符合 n1 sinθ1 = n2 sinθ2', () => {
    const r = refract(normalize({ x: 0.1, y: 0, z: -1 }), { x: 0, y: 0, z: 1 }, 1 / 1.52)
    const sinI = 0.1 / Math.hypot(0.1, 1)
    const sinT = 1.52 * sinI // 反向比值：sinT = sinI/1.52，这里 eta=1/1.52
    expect(sinT).toBeGreaterThan(0)
    const txz = Math.hypot(r.dir.x, r.dir.z)
    const sinOut = r.dir.x / txz
    expect(sinOut).toBeCloseTo(sinI / 1.52, 6)
  })

  it('垂直入射不偏折', () => {
    const r = refract({ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, 1 / 1.52)
    expect(r.dir.x).toBeCloseTo(0, 12)
    expect(r.dir.z).toBeCloseTo(-1, 12)
    expect(r.tir).toBe(false)
  })
})

describe('已知曲率玻璃屈光度精度（平行光权威口径）', () => {
  it('球面 R=1.04m 平凸透镜：追迹功率与 lensmaker 手算误差 < 0.01 D', () => {
    const R = 1.04
    const t = 0.0021
    const field = createAnalyticSurface({ type: 'sphere', radius: R })
    const layer = singlePlate(t)
    // planoBack：凸面 + 平面背面，标准平凸透镜，平行光入射
    const at = computeCollimatedPower(field, layer, 0, 0, 1e-4, true)
    expect(at).not.toBeNull()
    const expected = lensmakerPower(R, t, 1.52)
    expect(Math.abs(at!.dMax - expected)).toBeLessThan(0.01)
  })

  it('柱面 R=2m 等厚弯月镜：母线方向功率严格为零，曲率方向功率被第二面抵消', () => {
    const field = createAnalyticSurface({ type: 'cylinder_x', radius: 2 })
    const layer = singlePlate(0.002)
    // 等厚（法线偏移）弯月结构：两面曲率半径差仅一个厚度，净功率很小
    const at = computeCollimatedPower(field, layer, 0, 0, 1e-4)
    expect(at).not.toBeNull()
    // 母线沿 x：x 方向无曲率，功率严格为零
    expect(Math.abs(at!.dxx)).toBeLessThan(0.005)
    // 曲率方向 y：弯月镜净功率 ≈ -(n-1)·t/R²，量级很小而非单面 (n-1)/R
    const expectedMeniscus = -(0.52 * 0.002) / (2 * 2)
    expect(Math.abs(at!.dyy - expectedMeniscus)).toBeLessThan(0.01)
  })

  it('柱面 R=2m 平凸：曲率方向呈现完整单面功率', () => {
    const field = createAnalyticSurface({ type: 'cylinder_x', radius: 2 })
    const layer = singlePlate(0.002)
    const at = computeCollimatedPower(field, layer, 0, 0, 1e-4, true)
    expect(at).not.toBeNull()
    expect(Math.abs(at!.dyy - 0.52 / 2)).toBeLessThan(0.01)
    expect(Math.abs(at!.dxx)).toBeLessThan(0.005)
  })

  it('平板玻璃屈光度恒为零（平行光，任意采样位置）', () => {
    const field = createAnalyticSurface({ type: 'plane', radius: 0 })
    const layer = { ...DEFAULT_LAYER }
    const at = computeCollimatedPower(field, layer, 0.05, 0.03, 1e-4)
    expect(at).not.toBeNull()
    expect(Math.abs(at!.dMax)).toBeLessThan(1e-6)
  })
})
