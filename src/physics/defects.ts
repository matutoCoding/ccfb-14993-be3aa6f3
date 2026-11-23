import type { Defect } from '../types.ts'
import { deg2rad } from './vector.ts'
import { fillField, makeField, type HeightField } from './heightfield.ts'

// 缺陷场：在玻璃网格上叠加的高度扰动 z_d(x,y)，单位 mm
export function buildDefectField(
  defects: Defect[], nx: number, ny: number, width: number, height: number,
): HeightField {
  const active = defects.filter((d) => d.enabled)
  return fillField(makeField(nx, ny, width, height), (x, y) => {
    let z = 0
    for (const d of active) {
      const dx = x - d.cx
      const dy = y - d.cy
      const r2 = dx * dx + dy * dy
      const gauss = Math.exp(-r2 / (2 * d.sigma * d.sigma))
      if (d.type === 'thickness') {
        // 局部厚度不均：单侧鼓包
        z += d.amplitude * gauss
      } else if (d.type === 'ripple') {
        // 成型波纹：高斯包络内正弦波，angleDeg 决定波脊走向
        const a = deg2rad(d.angleDeg)
        const along = dx * Math.cos(a) + dy * Math.sin(a)
        z += d.amplitude * gauss * Math.sin((2 * Math.PI * along) / d.wavelength)
      } else {
        // 边部应力凸起：高斯凸起，天然靠用户把中心放到边部
        z += d.amplitude * gauss
      }
    }
    return z
  })
}
