// CPU 光栅渲染器：把屈光度场/斑马条纹绘制到 Canvas2D，作为 WebGPU 兜底与对照
import { DiopterField, GridSpec } from '../optics/diopter'
import { StripeImage } from '../optics/inversion'

// 屈光度配色：低=蓝，中=浅，高=红（slate 中性底 + 单一强调色阶）
const colorRamp = (t: number): string => {
  const x = Math.max(0, Math.min(1, t))
  const stops = [
    [37, 99, 235], // 蓝
    [226, 232, 240], // 浅 slate
    [220, 38, 38] // 红
  ]
  const seg = x * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(seg))
  const f = seg - i
  const a = stops[i], b = stops[i + 1]
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

export const drawDiopterHeatmap = (
  canvas: HTMLCanvasElement,
  field: DiopterField,
  grid: GridSpec,
  maxScale: number
): void => {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { nx, ny } = grid
  canvas.width = nx
  canvas.height = ny
  const img = ctx.createImageData(nx, ny)
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const s = field.matrix[iy]?.[ix]
      const off = (iy * nx + ix) * 4
      if (!s) {
        img.data[off + 3] = 0
        continue
      }
      const t = (Math.abs(s.dMax) / maxScale) * 0.5 + 0.5
      const [r, g, b] = colorRamp(t).match(/\d+/g)!.map(Number)
      img.data.set([r, g, b, 255], off)
    }
  }
  ctx.putImageData(img, 0, 0)
}

// 斑马条纹图：按板上 u 坐标生成黑白周期条纹
export const drawStripeImage = (
  canvas: HTMLCanvasElement,
  image: StripeImage
): void => {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { grid, u } = image
  canvas.width = grid.nx
  canvas.height = grid.ny
  const img = ctx.createImageData(grid.nx, grid.ny)
  for (let iy = 0; iy < grid.ny; iy++) {
    for (let ix = 0; ix < grid.nx; ix++) {
      const off = (iy * grid.nx + ix) * 4
      const val = u[iy][ix]
      if (val === null) {
        img.data[off + 3] = 0
        continue
      }
      const phase = (val / image.period) % 1
      const bright = phase < 0.5 ? 245 : 25
      img.data.set([bright, bright, bright, 255], off)
    }
  }
  ctx.putImageData(img, 0, 0)
}

// 在已渲染的热图上叠加区域边界与超标点
export const drawZoneOverlay = (
  canvas: HTMLCanvasElement,
  zones: { points: { x: number; y: number }[]; exceed: boolean; exceedPoints?: { xNorm: number; yNorm: number }[] }[]
): void => {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.lineWidth = 1
  zones.forEach((z) => {
    ctx.strokeStyle = z.exceed ? 'rgb(220,38,38)' : 'rgb(71,85,105)'
    ctx.beginPath()
    z.points.forEach((p, i) => {
      const px = p.x * w
      const py = (1 - p.y) * h
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.closePath()
    ctx.stroke()
    z.exceedPoints?.forEach((e) => {
      ctx.fillStyle = 'rgb(220,38,38)'
      ctx.fillRect(e.xNorm * w - 1, (1 - e.yNorm) * h - 1, 2, 2)
    })
  })
}
