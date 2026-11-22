// 应用外壳与 hash 路由
import { subscribe, getState, initStore } from '../db/store'
import { icons, IconName } from './icons'
import { renderVehicles } from './pages/vehicles'
import { renderSurface } from './pages/surface'
import { renderStation } from './pages/station'
import { renderAnalysis } from './pages/analysis'
import { renderBatch } from './pages/batch'
import { renderSettings } from './pages/settings'

type Route = 'vehicles' | 'surface' | 'station' | 'analysis' | 'batch' | 'settings'

const NAV: { route: Route; label: string; icon: IconName }[] = [
  { route: 'vehicles', label: '车型档案', icon: 'vehicle' },
  { route: 'surface', label: '玻璃曲面', icon: 'surface' },
  { route: 'station', label: '检测工位', icon: 'station' },
  { route: 'analysis', label: '畸变分析', icon: 'analysis' },
  { route: 'batch', label: '批次记录', icon: 'batch' },
  { route: 'settings', label: '设置', icon: 'settings' }
]

const currentRoute = (): Route => {
  const r = location.hash.replace('#/', '') as Route
  return NAV.some((n) => n.route === r) ? r : 'vehicles'
}

const renderPage = (route: Route): void => {
  const main = document.querySelector<HTMLElement>('.main')
  if (!main) return
  const state = getState()
  if (!state.ready) return
  switch (route) {
    case 'vehicles': renderVehicles(main); break
    case 'surface': renderSurface(main); break
    case 'station': renderStation(main); break
    case 'analysis': renderAnalysis(main); break
    case 'batch': renderBatch(main); break
    case 'settings': renderSettings(main); break
  }
}

const renderShell = (): void => {
  const app = document.getElementById('app')
  if (!app) return
  const route = currentRoute()
  app.innerHTML = `
    <nav class="sidebar">
      <div class="brand">风挡光学检测台</div>
      ${NAV.map(
        (n) =>
          `<button class="nav-item ${n.route === route ? 'active' : ''}" data-route="${n.route}">
            ${icons[n.icon]}<span class="label">${n.label}</span>
          </button>`
      ).join('')}
    </nav>
    <main class="main"></main>
  `
  app.querySelectorAll<HTMLElement>('.nav-item').forEach((el) => {
    el.addEventListener('click', () => {
      location.hash = `#/${el.dataset.route}`
    })
  })
  renderPage(route)
}

export const boot = async (): Promise<void> => {
  await initStore()
  renderShell()
  window.addEventListener('hashchange', renderShell)
  subscribe(renderShell)
}
