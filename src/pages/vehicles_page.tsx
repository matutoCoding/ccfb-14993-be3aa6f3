import { useMemo, useRef, useState } from 'react'
import type { VehicleProfile, ZonePolygon } from '@/types'
import { appStore } from '@/state/app_store'
import { db, STORE } from '@/db/indexeddb'
import { reloadAll } from '@/state/bootstrap'
import { PageHeader, Field, NumberInput, EmptyState } from '@/components/ui'
import { uid } from '@/physics/constants'

const CATEGORY_LABEL: Record<VehicleProfile['category'], string> = {
  sedan: '轿车',
  suv: 'SUV',
  hud: 'HUD 车型',
}

export function VehiclesPage() {
  const vehicles = appStore.useStore((s) => s.vehicles)
  const selectedId = appStore.useStore((s) => s.selectedVehicleId)
  const selected = vehicles.find((v) => v.id === selectedId) ?? vehicles[0]
  const [draft, setDraft] = useState<VehicleProfile | null>(null)
  const vehicle = draft ?? selected

  const canvasRef = useRef<HTMLCanvasElement>(null)

  const zoneCanvas = useMemo(() => {
    if (!vehicle || !canvasRef.current) return null
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)
    // 玻璃轮廓
    ctx.fillStyle = 'var(--bg-subtle)'
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'var(--border-strong)'
    ctx.lineWidth = 2
    ctx.strokeRect(8, 8, W - 16, H - 16)

    const toPx = (p: { x: number; y: number }) => ({
      x: ((p.x + 700) / 1400) * W,
      y: H - ((p.y + 500) / 1000) * H,
    })

    vehicle.zones.forEach((zone) => {
      ctx.beginPath()
      zone.points.forEach((p, i) => {
        const px = ((p.x + 700) / 1400) * W
        const py = H - ((p.y + 500) / 1000) * H
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.closePath()
      ctx.fillStyle = zone.zone === 'A' ? 'rgba(29,78,216,0.14)' : 'rgba(124,58,237,0.12)'
      ctx.fill()
      ctx.strokeStyle = zone.zone === 'A' ? '#1d4ed8' : '#7c3aed'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.stroke()
      ctx.setLineDash([])
      const label = zone.points[0]
      if (label) {
        const lp = toPx(label)
        ctx.fillStyle = zone.zone === 'A' ? '#1d4ed8' : '#7c3aed'
        ctx.font = '600 13px sans-serif'
        ctx.fillText(`${zone.zone} 区`, lp.x + 4, lp.y + 16)
      }
    })
    return null
  }, [vehicle])

  if (!vehicle) {
    return (
      <>
        <PageHeader title="车型档案" subtitle="管理装车倾角、眼点与 A/B 检测区" />
        <div className="panel">
          <EmptyState title="还没有车型" subtitle="点击右上角新建第一个车型档案"
            icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 6h16M4 12h16M4 18h10" /></svg>} />
        </div>
      </>
    )
  }

  const update = (patch: Partial<VehicleProfile>) => {
    setDraft({ ...vehicle, ...patch, updatedAt: Date.now() })
  }
  const updateZone = (zone: 'A' | 'B', patch: Partial<ZonePolygon>) => {
    const zones = vehicle.zones.map((z) =>
      z.zone === zone ? { ...z, ...patch } : z,
    )
    update({ zones })
  }

  const save = async () => {
    await db.put(STORE.vehicles, draft ?? selected)
    setDraft(null)
    await reloadAll()
  }

  const create = async () => {
    const v: VehicleProfile = {
      id: uid('veh'),
      name: '新车型',
      code: `NEW-${vehicles.length + 1}`,
      category: 'sedan',
      description: '',
      rakeDeg: 30,
      eyePoint: { x: 0, y: -80, z: 500 },
      mountOrigin: { x: 0, y: 0, z: 0 },
      zones: [
        { zone: 'A', points: rectPoints(0, -40, 480, 320) },
        { zone: 'B', points: rectPoints(0, -40, 820, 560) },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    await db.put(STORE.vehicles, v)
    await reloadAll()
    appStore.set({ selectedVehicleId: v.id })
  }

  const remove = async () => {
    await db.delete(STORE.vehicles, vehicle.id)
    setDraft(null)
    await reloadAll()
  }

  const zoneA = vehicle.zones.find((z) => z.zone === 'A')
  const zoneB = vehicle.zones.find((z) => z.zone === 'B')

  return (
    <>
      <PageHeader
        title="车型档案"
        subtitle="装车倾角、驾驶员眼点、A/B 检测区划分"
        action={
          <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            <button className="btn" onClick={create}>新建车型</button>
            <button className="btn btn-danger" onClick={remove}>删除</button>
            <button className="btn btn-primary" onClick={save} disabled={!draft}>保存修改</button>
          </div>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 'var(--sp-5)' }}>
        <div className="panel" style={{ padding: 'var(--sp-2)' }}>
          {vehicles.map((v) => (
            <button
              key={v.id}
              onClick={() => { appStore.set({ selectedVehicleId: v.id }); setDraft(null) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: 'var(--sp-3) var(--sp-4)', marginBottom: 'var(--sp-1)',
                border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer',
                background: v.id === vehicle.id ? 'var(--primary-soft)' : 'transparent',
                color: v.id === vehicle.id ? 'var(--primary)' : 'var(--text-2)',
              }}
            >
              <div style={{ fontWeight: 'var(--fw-medium)' }}>{v.name}</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)', marginTop: 2 }}>
                {v.code} · {CATEGORY_LABEL[v.category]}
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
          <div className="panel" style={{ padding: 'var(--sp-5)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-4)' }}>
              <Field label="车型名称">
                <input className="input" value={vehicle.name} onChange={(e) => update({ name: e.target.value })} />
              </Field>
              <Field label="车型代码">
                <input className="input" value={vehicle.code} onChange={(e) => update({ code: e.target.value })} />
              </Field>
              <Field label="车型类别">
                <select className="select" value={vehicle.category}
                  onChange={(e) => update({ category: e.target.value as VehicleProfile['category'] })}>
                  <option value="sedan">轿车</option>
                  <option value="suv">SUV</option>
                  <option value="hud">HUD 车型</option>
                </select>
              </Field>
              <Field label="装车倾角（后倾）">
                <NumberInput value={vehicle.rakeDeg} suffix="°" step={0.5}
                  onChange={(v) => update({ rakeDeg: v })} />
              </Field>
              <Field label="眼点 X（横向）">
                <NumberInput value={vehicle.eyePoint.x} suffix="mm"
                  onChange={(v) => update({ eyePoint: { ...vehicle.eyePoint, x: v } })} />
              </Field>
              <Field label="眼点 Y（垂直）">
                <NumberInput value={vehicle.eyePoint.y} suffix="mm"
                  onChange={(v) => update({ eyePoint: { ...vehicle.eyePoint, y: v } })} />
              </Field>
              <Field label="眼点 Z（到玻璃距离）">
                <NumberInput value={vehicle.eyePoint.z} suffix="mm"
                  onChange={(v) => update({ eyePoint: { ...vehicle.eyePoint, z: v } })} />
              </Field>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 'var(--sp-5)' }}>
            <div className="panel" style={{ padding: 'var(--sp-5)' }}>
              <div style={{ fontWeight: 'var(--fw-medium)', marginBottom: 'var(--sp-4)' }}>
                A / B 检测区（玻璃平面，单位 mm）
              </div>
              <canvas ref={canvasRef} width={640} height={460}
                style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
              {zoneCanvas}
            </div>
            <div className="panel" style={{ padding: 'var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              {zoneA && (
                <ZoneEditor label="A 区（主视区，限值更严）" zone={zoneA}
                  onChange={(p) => updateZone('A', { points: p })} />
              )}
              {zoneB && (
                <ZoneEditor label="B 区（周边区）" zone={zoneB}
                  onChange={(p) => updateZone('B', { points: p })} />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function rectPoints(cx: number, cy: number, w: number, h: number) {
  return [
    { x: cx - w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy + h / 2 },
    { x: cx - w / 2, y: cy + h / 2 },
  ]
}

function ZoneEditor({ label, zone, onChange }: {
  label: string
  zone: ZonePolygon
  onChange: (points: { x: number; y: number }[]) => void
}) {
  const xs = zone.points.map((p) => p.x)
  const ys = zone.points.map((p) => p.y)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  const w = Math.max(...xs) - Math.min(...xs)
  const h = Math.max(...ys) - Math.min(...ys)
  return (
    <div>
      <div className="field-label">{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
        <Field label="中心 X"><NumberInput value={cx} suffix="mm"
          onChange={(v) => onChange(rectPoints(v, cy, w, h))} /></Field>
        <Field label="中心 Y"><NumberInput value={cy} suffix="mm"
          onChange={(v) => onChange(rectPoints(cx, v, w, h))} /></Field>
        <Field label="宽度"><NumberInput value={w} suffix="mm"
          onChange={(v) => onChange(rectPoints(cx, cy, v, h))} /></Field>
        <Field label="高度"><NumberInput value={h} suffix="mm"
          onChange={(v) => onChange(rectPoints(cx, cy, w, v))} /></Field>
      </div>
    </div>
  )
}
