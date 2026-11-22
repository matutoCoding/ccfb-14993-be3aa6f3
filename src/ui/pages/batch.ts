// 批次记录页：每块玻璃的缺陷参数与判定，按缺陷类型统计超标率
import { getState, saveBatch, removeBatch, newId } from '../../db/store'
import { BatchRecord, GlassRecord, DefectType } from '../../models/types'
import { buildGlassField } from '../../optics/surface_builder'
import { analyzeGlass } from '../../services/analysis'
import { GridSpec } from '../../optics/diopter_support'
import { h, pageHead, empty, clearNode, fmt, verdictLabel } from '../dom'

const DEFECT_NAMES: Record<DefectType, string> = {
  thickness_uneven: '局部厚度不均',
  forming_ripple: '弯曲成型波纹',
  edge_stress: '边部应力凸起'
}

const runInspection = (batch: BatchRecord, serialNo: string): GlassRecord | null => {
  const state = getState()
  const vehicle = state.vehicles.find((v) => v.id === batch.vehicleId)
  const surface = state.surfaces.find((s) => s.vehicleId === batch.vehicleId)
  const station = state.stations.find((s) => s.id === batch.stationId)
  if (!vehicle || !surface || !station) return null

  const res = state.settings.gridResolution
  const grid: GridSpec = {
    xMin: -vehicle.width / 2, xMax: vehicle.width / 2,
    yMin: -vehicle.height / 2, yMax: vehicle.height / 2,
    nx: res, ny: Math.round((res * vehicle.height) / vehicle.width)
  }
  const field = buildGlassField(surface, vehicle.width, vehicle.height)
  const effective = { ...station, installTiltDeg: vehicle.installTiltDeg, eye: vehicle.eyePoint }
  const analysis = analyzeGlass(field, surface.layer, effective, vehicle, state.settings, grid)

  return {
    id: newId('rec'),
    batchId: batch.id,
    serialNo,
    vehicleId: vehicle.id,
    surfaceId: surface.id,
    defects: JSON.parse(JSON.stringify(surface.defects)),
    verdict: analysis.verdict,
    zoneResults: analysis.zones.map((z) => ({
      zoneId: z.zoneId, zoneName: z.zoneName,
      maxDiopter: z.maxDiopter, limit: z.limit, exceed: z.exceed
    })),
    maxDiopter: analysis.maxDiopter,
    measuredAt: Date.now()
  }
}

export const renderBatch = (main: HTMLElement): void => {
  clearNode(main)
  const state = getState()
  main.append(pageHead('批次记录', '记录每块玻璃的缺陷参数与判定结果，按缺陷类型统计超标率'))

  const vehicle = state.vehicles.find((v) => v.id === state.currentVehicleId) ?? state.vehicles[0]
  const station = state.stations.find((s) => s.id === state.currentStationId) ?? state.stations[0]
  if (!vehicle || !station) {
    main.append(empty('基础数据缺失', '请先配置车型与检测工位'))
    return
  }

  const listCard = h('div', { class: 'card' }, h('h2', {}, '检测批次'))
  const detail = h('div')

  const openBatch = (batch: BatchRecord) => {
    detail.innerHTML = ''
    // 超标率统计：按缺陷类型
    const stats = (Object.keys(DEFECT_NAMES) as DefectType[]).map((type) => {
      const withDefect = batch.records.filter((r) => r.defects.some((d) => d.type === type))
      const fail = withDefect.filter((r) => r.verdict === 'fail')
      const rate = withDefect.length ? (fail.length / withDefect.length) * 100 : 0
      return { type, total: withDefect.length, fail: fail.length, rate }
    })

    const rows = batch.records.map((r) =>
      h('tr', {},
        h('td', {}, r.serialNo),
        h('td', {}, r.defects.map((d) => DEFECT_NAMES[d.type]).join('、') || '无缺陷'),
        h('td', {}, fmt(r.maxDiopter, 4)),
        h('td', {}, h('span', { class: `badge ${r.verdict}` }, verdictLabel[r.verdict])),
        h('td', {}, new Date(r.measuredAt).toLocaleTimeString('zh-CN', { hour12: false }))
      )
    )

    const inspectOne = h('button', { class: 'btn primary sm' }, '检测一块')
    inspectOne.addEventListener('click', async () => {
      const rec = runInspection(batch, `WS-${String(batch.records.length + 1).padStart(4, '0')}`)
      if (rec) {
        batch.records.push(rec)
        await saveBatch(batch)
      }
    })
    const inspectTen = h('button', { class: 'btn sm' }, '连续检测 10 块')
    inspectTen.addEventListener('click', async () => {
      for (let i = 0; i < 10; i++) {
        const rec = runInspection(batch, `WS-${String(batch.records.length + 1).padStart(4, '0')}`)
        if (rec) batch.records.push(rec)
      }
      await saveBatch(batch)
    })
    const del = h('button', { class: 'btn danger sm' }, '删除批次')
    del.addEventListener('click', async () => {
      if (confirm('确认删除该批次及全部记录？')) await removeBatch(batch.id)
    })

    detail.append(
      h('div', { class: 'card' },
        h('h2', {}, batch.name),
        h('div', { class: 'grid-3' },
          ...stats.map((s) =>
            h('div', { class: 'card', style: 'box-shadow:none' },
              h('div', { class: 'muted' }, DEFECT_NAMES[s.type]),
              h('div', { class: 'metric' }, `${s.rate.toFixed(1)} `, h('small', {}, '%')),
              h('div', { class: 'muted' }, `${s.fail}/${s.total} 块超标`)
            )
          )
        ),
        h('div', { class: 'row', style: 'margin:var(--sp-4) 0' }, inspectOne, inspectTen, h('span', { class: 'spacer' }), del)
      ),
      h('div', { class: 'card' },
        h('h2', {}, `玻璃明细（${batch.records.length} 块）`),
        batch.records.length === 0
          ? empty('暂无检测记录', '点击「检测一块」开始')
          : h('table', {},
              h('thead', {}, h('tr', {}, h('th', {}, '编号'), h('th', {}, '缺陷类型'), h('th', {}, '最大屈光度(D)'), h('th', {}, '判定'), h('th', {}, '时间'))),
              h('tbody', {}, ...rows)
            )
      )
    )
  }

  const renderList = () => {
    const items = listCard.querySelectorAll('.nav-item')
    items.forEach((n) => n.remove())
    if (state.batches.length === 0) {
      listCard.append(h('div', { class: 'muted' }, '暂无批次'))
      return
    }
    state.batches.forEach((b) => {
      const btn = h('button', { class: 'nav-item', style: 'margin-bottom:var(--sp-2)' }, `${b.name}（${b.records.length}）`)
      btn.addEventListener('click', () => openBatch(b))
      listCard.append(btn)
    })
  }

  const newBatch = h('button', { class: 'btn primary' }, '新建批次')
  newBatch.addEventListener('click', async () => {
    const batch: BatchRecord = {
      id: newId('batch'),
      name: `批次 ${state.batches.length + 1}`,
      vehicleId: vehicle.id,
      stationId: station.id,
      createdAt: Date.now(),
      records: []
    }
    await saveBatch(batch)
    openBatch(batch)
  })

  main.append(h('div', { class: 'row', style: 'margin-bottom:var(--sp-5)' }, h('span', { class: 'spacer' }), newBatch))
  main.append(h('div', { class: 'grid-2' }, listCard, detail))
  renderList()
  if (state.batches[0]) openBatch(state.batches[state.batches.length - 1])
}
