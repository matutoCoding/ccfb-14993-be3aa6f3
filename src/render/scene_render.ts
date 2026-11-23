import type { InspectionStation, VehicleProfile } from '@/types'
import type { GlassStack } from '@/physics/glass_stack'
import { traceRay } from '@/physics/ray_tracer'
import { phaseShiftIntensity } from '@/physics/zebra'
import { deg2rad, v3 } from '@/physics/vector'

// 仿真相机拍斑马板：每像素追迹一条光线，返回灰度图
export function renderCameraImage(
  stack: GlassStack,
  vehicle: VehicleProfile,
  station: InspectionStation,
  phaseStep: number,
  width: number,
  height: number,
): Uint8ClampedArray {
  const eye = {
    x: vehicle.eyePoint.x + station.eyeOffset.x,
    y: vehicle.eyePoint.y + station.eyeOffset.y,
    z: vehicle.eyePoint.z + station.eyeOffset.z,
  }
  const boardZ = eye.z - station.boardDistance
  const aspect = station.cameraWidth / station.cameraHeight
  const halfTan = Math.tan(deg2rad(station.cameraFovDeg) / 2)
  const out = new Uint8ClampedArray(width * height * 4)

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const u = (px / (width - 1)) * 2 - 1
      const v = 1 - (py / (height - 1)) * 2
      const dir = v3(u * halfTan * aspect, v * halfTan, -1)
      const r = traceRay(stack, eye, dir, boardZ)
      let gray = 240
      if (r.hit && r.boardPoint && !r.totalReflection) {
        gray = Math.round(255 * phaseShiftIntensity(
          r.boardPoint.x, r.boardPoint.y,
          station.stripePeriod, station.stripeAngleDeg, phaseStep, 4,
        ))
      } else if (r.totalReflection) {
        gray = 60
      }
      const i = (py * width + px) * 4
      out[i] = gray
      out[i + 1] = gray
      out[i + 2] = gray
      out[i + 3] = 255
    }
  }
  return out
}

// 主驾视角：前方虚拟路面 + 车道线，眼点移动时呈现跳动
export type RoadViewOptions = {
  eyeShiftX: number
  eyeShiftY: number
  width: number
  height: number
}

export function renderDriverView(
  stack: GlassStack,
  vehicle: VehicleProfile,
  station: InspectionStation,
  opts: RoadViewOptions,
): Uint8ClampedArray {
  const eye = {
    x: vehicle.eyePoint.x + station.eyeOffset.x + opts.eyeShiftX,
    y: vehicle.eyePoint.y + station.eyeOffset.y + opts.eyeShiftY,
    z: vehicle.eyePoint.z + station.eyeOffset.z,
  }
  const { width, height } = opts
  const out = new Uint8ClampedArray(width * height * 4)
  const aspect = width / height
  const halfTan = Math.tan(deg2rad(station.cameraFovDeg) / 2)

  // 虚拟路面：世界系 y=-600 平面，深灰色，每 400mm 画白色虚线车道
  const roadY = -600
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const u = (px / (width - 1)) * 2 - 1
      const v = 1 - (py / (height - 1)) * 2
      const dir0 = v3(u * halfTan * aspect, v * halfTan, -1)
      const r = traceRay(stack, eye, dir0, -40000)
      const dir = r.direction
      // 出射光线与路面 y=roadY 求交
      const i = (py * width + px) * 4
      if (Math.abs(dir.y) < 1e-9 || r.totalReflection) {
        out[i] = out[i + 1] = out[i + 2] = 90
        out[i + 3] = 255
        continue
      }
      const t = (roadY - r.origin.y) / dir.y
      if (t < 0) {
        out[i] = out[i + 1] = out[i + 2] = 120
        out[i + 3] = 255
        continue
      }
      const wx = r.origin.x + dir.x * t
      const wz = r.origin.z + dir.z * t
      const lane = Math.abs(wx % 400) < 40 && Math.abs(wz % 800) < 300
      const shade = lane ? 235 : 70
      out[i] = shade
      out[i + 1] = shade
      out[i + 2] = shade + (lane ? 8 : 0)
      out[i + 3] = 255
    }
  }
  return out
}
