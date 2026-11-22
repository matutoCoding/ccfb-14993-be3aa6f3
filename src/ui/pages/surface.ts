// 玻璃曲面页：控制曲线/点云生成，夹层厚度，制造缺陷参数
import { getState, saveSurface, newId, setCurrent } from '../../db/store'
import { ManufactureDefect, DefectType } from '../../models/types'
import { buildGlassField, fitPointCloud } from '../../optics/surface_builder'
import { h, pageHead, empty, clearNode, num, fmt } from '../dom'

const DEFECT_META: { type: DefectType; name: string }[] = [
  { type: 'thickness_uneven', name: '局部厚度不均' },
  { type: 'forming_ripple', name: '弯曲成型波纹' },
  { type: 'edge_stress', name: '边部应力凸起' }
]

export const renderSurface = (main: HTMLElement): void => {
  clearNode(main)
  const state = getState()
  const vehicle = state.vehicles.find((v) => v.id === state.currentVehicleId) ?? state.vehicles[0]
  const surfaces = state.surfaces.filter((s) => s.vehicleId === vehicle?.id)
  const surface = surfaces.find((s) => s.id === state.currentSurfaceId) ?? surfaces[0]

  main.append(pageHead('玻璃曲面', '用控制曲线或点云拟合生成曲面，配置内外片+PVB 夹层与制造缺陷'))

  if (!vehicle || !surface) {
    main.append(empty('暂无玻璃曲面', '请先在车型档案中建立车型'))
    return
  }

  const listCard = h('div', { class: 'card' }, h('h2', {}, `车型：${vehicle.name}`))
  const sList = h('div')
  surfaces.forEach((s) => {
    const btn = h('button', { class: `nav-item ${s.id === surface.id ? 'active' : ''}`, style: 'margin-bottom:var(--sp-2)' }, s.name)
    btn.addEventListener('click', () => setCurrent({ currentSurfaceId: s.id }))
    sList.append(btn)
  })
  listCard.append(sList)

  // 夹层厚度
  const tOuter = h('input', { type: 'number', step: '0.0001', value: String(surface.layer.outerGlass) })
  const tPvb = h('input', { type: 'number', step: '0.0001', value: String(surface.layer.pvb) })
  const tInner = h('input', { type: 'number', step: '0.0001', value: String(surface.layer.innerGlass) })
  const nGlass = h('input', { type: 'number', step: '0.01', value: String(surface.layer.nGlass) })
  const nPvb = h('input', { type: 'number', step: '0.01', value: String(surface.layer.nPvb) })

  // 矢高预览（取中线剖面）
  const preview = document.createElement('canvas')
  preview.width = 360
  preview.height = 180
  const drawPreview = () => {
    const field = buildGlassField(surface, vehicle.width, vehicle.height)
    const ctx = preview.getContext('2d')!
    ctx.clearRect(0, 0, preview.width, preview.height)
    ctx.fillStyle = '#f1f5f9'
    ctx.fillRect(0, 0, preview.width, preview.height)
    ctx.beginPath()
    const N = 80
    let zMin = Infinity, zMax = -Infinity
    const pts: { x: number; z: number }[] = []
    for (let i = 0; i <= N; i++) {
      const x = -vehicle.width / 2 + (vehicle.width * i) / N
      const z = field.eval(x, 0)
      pts.push({ x, z })
      zMin = Math.min(zMin, z)
      zMax = Math.max(zMax, z)
    }
    const span = zMax - zMin || 1
    pts.forEach((p, i) => {
      const px = (i / N) * preview.width
      const py = preview.height - ((p.z - zMin) / span) * (preview.height - 20) - 10
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.strokeStyle = '#2563eb'
    ctx.lineWidth = 1.75
    ctx.stroke()
  }
  drawPreview()

  // 点云导入
  const fileInput = h('input', { type: 'file', accept: '.json,.txt,.csv' }) as HTMLInputElement
  const fitInfo = h('div', { class: 'muted' }, '未导入点云')
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result)
        const cloud = text
          .trim()
          .split(/\r?\n/)
          .map((line) => line.split(/[,\s]+/).map(Number))
          .filter((a) => a.length >= 3 && a.every(Number.isFinite))
          .map(([x, y, z]) => ({ x, y, z }))
        if (cloud.length < 6) throw new Error('点云至少需要 6 个点')
        const q = fitPointCloud(cloud)
        surface.source = 'point_cloud'
        surface.pointCloud = cloud
        fitInfo.textContent = `拟合完成：${cloud.length} 点，二次系数 d=${fmt(q.d, 2)} e=${fmt(q.e, 2)}`
        drawPreview()
      } catch (e) {
        fitInfo.textContent = `导入失败：${e instanceof Error ? e.message : String(e)}`
      }
    }
    reader.readAsText(file)
  })

  // 缺陷列表
  const defectBox = h('div')
  const renderDefects = () => {
    defectBox.innerHTML = ''
    if (surface.defects.length === 0) {
      defectBox.append(h('div', { class: 'muted' }, '暂无缺陷，可在下方添加'))
      return
    }
    surface.defects.forEach((d) => {
      const meta = DEFECT_META.find((m) => m.type === d.type)!
      const amp = h('input', { type: 'number', step: '0.0001', value: String(d.amplitude) })
      const radius = h('input', { type: 'number', step: '0.01', value: String(d.radius) })
      const freq = h('input', { type: 'number', step: '1', value: String(d.frequency) })
      const xN = h('input', { type: 'number', step: '0.05', min: '0', max: '1', value: String(d.xNorm) })
      const yN = h('input', { type: 'number', step: '0.05', min: '0', max: '1', value: String(d.yNorm) })
      const enabled = h('input', { type: 'checkbox' }) as HTMLInputElement
      enabled.checked = d.enabled
      const apply = () => {
        d.amplitude = num(amp, d.amplitude)
        d.radius = num(radius, d.radius)
        d.frequency = num(freq, d.frequency)
        d.xNorm = Math.min(1, Math.max(0, num(xN, d.xNorm)))
        d.yNorm = Math.min(1, Math.max(0, num(yN, d.yNorm)))
        d.enabled = enabled.checked
        drawPreview()
      }
      ;[amp, radius, freq, xN, yN].forEach((el) => el.addEventListener('change', apply))
      enabled.addEventListener('change', apply)
      const del = h('button', { class: 'btn sm danger' }, '移除')
      del.addEventListener('click', () => {
        surface.defects = surface.defects.filter((x) => x.id !== d.id)
        renderDefects()
        drawPreview()
      })
      defectBox.append(
        h('div', { class: 'card', style: 'box-shadow:none;background:var(--slate-50)' },
          h('div', { class: 'row' }, h('strong', { style: 'font-size:var(--fs-sm)' }, meta.name), h('span', { class: 'spacer' }), enabled, del),
          h('div', { class: 'grid-3', style: 'margin-top:var(--sp-3)' },
            h('div', { class: 'field' }, h('label', {}, '幅度'), amp),
            h('div', { class: 'field' }, h('label', {}, '影响半径(m)'), radius),
            h('div', { class: 'field' }, h('label', {}, '波纹频率(1/m)'), freq),
            h('div', { class: 'field' }, h('label', {}, '中心 X 归一化'), xN),
            h('div', { class: 'field' }, h('label', {}, '中心 Y 归一化'), yN)
          )
        )
      )
    })
  }
  renderDefects()

  const addDefect = (type: DefectType) => {
    const d: ManufactureDefect = {
      id: newId('def'),
      type,
      xNorm: 0.5,
      yNorm: 0.5,
      amplitude: type === 'forming_ripple' ? 0.0005 : 0.0008,
      radius: 0.15,
      frequency: 40,
      enabled: true
    }
    surface.defects.push(d)
    renderDefects()
  }

  const saveBtn = h('button', { class: 'btn primary' }, '保存曲面')
  saveBtn.addEventListener('click', async () => {
    surface.layer.outerGlass = num(tOuter, surface.layer.outerGlass)
    surface.layer.pvb = num(tPvb, surface.layer.pvb)
    surface.layer.innerGlass = num(tInner, surface.layer.innerGlass)
    surface.layer.nGlass = num(nGlass, surface.layer.nGlass)
    surface.layer.nPvb = num(nPvb, surface.layer.nPvb)
    await saveSurface(surface)
    saveBtn.textContent = '已保存'
    setTimeout(() => (saveBtn.textContent = '保存曲面'), 1200)
  })

  main.append(
    h('div', { class: 'grid-2' },
      listCard,
      h('div', { class: 'card' },
        h('h2', {}, '夹层结构（外片 / PVB / 内片）'),
        h('div', { class: 'grid-3' },
          h('div', { class: 'field' }, h('label', {}, '外片厚度(m)'), tOuter),
          h('div', { class: 'field' }, h('label', {}, 'PVB 厚度(m)'), tPvb),
          h('div', { class: 'field' }, h('label', {}, '内片厚度(m)'), tInner),
          h('div', { class: 'field' }, h('label', {}, '玻璃折射率'), nGlass),
          h('div', { class: 'field' }, h('label', {}, 'PVB 折射率'), nPvb)
        ),
        h('div', { class: 'field' }, h('label', {}, '中线矢高剖面预览（含缺陷）'), h('div', { class: 'canvas-wrap' }, preview)),
        h('div', { class: 'field' }, h('label', {}, '点云导入（x,y,z 每行一组，支持空格/逗号）'), fileInput, fitInfo),
        saveBtn
      )
    ),
    h('div', { class: 'card' },
      h('h2', {}, '制造缺陷'),
      h('div', { class: 'row', style: 'margin-bottom:var(--sp-4)' },
        ...DEFECT_META.map((m) => {
          const b = h('button', { class: 'btn sm' }, `添加${m.name}`)
          b.addEventListener('click', () => addDefect(m.type))
          return b
        })
      ),
      defectBox
    )
  )
}
