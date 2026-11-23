import { deg2rad } from './vector.ts'

// 斑马板条纹：沿板平面的一维周期相位（周期 mm，走向角 deg）
export function stripePhase(
  x: number, y: number, period: number, angleDeg: number, phaseShift: number,
): number {
  const a = deg2rad(angleDeg)
  const along = x * Math.cos(a) + y * Math.sin(a)
  return (2 * Math.PI * along) / period + phaseShift
}

// 四步相移：返回灰度 [0,1]
export function phaseShiftIntensity(
  x: number, y: number, period: number, angleDeg: number, step: number, steps: number,
): number {
  const shift = (2 * Math.PI * step) / steps
  const phi = stripePhase(x, y, period, angleDeg, shift)
  return 0.5 + 0.5 * Math.cos(phi)
}

// 四步相移提取包裹相位 atan2(-I3+I1, I0-I2)
export function wrappedPhase(i0: number, i1: number, i2: number, i3: number): number {
  return Math.atan2(i1 - i3, i0 - i2)
}
