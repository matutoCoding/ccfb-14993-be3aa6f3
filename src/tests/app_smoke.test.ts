// @vitest-environment jsdom
// 应用冒烟测试：真实 IndexedDB 落库 + 六个页面渲染，捕获类型检查发现不了的运行时错误
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeAll } from 'vitest'
import { initStore, getState } from '../db/store'

// jsdom 无 canvas 实现，注入无操作 2d 上下文桩
const noop = () => {}
const ctx2dStub = (): CanvasRenderingContext2D =>
  new Proxy(
    {
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData: noop,
      setLineDash: noop
    },
    {
      get(target, prop) {
        if (typeof prop === 'string' && prop in target) return (target as Record<string, unknown>)[prop]
        return typeof prop === 'string' ? noop : undefined
      },
      set() {
        return true
      }
    }
  ) as unknown as CanvasRenderingContext2D

beforeAll(() => {
  const stub = (() => ctx2dStub()) as unknown
  HTMLCanvasElement.prototype.getContext = stub as typeof HTMLCanvasElement.prototype.getContext
})

describe('应用启动与页面渲染', () => {
  it('种子数据写入 IndexedDB：三个车型、工位、设置、曲面', async () => {
    await initStore()
    const s = getState()
    expect(s.ready).toBe(true)
    expect(s.vehicles.length).toBe(3)
    expect(s.stations.length).toBeGreaterThanOrEqual(1)
    expect(s.surfaces.length).toBe(3)
    const cats = s.vehicles.map((v) => v.category)
    expect(cats).toContain('sedan')
    expect(cats).toContain('suv')
    expect(cats).toContain('hud')
    const hud = s.vehicles.find((v) => v.category === 'hud')!
    expect(hud.zones.some((z) => z.name.includes('HUD'))).toBe(true)
  })

  it('六个页面均能无异常渲染并产出内容', async () => {
    const { renderVehicles } = await import('../ui/pages/vehicles')
    const { renderSurface } = await import('../ui/pages/surface')
    const { renderStation } = await import('../ui/pages/station')
    const { renderAnalysis } = await import('../ui/pages/analysis')
    const { renderBatch } = await import('../ui/pages/batch')
    const { renderSettings } = await import('../ui/pages/settings')

    const mount = () => {
      const main = document.createElement('main')
      document.body.append(main)
      return main
    }

    renderVehicles(mount())
    renderSurface(mount())
    renderStation(mount())
    renderAnalysis(mount())
    renderBatch(mount())
    await renderSettings(mount())

    const heads = document.querySelectorAll('.page-head h1')
    expect(heads.length).toBe(6)
    // 分析页应渲染出画布与判定徽章
    expect(document.querySelectorAll('canvas').length).toBeGreaterThanOrEqual(3)
    expect(document.querySelectorAll('.badge').length).toBeGreaterThan(0)
  })
})
