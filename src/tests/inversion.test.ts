import { describe, expect, it } from 'vitest'
import { createAnalyticSurface } from '../optics/analytic_surface'
import { DEFAULT_LAYER } from '../optics/laminate'
import { DEFAULT_STATION } from '../optics/station'
import { computeDiopterField, GridSpec } from '../optics/diopter'
import { synthesizeStripeImage, invertDiopterFromImage } from '../optics/inversion'

const grid: GridSpec = { xMin: -0.1, xMax: 0.1, yMin: -0.1, yMax: 0.1, nx: 41, ny: 41 }

describe('条纹反推与直接计算一致性', () => {
  it('球面带缺陷玻璃：逐点屈光度反推值与正算值 RMS 误差 < 0.02 D', () => {
    const field = createAnalyticSurface({ type: 'sphere', radius: 2.5 })
    const layer = { ...DEFAULT_LAYER }
    const station = { ...DEFAULT_STATION, installTiltDeg: 0, eye: { x: 0, y: 0, z: -0.8 } }

    const direct = computeDiopterField(field, layer, station, grid)
    const image = synthesizeStripeImage(field, layer, station, grid)
    const inverted = invertDiopterFromImage(image, station)

    let sumSq = 0
    let count = 0
    let maxErr = 0
    for (let iy = 1; iy < grid.ny - 1; iy++) {
      for (let ix = 1; ix < grid.nx - 1; ix++) {
        const d = direct.matrix[iy][ix]
        const inv = inverted.matrix[iy][ix]
        if (!d || !inv) continue
        const err = Math.abs(d.dMax - inv.dMax)
        sumSq += err * err
        maxErr = Math.max(maxErr, err)
        count++
      }
    }
    const rms = Math.sqrt(sumSq / count)
    expect(rms).toBeLessThan(0.02)
    expect(maxErr).toBeLessThan(0.05)
  })

  it('平板玻璃正视（倾角0）：反推净畸变接近零（残差为有限距离平板透视，量级 t/L²）', () => {
    const field = createAnalyticSurface({ type: 'plane', radius: 0 })
    const station = { ...DEFAULT_STATION, installTiltDeg: 0, eye: { x: 0, y: 0, z: -0.8 } }
    const image = synthesizeStripeImage(field, DEFAULT_LAYER, station, grid)
    const inverted = invertDiopterFromImage(image, station)
    expect(inverted.maxAbs).toBeLessThan(0.02)
  })
})
