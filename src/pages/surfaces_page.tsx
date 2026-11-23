import { useMemo, useRef, useState } from 'react'
import type { Defect, GlassSurface, LoftCurve, PointCloudSample } from '@/types'
import { appStore, currentSurface, currentVehicle } from '@/state/app_store'
import { db, STORE } from '@/db/indexeddb'
import { reloadAll } from '@/state/bootstrap'
import { PageHeader, Field, NumberInput, EmptyState } from '@/components/ui'
import { DEFECT_LABEL, uid } from '@/physics/constants'
import { buildGlassStack } from '@/physics/glass_stack'
import { drawSurfacePreview } from '@/render/canvas_render'

export function SurfacesPage() {
  const state = appStore.useStore((s) => s)
  const vehicle = currentVehicle(state)
  const surface = currentSurface(state)
  const [draft, setDraft] = useState<GlassSurface | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  const defectRef = useRef<HTMLCanvasElement>(null)

  const editing = draft ?? surface

  const preview = useMemo(() => {
    if (!editing) return null
    try {
      const stack = buildGlassStack(editing)
      return { base: stack.base.z, defect: stack.defectField.z }
    } catch {
      return null
    }
  }, [editing])

  if (!vehicle || !editing) {
    return (
      <>
        <PageHeader title="玻璃曲面" subtitle="loft 控制曲线 / 点云拟合 / 夹层厚度与制造缺陷" />
        <div className="panel">
          <EmptyState title="暂无玻璃曲面" subtitle="请先在车型档案选择车型，再新建曲面"
            icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 17c4-8 14-8 18 0" /></svg>} />
        </div>
      </>
    )
  }

  const update = (patch: Partial<GlassSurface>) => {
    setDraft({ ...editing, ...patch, updatedAt: Date.now() })
  }

  const renderPreview = () => {
    if (!preview || !previewRef.current) return
    drawSurfacePreview(previewRef.current, preview.base, editing.gridNx, editing.gridNy, editing.width, editing.height)
    if (defectRef.current) {
      drawSurfacePreview(defectRef.current, preview.defect, editing.gridNx, editing.gridNy, editing.width, editing.height)
    }
  }
  requestAnimationFrame(renderPreview)

  const save = async () => {
    if (!draft) return
    await db.put(STORE.surfaces, draft)
    setDraft(null)
    await reloadAll()
  }

  const createSurface = async () => {
    const s: GlassSurface = {
      id: uid('surf'),
      vehicleId: vehicle.id,
      name: `${vehicle.name}前挡玻璃`,
      width: 1300,
      height: 900,
      outerThickness: 2.1,
      pvbThickness: 0.76,
      innerThickness: 2.1,
      nGlass: 1.52,
      nPvb: 1.49,
      gridNx: 221,
      gridNy: 221,
      loftCurves: [
        { id: uid('loft'), y: -350, points: [{ x: -650, z: 4 }, { x: 0, z: 0 }, { x: 650, z: 4 }] },
        { id: uid('loft'), y: 0, points: [{ x: -650, z: 8 }, { x: 0, z: 0 }, { x: 650, z: 8 }] },
        { id: uid('loft'), y: 350, points: [{ x: -650, z: 12 }, { x: 0, z: 0 }, { x: 650, z: 12 }] },
      ],
      defects: [],
      updatedAt: Date.now(),
    }
    await db.put(STORE.surfaces, s)
    await reloadAll()
    appStore.set({ selectedSurfaceId: s.id })
  }

  const importCloud = async (file: File) => {
    const text = await file.text()
    const cloud: PointCloudSample[] = []
    for (const line of text.split(/\r?\n/)) {
      const parts = line.trim().split(/[,\s]+/).map(Number)
      if (parts.length >= 3 && parts.every(Number.isFinite)) {
        cloud.push({ x: parts[0], y: parts[1], z: parts[2] })
      }
    }
    if (cloud.length >= 12) update({ pointCloud: cloud })
    else alert('点云至少需要 12 个有效采样点（每行 x,y,z，逗号或空格分隔）')
  }

  const updateCurve = (id: string, patch: Partial<LoftCurve>) => {
    update({ loftCurves: editing.loftCurves.map((c) => (c.id === id ? { ...c, ...patch } : c)) })
  }
  const addCurve = () => {
    const y = editing.loftCurves.length ? Math.max(...editing.loftCurves.map((c) => c.y)) + 150 : 0
    update({
      loftCurves: [...editing.loftCurves, {
        id: uid('loft'), y,
        points: [{ x: -editing.width / 2, z: 6 }, { x: 0, z: 0 }, { x: editing.width / 2, z: 6 }],
      }],
    })
  }
  const removeCurve = (id: string) => {
    update({ loftCurves: editing.loftCurves.filter((c) => c.id !== id) })
  }

  const addDefect = (type: Defect['type']) => {
    const d: Defect = {
      id: uid('defect'), type, name: DEFECT_LABEL[type],
      cx: 0, cy: 0, amplitude: type === 'ripple' ? 0.03 : 0.08,
      sigma: type === 'edge_bulge' ? 35 : 60,
      wavelength: type === 'ripple' ? 24 : 0,
      angleDeg: 0, enabled: true,
    }
    update({ defects: [...editing.defects, d] })
  }
  const updateDefect = (id: string, patch: Partial<Defect>) => {
    update({ defects: editing.defects.map((d) => (d.id === id ? { ...d, ...patch } : d)) })
  }
  const removeDefect = (id: string) => update({ defects: editing.defects.filter((d) => d.id !== id) })

  const surfacesForVehicle = state.surfaces.filter((s) => s.vehicleId === vehicle.id)

  return (
    <>
      <PageHeader
        title="玻璃曲面"
        subtitle={`当前车型：${vehicle.name} · loft 曲线 / 点云拟合 / 夹层与缺陷`}
        action={
          <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            <button className="btn" onClick={createSurface}>新建曲面</button>
            <button className="btn btn-primary" onClick={save} disabled={!draft}>保存修改</button>
          </div>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 'var(--sp-5)' }}>
        <div className="panel" style={{ padding: 'var(--sp-2)', alignSelf: 'start' }}>
          {surfacesForVehicle.map((s) => (
            <button key={s.id}
              onClick={() => { appStore.set({ selectedSurfaceId: s.id }); setDraft(null) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: 'var(--sp-3) var(--sp-4)',
                marginBottom: 'var(--sp-1)', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer',
                background: s.id === editing.id ? 'var(--primary-soft)' : 'transparent',
                color: s.id === editing.id ? 'var(--primary)' : 'var(--text-2)',
              }}>
              <div style={{ fontWeight: 'var(--fw-medium)' }}>{s.name}</div>
              <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)', marginTop: 2 }}>
                {s.width}×{s.height} mm · {s.defects.length} 个缺陷
              </div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
          <div className="panel" style={{ padding: 'var(--sp-5)' }}>
            <div style={{ fontWeight: 'var(--fw-medium)', marginBottom: 'var(--sp-4)' }}>叠层结构与折射率</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-4)' }}>
              <Field label="外玻璃厚度"><NumberInput value={editing.outerThickness} suffix="mm" step={0.1}
                onChange={(v) => update({ outerThickness: v })} /></Field>
              <Field label="PVB 夹层厚度"><NumberInput value={editing.pvbThickness} suffix="mm" step={0.01}
                onChange={(v) => update({ pvbThickness: v })} /></Field>
              <Field label="内玻璃厚度"><NumberInput value={editing.innerThickness} suffix="mm" step={0.1}
                onChange={(v) => update({ innerThickness: v })} /></Field>
              <Field label="玻璃折射率 n"><NumberInput value={editing.nGlass} step={0.005}
                onChange={(v) => update({ nGlass: v })} /></Field>
              <Field label="PVB 折射率"><NumberInput value={editing.nPvb} step={0.005}
                onChange={(v) => update({ nPvb: v })} /></Field>
              <Field label="玻璃宽度"><NumberInput value={editing.width} suffix="mm"
                onChange={(v) => update({ width: v })} /></Field>
              <Field label="玻璃高度"><NumberInput value={editing.height} suffix="mm"
                onChange={(v) => update({ height: v })} /></Field>
              <Field label="网格分辨率"><NumberInput value={editing.gridNx} step={20}
                onChange={(v) => update({ gridNx: v, gridNy: v })} /></Field>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-5)' }}>
            <div className="panel" style={{ padding: 'var(--sp-5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
                <span style={{ fontWeight: 'var(--fw-medium)' }}>基准曲面预览</span>
                <span className="tag">{editing.pointCloud ? `点云拟合 ${editing.pointCloud.length} 点` : 'loft 曲线'}</span>
              </div>
              <canvas ref={previewRef} width={420} height={300}
                style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
            </div>
            <div className="panel" style={{ padding: 'var(--sp-5)' }}>
              <div style={{ fontWeight: 'var(--fw-medium)', marginBottom: 'var(--sp-4)' }}>缺陷扰动场预览</div>
              <canvas ref={defectRef} width={420} height={300}
                style={{ width: '100%', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }} />
            </div>
          </div>

          <div className="panel" style={{ padding: 'var(--sp-5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
              <span style={{ fontWeight: 'var(--fw-medium)' }}>loft 控制曲线（{editing.loftCurves.length} 条）</span>
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <button className="btn" onClick={addCurve}>添加曲线</button>
                <button className="btn" onClick={() => fileRef.current?.click()}>导入点云</button>
                <input ref={fileRef} type="file" accept=".csv,.txt" hidden
                  onChange={(e) => e.target.files?.[0] && importCloud(e.target.files[0])} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              {editing.loftCurves.map((curve) => (
                <div key={curve.id} style={{
                  display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 'var(--sp-3)',
                  alignItems: 'end', padding: 'var(--sp-3)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', background: 'var(--bg-subtle)',
                }}>
                  <Field label="高度 Y (mm)">
                    <NumberInput value={curve.y} onChange={(v) => updateCurve(curve.id, { y: v })} />
                  </Field>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>
                    {curve.points.length} 个控制点：
                    {curve.points.map((p) => `(${p.x}, ${p.z.toFixed(1)})`).join('  ')}
                  </div>
                  <button className="btn btn-danger" onClick={() => removeCurve(curve.id)}>删除</button>
                </div>
              ))}
              {editing.pointCloud && (
                <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--warn)' }}>
                  已导入点云，基准曲面将优先使用 MLS 拟合；清除点云后恢复 loft 模式
                  <button className="btn" style={{ marginLeft: 'var(--sp-3)' }}
                    onClick={() => update({ pointCloud: undefined })}>清除点云</button>
                </div>
              )}
            </div>
          </div>

          <div className="panel" style={{ padding: 'var(--sp-5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
              <span style={{ fontWeight: 'var(--fw-medium)' }}>制造缺陷（{editing.defects.length}）</span>
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <button className="btn" onClick={() => addDefect('thickness')}>局部厚度不均</button>
                <button className="btn" onClick={() => addDefect('ripple')}>成型波纹</button>
                <button className="btn" onClick={() => addDefect('edge_bulge')}>边部应力凸起</button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
              {editing.defects.map((d) => (
                <DefectEditor key={d.id} defect={d}
                  onChange={(patch) => updateDefect(d.id, patch)} onRemove={() => removeDefect(d.id)} />
              ))}
              {editing.defects.length === 0 && (
                <div style={{ color: 'var(--text-3)', fontSize: 'var(--fs-sm)' }}>暂无缺陷，点击上方按钮添加</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function DefectEditor({ defect, onChange, onRemove }: {
  defect: Defect
  onChange: (patch: Partial<Defect>) => void
  onRemove: () => void
}) {
  return (
    <div style={{
      padding: 'var(--sp-4)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      display: 'grid', gridTemplateColumns: 'repeat(6, 1fr) auto', gap: 'var(--sp-3)', alignItems: 'end',
      background: defect.enabled ? 'var(--bg-subtle)' : 'transparent', opacity: defect.enabled ? 1 : 0.55,
    }}>
      <div style={{ gridColumn: 'span 2' }}>
        <Field label="缺陷名称">
          <input className="input" value={defect.name} onChange={(e) => onChange({ name: e.target.value })} />
        </Field>
      </div>
      <Field label="中心 X"><NumberInput value={defect.cx} suffix="mm"
        onChange={(v) => onChange({ cx: v })} /></Field>
      <Field label="中心 Y"><NumberInput value={defect.cy} suffix="mm"
        onChange={(v) => onChange({ cy: v })} /></Field>
      <Field label={defect.type === 'thickness' ? '厚度幅度' : '高度幅度'}>
        <NumberInput value={defect.amplitude} suffix="mm" step={0.01}
          onChange={(v) => onChange({ amplitude: v })} />
      </Field>
      <Field label="特征宽度 σ"><NumberInput value={defect.sigma} suffix="mm"
        onChange={(v) => onChange({ sigma: v })} /></Field>
      {defect.type === 'ripple' && (
        <>
          <Field label="波长"><NumberInput value={defect.wavelength} suffix="mm"
            onChange={(v) => onChange({ wavelength: v })} /></Field>
          <Field label="走向角"><NumberInput value={defect.angleDeg} suffix="°"
            onChange={(v) => onChange({ angleDeg: v })} /></Field>
        </>
      )}
      <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
        <button className="btn" onClick={() => onChange({ enabled: !defect.enabled })}>
          {defect.enabled ? '停用' : '启用'}
        </button>
        <button className="btn btn-danger" onClick={onRemove}>删除</button>
      </div>
    </div>
  )
}
