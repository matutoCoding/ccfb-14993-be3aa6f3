import type { DiopterMap, ZonePolygon } from '@/types'

// 屈光度配色：负值蓝、零附近中性、正值红，按限值归一化
function diopterColor(d: number, limit: number): string {
  const t = Math.max(-1, Math.min(1, d / limit))
  if (t >= 0) {
    const k = t
    const r = Math.round(248 + (220 - 248) * k)
    const g = Math.round(250 - 150 * k)
    const b = Math.round(252 - 200 * k)
    return `rgb(${r},${g},${b})`
  }
  const k = -t
  const r = Math.round(248 - 180 * k)
  const g = Math.round(250 - 90 * k)
  const b = Math.round(252 - 40 * k)
  return `rgb(${r},${g},${b})`
}

export function drawDiopterHeatmap(
  canvas: HTMLCanvasElement,
  map: DiopterMap,
  limit: number,
  zones: ZonePolygon[],
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)
  const cellW = width / map.nx
  const cellH = height / map.ny

  for (const s of map.samples) {
    const ix = ((s.x + map.width / 2) / map.width) * map.nx
    const iy = ((s.y + map.height / 2) / map.height) * map.ny
    ctx.fillStyle = diopterColor(Math.max(Math.abs(s.dx), Math.abs(s.dy)), limit)
    ctx.fillRect(ix * cellW, (map.ny - 1 - iy) * cellH, cellW + 1, cellH + 1)
  }

  // 区域边界
  ctx.lineWidth = 2
  zones.forEach((zone) => {
    ctx.strokeStyle = zone.zone === 'A' ? '#1d4ed8' : '#7c3aed'
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    zone.points.forEach((p, i) => {
      const px = ((p.x + map.width / 2) / map.width) * width
      const py = height - ((p.y + map.height / 2) / map.height) * height
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.closePath()
    ctx.stroke()
  })
  ctx.setLineDash([])

  // 超标点描边
  ctx.fillStyle = 'rgba(220,38,38,0.9)'
  for (const s of map.samples) {
    if (!s.pass && s.zone !== 'outside') {
      const ix = ((s.x + map.width / 2) / map.width) * map.nx
      const iy = ((s.y + map.height / 2) / map.height) * map.ny
      ctx.beginPath()
      ctx.arc(ix * cellW, (map.ny - 1 - iy) * cellH, 2.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// 玻璃高度场预览：按 z 值灰度着色 + 等值线
export function drawSurfacePreview(
  canvas: HTMLCanvasElement,
  zValues: Float64Array,
  nx: number, ny: number, width: number, height: number,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  let min = Infinity
  let max = -Infinity
  for (const z of zValues) {
    min = Math.min(min, z)
    max = Math.max(max, z)
  }
  const range = Math.max(1e-9, max - min)
  const cw = canvas.width / nx
  const ch = canvas.height / ny
  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const t = (zValues[iy * nx + ix] - min) / range
      const shade = Math.round(235 - t * 110)
      ctx.fillStyle = `rgb(${shade},${shade + 4},${Math.min(255, shade + 14)})`
      ctx.fillRect(ix * cw, (ny - 1 - iy) * ch, cw + 1, ch + 1)
    }
  }
}

// 斑马条纹渲染（板平面正视）
export function drawZebraBoard(
  canvas: HTMLCanvasElement,
  period: number, angleDeg: number,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = canvas
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, width, height)
  ctx.save()
  ctx.translate(width / 2, height / 2)
  ctx.rotate((-angleDeg * Math.PI) / 180)
  const span = Math.hypot(width, height)
  const pxPeriod = (period / 4000) * span
  for (let x = -span; x < span; x += pxPeriod) {
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(x, -span, pxPeriod / 2, span * 2)
  }
  ctx.restore()
}
