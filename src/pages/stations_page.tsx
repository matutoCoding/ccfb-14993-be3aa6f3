import { useRef, useState, useEffect } from 'react'
import type { InspectionStation } from '@/types'
import { appStore, currentStation, currentVehicle } from '@/state/app_store'
import { db, STORE } from '@/db/indexeddb'
import { reloadAll } from '@/state/bootstrap'
import { PageHeader, Field, NumberInput } from '@/components/ui'
import { uid } from '@/physics/constants'
import { drawZebraBoard } from '@/render/canvas_render'

export function StationsPage() {
  const state = appStore.useStore((s) => s)
  const vehicle = currentVehicle(state)
  const station = currentStation(state)
  const [draft, setDraft] = useState<InspectionStation | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const editing = draft ?? station

  useEffect(() => {
    if (editing && canvasRef.current) {
      drawZebraBoard(canvasRef.current, editing.stripePeriod, editing.stripeAngleDeg)
    }
  }, [editing?.stripePeriod, editing?.stripeAngleDeg])

  if (!vehicle || !editing) {
    return <PageHeader title="检测工位" subtitle="请先选择车型" />
  }

  const update = (patch: Partial<InspectionStation>) => {
    setDraft({ ...editing, ...patch, updatedAt: Date.now() })
  }
  const save = async () => {
    if (!draft) return
    await db.put(STORE.stations, draft)
    setDraft(null)
    await reloadAll()
  }
  const create = async () => {
    const s: InspectionStation = {
      id: uid('station'),
      vehicleId: vehicle.id,
      name: `${vehicle.name}新工位`,
      boardDistance: 4000,
      stripePeriod: 32,
      stripeAngleDeg: 90,
      cameraWidth: 640,
      cameraHeight: 640,
      cameraFovDeg: 30,
      eyeOffset: { x: 0, y: 0, z: 0 },
      updatedAt: Date.now(),
    }
    await db.put(STORE.stations, s)
    await reloadAll()
    appStore.set({ selectedStationId: s.id })
  }

  const stations = state.stations.filter((s) => s.vehicleId === vehicle.id)

  return (
    <>
      <PageHeader
        title="检测工位"
        subtitle={`斑马板几何布置 · 车型：${vehicle.name}`}
        action={
          <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            <button className="btn" onClick={create}>新建工位</button>
            <button className="btn btn-primary" onClick={save} disabled={!draft}>保存修改</button>
          </div>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 'var(--sp-5)' }}>
        <div className="panel" style={{ padding: 'var(--sp-2)', alignSelf: 'start' }}>
          {stations.map((s) => (
            <button key={s.id}
              onClick={() => { appStore.set({ selectedStationId: s.id }); setDraft(null) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: 'var(--sp-3) var(--sp-4)',
                marginBottom: 'var(--sp-1)', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer',
                background: s.id === editing.id ? 'var(--primary-soft)' : 'transparent',
                color: s.id === editing.id ? 'var(--primary)' : 'var(--text-2)',
              }}>
              <div style={{ fontWeight: 'var(--fw-medium)' }}>{s.name}</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)', marginTop: 2 }}>
                板距 {s.boardDistance}mm · 条纹 {s.stripePeriod}mm
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 'var(--sp-5)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
            <div className="panel" style={{ padding: 'var(--sp-5)' }}>
              <div style={{ fontWeight: 'var(--fw-medium)', marginBottom: 'var(--sp-4)' }}>斑马板参数</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
                <Field label="工位名称">
                  <input className="input" value={editing.name}
                    onChange={(e) => update({ name: e.target.value })} />
                </Field>
                <Field label="板到玻璃距离">
                  <NumberInput value={editing.boardDistance} suffix="mm" step={100}
                    onChange={(v) => update({ boardDistance: v })} />
                </Field>
                <Field label="条纹周期宽度">
                  <NumberInput value={editing.stripePeriod} suffix="mm" step={1}
                    onChange={(v) => update({ stripePeriod: v })} />
                </Field>
                <Field label="条纹走向角">
                  <NumberInput value={editing.stripeAngleDeg} suffix="°" step={5}
                    onChange={(v) => update({ stripeAngleDeg: v })} />
                </Field>
              </div>
            </div>
            <div className="panel" style={{ padding: 'var(--sp-5)' }}>
              <div style={{ fontWeight: 'var(--fw-medium)', marginBottom: 'var(--sp-4)' }}>相机与眼点偏移</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-4)' }}>
                <Field label="眼点偏移 X"><NumberInput value={editing.eyeOffset.x} suffix="mm"
                  onChange={(v) => update({ eyeOffset: { ...editing.eyeOffset, x: v } })} /></Field>
                <Field label="眼点偏移 Y"><NumberInput value={editing.eyeOffset.y} suffix="mm"
                  onChange={(v) => update({ eyeOffset: { ...editing.eyeOffset, y: v } })} /></Field>
                <Field label="眼点偏移 Z"><NumberInput value={editing.eyeOffset.z} suffix="mm"
                  onChange={(v) => update({ eyeOffset: { ...editing.eyeOffset, z: v } })} /></Field>
                <Field label="相机视场角"><NumberInput value={editing.cameraFovDeg} suffix="°" step={1}
                  onChange={(v) => update({ cameraFovDeg: v })} /></Field>
                <Field label="图像宽度"><NumberInput value={editing.cameraWidth} step={16}
                  onChange={(v) => update({ cameraWidth: v })} /></Field>
                <Field label="图像高度"><NumberInput value={editing.cameraHeight} step={16}
                  onChange={(v) => update({ cameraHeight: v })} /></Field>
              </div>
            </div>
          </div>

          <div className="panel" style={{ padding: 'var(--sp-5)', alignSelf: 'start' }}>
            <div style={{ fontWeight: 'var(--fw-medium)', marginBottom: 'var(--sp-4)' }}>斑马板实时预览</div>
            <canvas ref={canvasRef} width={360} height={360}
              style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
            <div style={{ marginTop: 'var(--sp-4)', fontSize: 'var(--fs-xs)', color: 'var(--text-3)', lineHeight: 1.7 }}>
              条纹角度 {editing.stripeAngleDeg}° · 周期 {editing.stripePeriod}mm
              <br />
              四步相移反演使用同一块板，相位依次偏移 π/2
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
