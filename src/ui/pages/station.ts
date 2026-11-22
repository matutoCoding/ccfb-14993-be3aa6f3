// 检测工位页：斑马板布置、条纹角度/周期、板距
import { getState, saveStation, newId } from '../../db/store'
import { InspectionStation } from '../../models/types'
import { h, pageHead, clearNode, num } from '../dom'

const drawStationSketch = (canvas: HTMLCanvasElement, st: InspectionStation) => {
  const ctx = canvas.getContext('2d')!
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(0, 0, W, H)

  // 侧视示意：眼点 - 玻璃 - 斑马板
  const eyeX = 60
  const glassX = 200
  const boardX = Math.min(W - 40, glassX + st.boardDistance * 40)
  const midY = H / 2

  // 眼点
  ctx.fillStyle = '#0f172a'
  ctx.beginPath()
  ctx.arc(eyeX, midY, 7, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#475569'
  ctx.font = '13px sans-serif'
  ctx.fillText('驾驶员眼点', eyeX - 24, midY + 28)

  // 玻璃（按倾角倾斜的线段）
  const tilt = (st.installTiltDeg * Math.PI) / 180
  const gHalf = 70
  ctx.strokeStyle = '#2563eb'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(glassX, midY - gHalf * Math.cos(tilt))
  ctx.lineTo(glassX, midY + gHalf * Math.cos(tilt))
  ctx.stroke()
  ctx.fillStyle = '#2563eb'
  ctx.fillText(`风挡 ${st.installTiltDeg}°`, glassX - 28, midY - gHalf - 12)

  // 斑马板条纹
  ctx.strokeStyle = '#334155'
  ctx.lineWidth = 1.5
  const periodPx = Math.max(4, st.stripePeriod * 1200)
  for (let y = midY - gHalf; y < midY + gHalf; y += periodPx) {
    ctx.beginPath()
    ctx.moveTo(boardX - 6, y)
    ctx.lineTo(boardX + 6, y)
    ctx.stroke()
  }
  ctx.strokeStyle = '#64748b'
  ctx.lineWidth = 2
  ctx.strokeRect(boardX - 8, midY - gHalf, 16, gHalf * 2)
  ctx.fillStyle = '#334155'
  ctx.fillText('斑马板', boardX - 16, midY - gHalf - 12)

  // 板距标注
  ctx.strokeStyle = '#94a3b8'
  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(glassX, midY + gHalf + 24)
  ctx.lineTo(boardX, midY + gHalf + 24)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = '#64748b'
  ctx.fillText(`板距 ${st.boardDistance}m · 周期 ${(st.stripePeriod * 1000).toFixed(1)}mm · 角度 ${st.stripeAngleDeg}°`, glassX + 10, midY + gHalf + 42)
}

export const renderStation = (main: HTMLElement): void => {
  clearNode(main)
  const state = getState()
  const station = state.stations.find((s) => s.id === state.currentStationId) ?? state.stations[0]
  main.append(pageHead('检测工位', '按真实车间布置配置斑马板距离、条纹角度与周期宽度'))
  if (!station) return

  const tilt = h('input', { type: 'number', value: String(station.installTiltDeg) })
  const dist = h('input', { type: 'number', step: '0.1', value: String(station.boardDistance) })
  const angle = h('input', { type: 'number', value: String(station.stripeAngleDeg) })
  const period = h('input', { type: 'number', step: '0.001', value: String(station.stripePeriod) })
  const eyeX = h('input', { type: 'number', step: '0.01', value: String(station.eye.x) })
  const eyeY = h('input', { type: 'number', step: '0.01', value: String(station.eye.y) })
  const eyeZ = h('input', { type: 'number', step: '0.01', value: String(station.eye.z) })

  const sketch = document.createElement('canvas')
  sketch.width = 520
  sketch.height = 300
  const redraw = () => drawStationSketch(sketch, station)
  redraw()

  const collect = (): InspectionStation => ({
    ...station,
    installTiltDeg: num(tilt, station.installTiltDeg),
    boardDistance: num(dist, station.boardDistance),
    stripeAngleDeg: num(angle, station.stripeAngleDeg),
    stripePeriod: num(period, station.stripePeriod),
    eye: { x: num(eyeX, 0), y: num(eyeY, 0), z: num(eyeZ, -0.8) }
  })

  ;[tilt, dist, angle, period, eyeX, eyeY, eyeZ].forEach((el) =>
    el.addEventListener('input', () => {
      Object.assign(station, collect())
      redraw()
    })
  )

  const save = h('button', { class: 'btn primary' }, '保存工位')
  save.addEventListener('click', async () => {
    await saveStation(collect())
    save.textContent = '已保存'
    setTimeout(() => (save.textContent = '保存工位'), 1200)
  })

  const addStation = h('button', { class: 'btn' }, '另存为新工位')
  addStation.addEventListener('click', async () => {
    const copy: InspectionStation = { ...collect(), id: newId('stn'), name: `工位 ${state.stations.length + 1}` }
    await saveStation(copy)
  })

  main.append(
    h('div', { class: 'grid-2' },
      h('div', { class: 'card' },
        h('h2', {}, station.name),
        h('div', { class: 'grid-2' },
          h('div', { class: 'field' }, h('label', {}, '装车倾角（°）'), tilt),
          h('div', { class: 'field' }, h('label', {}, '板到玻璃距离（m）'), dist),
          h('div', { class: 'field' }, h('label', {}, '条纹角度（°）'), angle),
          h('div', { class: 'field' }, h('label', {}, '条纹周期宽度（m）'), period),
          h('div', { class: 'field' }, h('label', {}, '眼点 X（m）'), eyeX),
          h('div', { class: 'field' }, h('label', {}, '眼点 Y（m）'), eyeY),
          h('div', { class: 'field' }, h('label', {}, '眼点 Z（m）'), eyeZ)
        ),
        h('div', { class: 'row' }, save, addStation)
      ),
      h('div', { class: 'card' },
        h('h2', {}, '工位侧视示意'),
        h('div', { class: 'canvas-wrap' }, sketch)
      )
    )
  )
}
