// 车型档案页：装车倾角、眼点、A/B 区划分，区域边界可在玻璃画布上绘制
import { getState, saveVehicle, removeVehicle, newId } from '../../db/store'
import { VehicleModel, ZonePolygon } from '../../models/types'
import { h, pageHead, empty, clearNode, num } from '../dom'

const renderZoneCanvas = (vehicle: VehicleModel): HTMLElement => {
  const canvas = document.createElement('canvas')
  canvas.width = 360
  canvas.height = 250
  const ctx = canvas.getContext('2d')!
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#f1f5f9'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    vehicle.zones.forEach((z, zi) => {
      ctx.beginPath()
      z.points.forEach((p, i) => {
        const px = p.x * canvas.width
        const py = (1 - p.y) * canvas.height
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.closePath()
      ctx.fillStyle = zi === 0 ? 'rgba(37,99,235,0.10)' : 'rgba(100,116,139,0.12)'
      ctx.fill()
      ctx.strokeStyle = zi === 0 ? '#2563eb' : '#64748b'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.fillStyle = '#334155'
      ctx.font = '13px sans-serif'
      const cx = z.points.reduce((s, p) => s + p.x, 0) / z.points.length
      const cy = z.points.reduce((s, p) => s + p.y, 0) / z.points.length
      ctx.fillText(z.name, cx * canvas.width - 12, (1 - cy) * canvas.height)
    })
  }
  draw()

  // 点击在当前选中区追加顶点
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect()
    const xNorm = (e.clientX - rect.left) / rect.width
    const yNorm = 1 - (e.clientY - rect.top) / rect.height
    const target = vehicle.zones[0]
    target.points.push({ x: Math.round(xNorm * 100) / 100, y: Math.round(yNorm * 100) / 100 })
    draw()
  })
  const wrapEl = h('div', { class: 'canvas-wrap' }, canvas)
  return wrapEl
}

