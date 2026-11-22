// 畸变分析页：逐点屈光度热图、分区超标、条纹仿真、反推对照、主驾视角预览
import { getState } from '../../db/store'
import { GridSpec } from '../../optics/diopter_support'
import { buildGlassField } from '../../optics/surface_builder'
import { analyzeGlass } from '../../services/analysis'
import { synthesizeStripeImage, invertDiopterFromImage } from '../../optics/inversion'
import { drawDiopterHeatmap, drawStripeImage, drawZoneOverlay } from '../../render/cpu_renderer'
import { h, pageHead, empty, clearNode, fmt, verdictLabel } from '../dom'

export const renderAnalysis = (main: HTMLElement): void => {
  clearNode(main)
  const state = getState()
  const vehicle = state.vehicles.find((v) => v.id === state.currentVehicleId) ?? state.vehicles[0]
  const surface = state.surfaces.find((s) => s.id === state.currentSurfaceId) ??
    state.surfaces.find((s) => s.vehicleId === vehicle?.id)
  const station = state.stations.find((s) => s.id === state.currentStationId) ?? state.stations[0]

  main.append(pageHead('畸变分析', '双层折射追光计算逐点屈光度，按 A/B/HUD 区限值判定，正算与条纹反推结果对照'))

  if (!vehicle || !surface || !station) {
    main.append(empty('数据不完整', '需要车型、玻璃曲面与检测工位齐全才能分析'))
    return
  }

  const res = state.settings.gridResolution
  const grid: GridSpec = {
    xMin: -vehicle.width / 2,
    xMax: vehicle.width / 2,
    yMin: -vehicle.height / 2,
    yMax: vehicle.height / 2,
    nx: res,
    ny: Math.round((res * vehicle.height) / vehicle.width)
  }

  const field = buildGlassField(surface, vehicle.width, vehicle.height)
  // 工位的眼点/倾角以车型档案为准（保证装车一致性），板参数取工位配置
  const effectiveStation = {
    ...station,
    installTiltDeg: vehicle.installTiltDeg,
    eye: vehicle.eyePoint
  }
  const analysis = analyzeGlass(field, surface.layer, effectiveStation, vehicle, state.settings, grid)
  const image = synthesizeStripeImage(field, surface.layer, effectiveStation, grid)
  const inverted = invertDiopterFromImage(image, effectiveStation)

  // 正算/反推一致性 RMS
  let sumSq = 0, count = 0
  for (let iy = 1; iy < grid.ny - 1; iy++) {
    for (let ix = 1; ix < grid.nx - 1; ix++) {
      const d = analysis.field.matrix[iy]?.[ix]
      const inv = inverted.matrix[iy]?.[ix]
      if (d && inv) {
        sumSq += (d.dMax - inv.dMax) ** 2
        count++
      }
    }
  }
  const rms = Math.sqrt(sumSq / Math.max(1, count))

  const heatCanvas = document.createElement('canvas')
  drawDiopterHeatmap(heatCanvas, analysis.field, grid, Math.max(0.05, analysis.field.maxAbs * 1.2))
  drawZoneOverlay(
    heatCanvas,
    analysis.zones.map((z) => ({
      points: vehicle.zones.find((vz) => vz.id === z.zoneId)?.points ?? [],
      exceed: z.exceed,
      exceedPoints: z.exceedPoints
    }))
  )

  const stripeCanvas = document.createElement('canvas')
  drawStripeImage(stripeCanvas, image)

  const invCanvas = document.createElement('canvas')
  drawDiopterHeatmap(invCanvas, inverted, grid, Math.max(0.05, inverted.maxAbs * 1.2))

  const verdictClass = analysis.verdict
  const metricCards = h('div', { class: 'grid-3' },
    h('div', { class: 'card' }, h('div', { class: 'muted' }, '综合判定'), h('div', { style: `margin-top:var(--sp-2)` }, h('span', { class: `badge ${verdictClass}` }, verdictLabel[analysis.verdict]))),
    h('div', { class: 'card' }, h('div', { class: 'muted' }, '最大主屈光度'), h('div', { class: 'metric' }, `${fmt(analysis.maxDiopter, 4)} `, h('small', {}, 'D'))),
    h('div', { class: 'card' }, h('div', { class: 'muted' }, '正算/反推 RMS 偏差'), h('div', { class: 'metric' }, `${fmt(rms, 4)} `, h('small', {}, 'D')))
  )

  const zoneRows = analysis.zones.map((z) =>
    h('tr', {},
      h('td', {}, z.zoneName),
      h('td', {}, fmt(z.limit, 3)),
      h('td', {}, fmt(z.maxDiopter, 4)),
      h('td', {}, h('span', { class: `badge ${z.exceed ? 'fail' : 'pass'}` }, z.exceed ? '超标' : '合格')),
      h('td', {}, String(z.exceedPoints.length))
    )
  )

  // 主驾视角：眼点上下左右移动时的车道线跳动
  const eyeShift = h('input', { type: 'range', min: '-0.12', max: '0.12', step: '0.01', value: '0' }) as HTMLInputElement
  const eyeLateral = h('input', { type: 'range', min: '-0.12', max: '0.12', step: '0.01', value: '0' }) as HTMLInputElement
  const driverCanvas = document.createElement('canvas')
  driverCanvas.width = 480
  driverCanvas.height = 260

  const drawDriver = () => {
    const ctx = driverCanvas.getContext('2d')!
    const W = driverCanvas.width, H = driverCanvas.height
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(0, 0, W, H)
    const shiftY = parseFloat(eyeShift.value)
    const shiftX = parseFloat(eyeLateral.value)
    // 透视路面 + 两条车道线，眼点偏移导致车道线横向跳动
    const horizon = H * 0.42
    ctx.fillStyle = '#334155'
    ctx.fillRect(0, horizon, W, H - horizon)
    const laneBase = (lx: number) => {
      const pts: [number, number][] = []
      for (let i = 0; i <= 20; i++) {
        const t = i / 20
        const y = horizon + t * (H - horizon)
        const perspective = 0.08 + t * 0.9
        const x = W / 2 + (lx * W * 0.28 + shiftX * W * 2) * perspective + shiftY * W * 0.15 * t
        pts.push([x, y])
      }
      return pts
    }
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 2
    ;[-1, 1].forEach((lx) => {
      const pts = laneBase(lx)
      ctx.beginPath()
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
      ctx.stroke()
    })
    ctx.fillStyle = '#94a3b8'
    ctx.font = '13px sans-serif'
    ctx.fillText(`眼点垂直偏移 ${(shiftY * 1000).toFixed(0)}mm · 水平偏移 ${(shiftX * 1000).toFixed(0)}mm`, 16, 24)
    ctx.fillText('观察车道线在视野内的横向跳动', 16, 44)
  }
  drawDriver()
  eyeShift.addEventListener('input', drawDriver)
  eyeLateral.addEventListener('input', drawDriver)

  main.append(
    metricCards,
    h('div', { class: 'grid-2' },
      h('div', { class: 'card' },
        h('h2', {}, '逐点屈光度畸变图（正算）'),
        h('div', { class: 'canvas-wrap' }, heatCanvas),
        h('div', { class: 'muted', style: 'margin-top:var(--sp-2)' }, '蓝色低畸变 → 红色高畸变，线框为检测区，红点为超标采样位置')
      ),
      h('div', { class: 'card' },
        h('h2', {}, '斑马条纹仿真（透过玻璃）'),
        h('div', { class: 'canvas-wrap' }, stripeCanvas),
        h('div', { class: 'muted', style: 'margin-top:var(--sp-2)' }, '条纹弯曲/疏密变化即局部光学畸变的可视化')
      ),
      h('div', { class: 'card' },
        h('h2', {}, '条纹反推屈光度图'),
        h('div', { class: 'canvas-wrap' }, invCanvas),
        h('div', { class: 'muted', style: 'margin-top:var(--sp-2)' }, `由条纹位移反推，与正算 RMS 偏差 ${fmt(rms, 4)} D`)
      ),
      h('div', { class: 'card' },
        h('h2', {}, '主驾视角动态预览'),
        h('div', { class: 'canvas-wrap' }, driverCanvas),
        h('div', { class: 'field', style: 'margin-top:var(--sp-3)' }, h('label', {}, '眼点垂直移动'), eyeShift),
        h('div', { class: 'field' }, h('label', {}, '眼点水平移动'), eyeLateral)
      )
    ),
    h('div', { class: 'card' },
      h('h2', {}, '分区限值判定'),
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, '区域'), h('th', {}, '限值(D)'), h('th', {}, '实测最大(D)'), h('th', {}, '结论'), h('th', {}, '超标点数'))),
        h('tbody', {}, ...zoneRows)
      )
    )
  )
}
