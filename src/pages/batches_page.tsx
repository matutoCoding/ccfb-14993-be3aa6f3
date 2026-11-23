import { useMemo, useState } from 'react'
import type { BatchRecord, Defect } from '@/types'
import { appStore, currentStation, currentSurface, currentVehicle } from '@/state/app_store'
import { db, STORE } from '@/db/indexeddb'
import { reloadAll } from '@/state/bootstrap'
import { PageHeader, Field, NumberInput, EmptyState } from '@/components/ui'
import { DEFECT_LABEL, uid } from '@/physics/constants'
import { buildGlassStack } from '@/physics/glass_stack'
import { computeDirectDiopterMap } from '@/physics/diopter'
import dayjs from '@/libs/day'

export function BatchesPage() {
  const state = appStore.useStore((s) => s)
  const vehicle = currentVehicle(state)
  const surface = currentSurface(state)
  const station = currentStation(state)
  const settings = state.settings
  const [batchNo, setBatchNo] = useState(`B${dayjs().format('YYYYMMDD')}-01`)
  const [pieceCount, setPieceCount] = useState(10)

  const generate = async () => {
    if (!vehicle || !surface || !station || !settings) return
    const pieces = []
    for (let i = 0; i < pieceCount; i++) {
      // 每块玻璃在基础缺陷上叠加随机工艺波动
      const defects: Defect[] = surface.defects.map((d) => ({
        ...d,
        amplitude: d.amplitude * (0.7 + Math.random() * 0.6),
        cx: d.cx + (Math.random() - 0.5) * 20,
        cy: d.cy + (Math.random() - 0.5) * 20,
        id: uid('defect'),
      }))
      const testSurface = { ...surface, defects }
      const stack = buildGlassStack(testSurface)
      const eye = {
        x: vehicle.eyePoint.x + station.eyeOffset.x,
        y: vehicle.eyePoint.y + station.eyeOffset.y,
        z: vehicle.eyePoint.z + station.eyeOffset.z,
      }
      const map = computeDirectDiopterMap({
        stack,
        width: surface.width,
        height: surface.height,
        nx: 61, ny: 61,
        eye,
        boardDistance: station.boardDistance,
        derivativeStep: settings.limits.derivativeStep,
        zones: vehicle.zones,
        limitA: settings.limits.limitA,
        limitB: settings.limits.limitB,
      })
      const zoneA = map.samples.filter((s) => s.zone === 'A')
      const zoneB = map.samples.filter((s) => s.zone === 'B')
      const maxPowerA = Math.max(0, ...zoneA.map((s) => Math.max(Math.abs(s.dx), Math.abs(s.dy))))
      const maxPowerB = Math.max(0, ...zoneB.map((s) => Math.max(Math.abs(s.dx), Math.abs(s.dy))))
      const verdict = maxPowerA <= settings.limits.limitA && maxPowerB <= settings.limits.limitB
        ? 'pass' as const : 'reject' as const
      pieces.push({
        serial: `${batchNo}-${String(i + 1).padStart(3, '0')}`,
        defects,
        maxPowerA,
        maxPowerB,
        verdict,
        measuredAt: Date.now(),
      })
    }
    const record: BatchRecord = {
      id: uid('batch'),
      batchNo,
      vehicleId: vehicle.id,
      surfaceId: surface.id,
      stationId: station.id,
      pieces,
      createdAt: Date.now(),
    }
    await db.put(STORE.batches, record)
    await reloadAll()
  }

  const remove = async (id: string) => {
    await db.delete(STORE.batches, id)
    await reloadAll()
  }

  // 按缺陷类型统计超标率
  const defectStats = useMemo(() => {
    const map = new Map<string, { total: number; rejected: number }>()
    for (const batch of state.batches) {
      for (const piece of batch.pieces) {
        for (const d of piece.defects) {
          const cur = map.get(d.type) ?? { total: 0, rejected: 0 }
          cur.total += 1
          if (piece.verdict === 'reject') cur.rejected += 1
          map.set(d.type, cur)
        }
      }
    }
    return [...map.entries()]
  }, [state.batches])

  return (
    <>
      <PageHeader
        title="批次记录"
        subtitle="每块玻璃的缺陷参数快照与判定结果，按缺陷类型统计超标率"
        action={
          <button className="btn btn-primary" onClick={generate}
            disabled={!vehicle || !surface || !station}>
            生成仿真批次
          </button>
        }
      />

      <div className="panel" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-5)', display: 'flex', gap: 'var(--sp-5)' }}>
        <div style={{ flex: 1 }}>
          <Field label="批次编号">
            <input className="input" value={batchNo} onChange={(e) => setBatchNo(e.target.value)} />
          </Field>
        </div>
        <div style={{ width: 200 }}>
          <Field label="玻璃数量">
            <NumberInput value={pieceCount} min={1} max={200} onChange={setPieceCount} />
          </Field>
        </div>
      </div>

      <div className="panel" style={{ padding: 'var(--sp-5)', marginBottom: 'var(--sp-5)' }}>
        <div style={{ fontWeight: 'var(--fw-medium)', marginBottom: 'var(--sp-4)' }}>缺陷类型超标率统计</div>
        {defectStats.length === 0 ? (
          <div style={{ color: 'var(--text-3)', fontSize: 'var(--fs-sm)' }}>暂无数据，先生成一个批次</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--sp-4)' }}>
            {defectStats.map(([type, s]) => {
              const rate = s.total ? (s.rejected / s.total) * 100 : 0
              return (
                <div key={type} style={{
                  padding: 'var(--sp-4)', borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)', background: 'var(--bg-subtle)',
                }}>
                  <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-3)' }}>
                    {DEFECT_LABEL[type] ?? type}
                  </div>
                  <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 'var(--fw-semibold)', margin: 'var(--sp-2) 0',
                    color: rate > 15 ? 'var(--danger)' : 'var(--text-1)' }}>
                    {rate.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)' }}>
                    超标 {s.rejected} / 共 {s.total} 块
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {state.batches.length === 0 ? (
        <div className="panel">
          <EmptyState title="还没有批次记录" subtitle="配置好车型、曲面和工位后，点击右上角生成仿真批次"
            icon={<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 3h6v4H9zM5 7h14v14H5z" /></svg>} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          {state.batches.map((batch) => {
            const rejected = batch.pieces.filter((p) => p.verdict === 'reject').length
            return (
              <div key={batch.id} className="panel" style={{ padding: 'var(--sp-5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-4)' }}>
                  <div>
                    <span style={{ fontWeight: 'var(--fw-semibold)', fontSize: 'var(--fs-lg)' }}>{batch.batchNo}</span>
                    <span className="tag" style={{ marginLeft: 'var(--sp-3)' }}>
                      {dayjs(batch.createdAt).format('YYYY-MM-DD HH:mm')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
                    <span className={rejected > 0 ? 'tag tag-danger' : 'tag tag-success'}>
                      不合格 {rejected} / {batch.pieces.length}
                    </span>
                    <button className="btn btn-danger" onClick={() => remove(batch.id)}>删除批次</button>
                  </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-3)', textAlign: 'left' }}>
                      <th style={{ padding: 'var(--sp-2)', fontWeight: 'var(--fw-medium)' }}>序列号</th>
                      <th style={{ padding: 'var(--sp-2)', fontWeight: 'var(--fw-medium)' }}>A 区最大 D</th>
                      <th style={{ padding: 'var(--sp-2)', fontWeight: 'var(--fw-medium)' }}>B 区最大 D</th>
                      <th style={{ padding: 'var(--sp-2)', fontWeight: 'var(--fw-medium)' }}>缺陷</th>
                      <th style={{ padding: 'var(--sp-2)', fontWeight: 'var(--fw-medium)' }}>判定</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.pieces.map((p) => (
                      <tr key={p.serial} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: 'var(--sp-2)' }}>{p.serial}</td>
                        <td style={{ padding: 'var(--sp-2)' }}>{p.maxPowerA.toFixed(4)}</td>
                        <td style={{ padding: 'var(--sp-2)' }}>{p.maxPowerB.toFixed(4)}</td>
                        <td style={{ padding: 'var(--sp-2)', color: 'var(--text-3)' }}>
                          {p.defects.map((d) => DEFECT_LABEL[d.type]).join('、') || '—'}
                        </td>
                        <td style={{ padding: 'var(--sp-2)' }}>
                          <span className={p.verdict === 'pass' ? 'tag tag-success' : 'tag tag-danger'}>
                            {p.verdict === 'pass' ? '合格' : '不合格'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