export const renderVehicles = (main: HTMLElement): void => {
  clearNode(main)
  const state = getState()
  main.append(pageHead('车型档案', '管理装车倾角、驾驶员眼点与 A/B 检测区，点击画布可在 A 区追加边界顶点'))

  const list = h('div', { class: 'grid-2' })
  const editor = h('div')

  const refreshList = () => {
    list.innerHTML = ''
    if (state.vehicles.length === 0) {
      list.append(empty('暂无车型', '新建一个车型开始配置'))
      return
    }
    state.vehicles.forEach((v) => {
      const card = h(
        'div',
        { class: 'card' },
        h('h2', {}, v.name),
        h('div', { class: 'muted' }, `类型：${v.category} · 倾角 ${v.installTiltDeg}°`),
        h('div', { class: 'muted', style: `margin-top:var(--sp-2)` }, `玻璃 ${v.width}m × ${v.height}m · 检测区 ${v.zones.length} 个`),
        h('div', { class: 'row', style: `margin-top:var(--sp-4)` },
          h('button', { class: 'btn sm primary' }, '编辑'),
          h('button', { class: 'btn sm danger' }, '删除')
        )
      )
      const [editBtn, delBtn] = card.querySelectorAll('button')
      editBtn.addEventListener('click', () => openEditor(v))
      delBtn.addEventListener('click', async () => {
        if (confirm(`确认删除车型「${v.name}」？`)) await removeVehicle(v.id)
      })
      list.append(card)
    })
  }

  const openEditor = (v: VehicleModel) => {
    editor.innerHTML = ''
    const tilt = h('input', { type: 'number', value: String(v.installTiltDeg) })
    const eyeX = h('input', { type: 'number', step: '0.01', value: String(v.eyePoint.x) })
    const eyeY = h('input', { type: 'number', step: '0.01', value: String(v.eyePoint.y) })
    const eyeZ = h('input', { type: 'number', step: '0.01', value: String(v.eyePoint.z) })
    const width = h('input', { type: 'number', step: '0.01', value: String(v.width) })
    const height = h('input', { type: 'number', step: '0.01', value: String(v.height) })
    const limitA = h('input', { type: 'number', step: '0.01', value: String(v.zones[0]?.limitDiopter ?? 0.12) })
    const limitB = h('input', { type: 'number', step: '0.01', value: String(v.zones[1]?.limitDiopter ?? 0.22) })

    const zoneCanvas = renderZoneCanvas(v)
    const addZone = h('button', { class: 'btn sm' }, '新增检测区')
    addZone.addEventListener('click', () => {
      const zone: ZonePolygon = {
        id: newId('zone'),
        name: `区域${v.zones.length + 1}`,
        limitDiopter: 0.2,
        points: [
          { x: 0.3, y: 0.3 }, { x: 0.7, y: 0.3 },
          { x: 0.7, y: 0.7 }, { x: 0.3, y: 0.7 }
        ]
      }
      v.zones.push(zone)
      openEditor(v)
    })

    const save = h('button', { class: 'btn primary' }, '保存车型')
    save.addEventListener('click', async () => {
      v.installTiltDeg = num(tilt, v.installTiltDeg)
      v.eyePoint = { x: num(eyeX, 0), y: num(eyeY, 0), z: num(eyeZ, -0.8) }
      v.width = num(width, v.width)
      v.height = num(height, v.height)
      if (v.zones[0]) v.zones[0].limitDiopter = num(limitA, 0.12)
      if (v.zones[1]) v.zones[1].limitDiopter = num(limitB, 0.22)
      await saveVehicle(v)
      save.textContent = '已保存'
      setTimeout(() => (save.textContent = '保存车型'), 1200)
    })

    editor.append(
      h('div', { class: 'card' },
        h('h2', {}, `编辑 · ${v.name}`),
        h('div', { class: 'grid-2' },
          h('div', { class: 'field' }, h('label', {}, '装车倾角（°）'), tilt),
          h('div', { class: 'field' }, h('label', {}, '玻璃宽度（m）'), width),
          h('div', { class: 'field' }, h('label', {}, '眼点 X（m）'), eyeX),
          h('div', { class: 'field' }, h('label', {}, '玻璃高度（m）'), height),
          h('div', { class: 'field' }, h('label', {}, '眼点 Y（m）'), eyeY),
          h('div', { class: 'field' }, h('label', {}, '眼点 Z（m）'), eyeZ),
          h('div', { class: 'field' }, h('label', {}, 'A 区限值（D）'), limitA),
          h('div', { class: 'field' }, h('label', {}, 'B 区限值（D）'), limitB)
        ),
        h('div', { class: 'field' }, h('label', {}, '检测区边界（点击画布在 A 区追加顶点）'), zoneCanvas),
        h('div', { class: 'row' }, addZone, h('span', { class: 'spacer' }), save)
      )
    )
  }

  const newVehicle = h('button', { class: 'btn primary' }, '新建车型')
  newVehicle.addEventListener('click', () => {
    const v: VehicleModel = {
      id: newId('veh'),
      name: '新车型',
      category: 'sedan',
      installTiltDeg: 28,
      eyePoint: { x: 0, y: 0, z: -0.8 },
      width: 1.4,
      height: 1.0,
      zones: [
        { id: newId('zone'), name: 'A区', limitDiopter: 0.12, points: [{ x: 0.32, y: 0.3 }, { x: 0.68, y: 0.3 }, { x: 0.68, y: 0.72 }, { x: 0.32, y: 0.72 }] },
        { id: newId('zone'), name: 'B区', limitDiopter: 0.22, points: [{ x: 0.12, y: 0.14 }, { x: 0.88, y: 0.14 }, { x: 0.88, y: 0.88 }, { x: 0.12, y: 0.88 }] }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    openEditor(v)
  })

  main.append(h('div', { class: 'row', style: `margin-bottom:var(--sp-5)` }, h('span', { class: 'spacer' }), newVehicle))
  main.append(h('div', { class: 'grid-2' }, list, editor))
  refreshList()
}
