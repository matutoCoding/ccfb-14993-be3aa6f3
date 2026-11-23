import { useEffect, useMemo, useRef, useState } from 'react'
import type { DiopterMap } from '@/types'
import { appStore, currentStation, currentSurface, currentVehicle } from '@/state/app_store'
import { PageHeader, EmptyState } from '@/components/ui'
import { buildGlassStack } from '@/physics/glass_stack'
import { drawDiopterHeatmap } from '@/render/canvas_render'
import { renderCameraImage, renderDriverView } from '@/render/scene_render'
import type { AnalysisResponse } from '@/workers/analysis_worker'
import { runSelfTests, type SelfTestCase } from '@/physics/selftest'

type Tab = 'heatmap' | 'inverse' | 'camera' | 'driver'

export function AnalysisPage() {
  const state = appStore.useStore((s) => s)
  const vehicle = currentVehicle(state)
  const surface = currentSurface(state)
  const station = currentStation(state)
  const settings = state.settings
  const [tab, setTab] = useState<Tab>('heatmap')
  const [directMap, setDirectMap] = useState<DiopterMap | null>(null)
  const [inverseMap, setInverseMap] = useState<DiopterMap | null>(null)
  const [busy, setBusy] = useState(false)
  const [duration, setDuration] = useState(0)
  const [selfTests, setSelfTests] = useState<SelfTestCase[] | null>(null)
  const [eyeShift, setEyeShift] = useState({ x: 0, y: 0 })

  const directCanvas = useRef<HTMLCanvasElement>(null)
  const inverseCanvas = useRef<HTMLCanvasElement>(null)
  const cameraCanvas = useRef<HTMLCanvasElement>(null)
  const driverCanvas = useRef<HTMLCanvasElement>(null)

  const ready = Boolean(vehicle && surface && station && settings)

  const runDirect = () => {
    if (!ready) return
    setBusy(true)
    const worker = new Worker(new URL('../workers/analysis_worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (ev: MessageEvent<AnalysisResponse>) => {
      setDirectMap(ev.data.map)
      setDuration(ev.data.durationMs)
      worker.terminate()
      setBusy(false)
    }
    worker.postMessage({
      kind: 'direct',
      surface, vehicle, station,
      nx: 101, ny: 101,
      limitA: settings!.limits.limitA,
      limitB: settings!.limits.limitB,
      derivativeStep: settings!.limits.derivativeStep,
    })
  }

  const runInverse = () => {
    if (!ready) return
    setBusy(true)
    const worker = new Worker(new URL('../workers/analysis_worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (ev: MessageEvent<AnalysisResponse>) => {
      setInverseMap(ev.data.map)
      setDuration(ev.data.durationMs)
      worker.terminate()
      setBusy(false)
    }
    worker.postMessage({
      kind: 'inverse',
      surface, vehicle, station,
      nx: settings!.limits.inverseNx,
      ny: settings!.limits.inverseNy,
      limitA: settings!.limits.limitA,
      limitB: settings!.limits.limitB,
      derivativeStep: settings!.limits.derivativeStep,
    })
  }

  useEffect(() => {
    if (directMap && directCanvas.current && vehicle && settings) {
      drawDiopterHeatmap(directCanvas.current, directMap, settings.limits.limitB, vehicle.zones)
    }
  }, [directMap, vehicle, settings])

  useEffect(() => {
    if (inverseMap && inverseCanvas.current && vehicle && settings) {
      drawDiopterHeatmap(inverseCanvas.current, inverseMap, settings.limits.limitB, vehicle.zones)
    }
  }, [inverseMap, vehicle, settings])

  const stack = useMemo(() => (surface ? buildGlassStack(surface) : null), [surface])

  const renderCamera = () => {
    if (!stack || !vehicle || !station || !cameraCanvas.current) return
    const img = renderCameraImage(stack, vehicle, station, 0, 200, 200)
    const ctx = cameraCanvas.current.getContext('2d')!
    ctx.putImageData(new ImageData(img, 200, 200), 0, 0)
  }
  const renderDriver = () => {
    if (!stack || !vehicle || !station || !driverCanvas.current) return
    const img = renderDriverView(stack, vehicle, station, {
      eyeShiftX: eyeShift.x, eyeShiftY: eyeShift.y, width: 240, height: 240,
    })
    const ctx = driverCanvas.current.getContext('2d')!
    ctx.putImageData(new ImageData(img, 240, 240), 0, 0)
  }

  useEffect(() => {
    if (tab === 'camera') renderCamera()
    if (tab === 'driver') renderDriver()
  }, [tab, stack, eyeShift])

  if (!ready) {
    return (
      <>
        <PageHeader title="畸变分析" />
        <div className="panel">
          <EmptyState title="分析数据不完整" subtitle="请先在档案、曲面、工位页面完成配置"
            icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 19V5m6 14V9m6 10v-6" /></svg>} />
        </div>
      </>
    )
  }

  const stats = (map: DiopterMap | null) => {
    if (!map) return null
    const inZone = map.samples.filter((s) => s.zone !== 'outside')
    const maxAbs = Math.max(0, ...inZone.map((s) => Math.max(Math.abs(s.dx), Math.abs(s.dy))))
    const rejected = inZone.filter((s) => !s.pass).length
    return { maxAbs, rejected, total: inZone.length }
  }

  return (
    <>
      <PageHeader
        title="畸变分析"
        subtitle={`${vehicle!.name} · ${surface!.name} · ${station!.name}`}
        action={
          <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            <button className="btn" onClick={() => setSelfTests(runSelfTests())}>精度自检</button>
            <button className="btn btn-primary" onClick={tab === 'inverse' ? runInverse : runDirect} disabled={busy}>
              {busy ? '计算中…' : tab === 'inverse' ? '运行条纹反演' : '运行直接计算'}
            </button>
          </div>
        }
      />

      <div style={{ display: 'flex', gap: 'var(--sp-2)', marginBottom: 'var(--sp-5)' }}>
        {([
          ['heatmap', '屈光度热力图（直接计算）'],
          ['inverse', '条纹反演对照'],
          ['camera', '相机条纹图'],
          ['driver', '主驾视角'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button key={key} className="btn"
            style={{
              background: tab === key ? 'var(--primary-soft)' : 'var(--bg-panel)',
              color: tab === key ? 'var(--primary)' : 'var(--text-2)',
              borderColor: tab === key ? 'var(--primary)' : 'var(--border-strong)',
            }}
            onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {selfTests && (
        <div className="panel" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-5)' }}>
          <div style={{ fontWeight: 'var(--fw-medium)', marginBottom: 'var(--sp-3)' }}>
            物理内核精度自检（阈值 0.01 D）
          </div>
          {selfTests.map((c) => (
            <div key={c.name} style={{
              display: 'flex', justifyContent: 'space-between', padding: 'var(--sp-2) 0',
              borderBottom: '1px solid var(--border)', fontSize: 'var(--fs-sm)',
            }}>
              <span>
                <span className={`tag ${c.pass ? 'tag-success' : 'tag-danger'}`} style={{ marginRight: 'var(--sp-3)' }}>
                  {c.pass ? 'PASS' : 'FAIL'}
                </span>
                {c.name}
              </span>
              <span style={{ color: 'var(--text-3)' }}>
                误差 {c.error.toExponential(2)} D
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'heatmap' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 'var(--sp-5)' }}>
          <div className="panel" style={{ padding: 'var(--sp-5)' }}>
            <canvas ref={directCanvas} width={560} height={420}
              style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
          </div>
          <MapStats map={directMap} duration={duration} stats={stats(directMap)}
            limitA={settings!.limits.limitA} limitB={settings!.limits.limitB} />
        </div>
      )}

      {tab === 'inverse' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-5)' }}>
          <div className="panel" style={{ padding: 'var(--sp-5)' }}>
            <div style={{ fontWeight: 'var(--fw-medium)', marginBottom: 'var(--sp-3)' }}>直接计算（板上映射法）</div>
            <canvas ref={directCanvas} width={480} height={380}
              style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
          </div>
          <div className="panel" style={{ padding: 'var(--sp-5)' }}>
            <div style={{ fontWeight: 'var(--fw-medium)', marginBottom: 'var(--sp-3)' }}>四步相移条纹反演</div>
            <canvas ref={inverseCanvas} width={480} height={380}
              style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
          </div>
        </div>
      )}

      {tab === 'camera' && (
        <div className="panel" style={{ padding: 'var(--sp-5)' }}>
          <div style={{ fontWeight: 'var(--fw-medium)', marginBottom: 'var(--sp-3)' }}>
            相机实拍仿真（四步相移第 0 帧）
          </div>
          <canvas ref={cameraCanvas} width={200} height={200}
            style={{ width: 400, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
          <div style={{ marginTop: 'var(--sp-3)', fontSize: 'var(--fs-sm)', color: 'var(--text-3)' }}>
            条纹弯曲由双层玻璃折射追迹产生，与反演使用同一光线模型
          </div>
        </div>
      )}

      {tab === 'driver' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 'var(--sp-5)' }}>
          <div className="panel" style={{ padding: 'var(--sp-5)' }}>
            <canvas ref={driverCanvas} width={240} height={240}
              style={{ width: 480, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
          </div>
          <div className="panel" style={{ padding: 'var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
            <div style={{ fontWeight: 'var(--fw-medium)' }}>眼点移动</div>
            <label className="field-label">横向偏移 X：{eyeShift.x.toFixed(1)} mm</label>
            <input type="range" min={-60} max={60} step={1} value={eyeShift.x}
              onChange={(e) => setEyeShift({ ...eyeShift, x: Number(e.target.value) })} />
            <label className="field-label">垂直偏移 Y：{eyeShift.y.toFixed(1)} mm</label>
            <input type="range" min={-40} max={40} step={1} value={eyeShift.y}
              onChange={(e) => setEyeShift({ ...eyeShift, y: Number(e.target.value) })} />
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-3)', lineHeight: 1.7 }}>
              拖动滑块观察车道线在玻璃畸变场中的跳动，模拟驾驶员头部移动时的视觉体验
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function MapStats({ map, duration, stats, limitA, limitB }: {
  map: DiopterMap | null
  duration: number
  stats: { maxAbs: number; rejected: number; total: number } | null
  limitA: number
  limitB: number
}) {
  return (
    <div className="panel" style={{ padding: 'var(--sp-5)', alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      <div style={{ fontWeight: 'var(--fw-medium)' }}>统计结果</div>
      {!map || !stats ? (
        <div style={{ color: 'var(--text-3)', fontSize: 'var(--fs-sm)' }}>点击右上角「运行直接计算」</div>
      ) : (
        <>
          <Stat label="区域内最大 |D|" value={`${stats.maxAbs.toFixed(4)} D`} />
          <Stat label="A 区限值" value={`±${limitA} D`} />
          <Stat label="B 区限值" value={`±${limitB} D`} />
          <Stat label="超标采样点" value={`${stats.rejected} / ${stats.total}`}
            danger={stats.rejected > 0} />
          <Stat label="计算耗时" value={`${duration.toFixed(0)} ms`} />
          <div className={stats.rejected > 0 ? 'tag tag-danger' : 'tag tag-success'}
            style={{ alignSelf: 'flex-start', padding: 'var(--sp-2) var(--sp-4)' }}>
            {stats.rejected > 0 ? '判定：不合格' : '判定：合格'}
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--fs-sm)' }}>
      <span style={{ color: 'var(--text-3)' }}>{label}</span>
      <span style={{ fontWeight: 'var(--fw-medium)', color: danger ? 'var(--danger)' : 'var(--text-1)' }}>{value}</span>
    </div>
  )
}
