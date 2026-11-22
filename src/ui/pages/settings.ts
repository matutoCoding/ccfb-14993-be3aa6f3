// 设置页：默认限值、判定裕量、网格分辨率、WebGPU 状态与数据管理
import { getState, saveSettings } from '../../db/store'
import { detectWebGpu } from '../../render/gpu_detect'
import { idb } from '../../db/indexeddb'
import { h, pageHead, clearNode, num } from '../dom'

export const renderSettings = async (main: HTMLElement): Promise<void> => {
  clearNode(main)
  const state = getState()
  const s = state.settings
  main.append(pageHead('系统设置', '判定标准、仿真精度与渲染后端，数据持久化于浏览器 IndexedDB'))

  const limitA = h('input', { type: 'number', step: '0.01', value: String(s.defaultLimitA) })
  const limitB = h('input', { type: 'number', step: '0.01', value: String(s.defaultLimitB) })
  const band = h('input', { type: 'number', step: '0.01', value: String(s.marginalBand) })
  const grid = h('input', { type: 'number', step: '4', min: '21', max: '121', value: String(s.gridResolution) })
  const fallback = h('input', { type: 'checkbox' }) as HTMLInputElement
  fallback.checked = s.cpuFallback

  const gpuBox = h('div', { class: 'muted' }, '正在检测 WebGPU…')
  detectWebGpu().then((cap) => {
    gpuBox.innerHTML = ''
    if (cap.supported) {
      gpuBox.append(h('span', { class: 'badge pass' }, 'WebGPU 可用'), h('span', { style: 'margin-left:var(--sp-3)' }, `设备：${cap.adapter?.info?.description ?? 'GPU 适配器'}`))
    } else {
      gpuBox.append(
        h('span', { class: 'badge marginal' }, 'WebGPU 不可用'),
        h('span', { style: 'margin-left:var(--sp-3)' }, cap.reason ?? '已自动切换 CPU 光栅')
      )
    }
  })

  const save = h('button', { class: 'btn primary' }, '保存设置')
  save.addEventListener('click', async () => {
    await saveSettings({
      ...s,
      defaultLimitA: num(limitA, s.defaultLimitA),
      defaultLimitB: num(limitB, s.defaultLimitB),
      marginalBand: num(band, s.marginalBand),
      gridResolution: Math.min(121, Math.max(21, num(grid, s.gridResolution))),
      cpuFallback: fallback.checked
    })
    save.textContent = '已保存'
    setTimeout(() => (save.textContent = '保存设置'), 1200)
  })

  const resetData = h('button', { class: 'btn danger' }, '清空全部本地数据')
  resetData.addEventListener('click', async () => {
    if (!confirm('将清空车型、曲面、工位、批次等全部 IndexedDB 数据，且不可恢复。确认？')) return
    await Promise.all((['vehicles', 'surfaces', 'stations', 'batches', 'settings'] as const).map((st) => idb.clear(st)))
    location.reload()
  })

  main.append(
    h('div', { class: 'grid-2' },
      h('div', { class: 'card' },
        h('h2', {}, '判定标准'),
        h('div', { class: 'grid-2' },
          h('div', { class: 'field' }, h('label', {}, '默认 A 区限值（D）'), limitA),
          h('div', { class: 'field' }, h('label', {}, '默认 B 区限值（D）'), limitB),
          h('div', { class: 'field' }, h('label', {}, '临界判定裕量（D）'), band),
          h('div', { class: 'field' }, h('label', {}, '仿真网格分辨率（px/边）'), grid)
        ),
        h('div', { class: 'field' }, h('label', {}, 'WebGPU 不可用时启用 CPU 光栅兜底'), fallback),
        save
      ),
      h('div', { class: 'card' },
        h('h2', {}, '渲染后端'),
        gpuBox,
        h('div', { class: 'muted', style: 'margin-top:var(--sp-4)' }, '权威屈光度数值始终由 f64 CPU 光学引擎计算，WebGPU 仅承担条纹可视化，不参与合格判定。')
      )
    ),
    h('div', { class: 'card' },
      h('h2', {}, '数据管理'),
      h('p', { class: 'muted', style: 'margin-top:0' }, '所有车型档案、玻璃参数、检测批次均存储在本机浏览器 IndexedDB，不上传服务器。'),
      resetData
    )
  )
}
