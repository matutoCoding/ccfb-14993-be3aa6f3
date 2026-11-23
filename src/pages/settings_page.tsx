import { useState } from 'react'
import { appStore } from '@/state/app_store'
import { db, STORE, defaultSettings } from '@/db/indexeddb'
import { reloadAll } from '@/state/bootstrap'
import { PageHeader, Field, NumberInput } from '@/components/ui'

export function SettingsPage() {
  const settings = appStore.useStore((s) => s.settings)
  const [saved, setSaved] = useState(false)
  if (!settings) return <PageHeader title="设置" />

  const update = (patch: Partial<typeof settings.limits>) => {
    setSaved(false)
    appStore.set({
      settings: { ...settings, limits: { ...settings.limits, ...patch }, updatedAt: Date.now() },
    })
  }
  const updateBase = (patch: Partial<typeof settings>) => {
    setSaved(false)
    appStore.set({ settings: { ...settings, ...patch, updatedAt: Date.now() } })
  }

  const save = async () => {
    const current = appStore.get().settings!
    await db.put(STORE.settings, current)
    setSaved(true)
    await reloadAll()
  }
  const reset = async () => {
    const fresh = defaultSettings()
    await db.put(STORE.settings, fresh)
    await reloadAll()
    setSaved(true)
  }

  return (
    <>
      <PageHeader
        title="设置"
        subtitle="判定限值、数值差分与反演分辨率"
        action={
          <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
            <button className="btn" onClick={reset}>恢复默认</button>
            <button className="btn btn-primary" onClick={save}>保存设置</button>
          </div>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)', maxWidth: 760 }}>
        <div className="panel" style={{ padding: 'var(--sp-5)' }}>
          <div style={{ fontWeight: 'var(--fw-medium)', marginBottom: 'var(--sp-4)' }}>畸变限值（屈光度 D）</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-4)' }}>
            <Field label="A 区限值（主视区）">
              <NumberInput value={settings.limits.limitA} step={0.01}
                onChange={(v) => update({ limitA: v })} />
            </Field>
            <Field label="B 区限值（周边区）">
              <NumberInput value={settings.limits.limitB} step={0.01}
                onChange={(v) => update({ limitB: v })} />
            </Field>
          </div>
          <div style={{ marginTop: 'var(--sp-3)', fontSize: 'var(--fs-xs)', color: 'var(--text-3)', lineHeight: 1.7 }}>
            参考 GB 9656 / ISO 3539 常用量级：A 区 0.12 D、B 区 0.23 D。新车型弧度变更后在此调整判定标准。
          </div>
        </div>

        <div className="panel" style={{ padding: 'var(--sp-5)' }}>
          <div style={{ fontWeight: 'var(--fw-medium)', marginBottom: 'var(--sp-4)' }}>数值计算参数</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--sp-4)' }}>
            <Field label="角偏导差分步长">
              <NumberInput value={settings.limits.derivativeStep} suffix="mm" step={0.1}
                onChange={(v) => update({ derivativeStep: v })} />
            </Field>
            <Field label="反演采样 Nx">
              <NumberInput value={settings.limits.inverseNx} step={10}
                onChange={(v) => update({ inverseNx: v })} />
            </Field>
            <Field label="反演采样 Ny">
              <NumberInput value={settings.limits.inverseNy} step={10}
                onChange={(v) => update({ inverseNy: v })} />
            </Field>
            <Field label="相移步数">
              <NumberInput value={settings.phaseShiftSteps}
                onChange={(v) => updateBase({ phaseShiftSteps: v })} />
            </Field>
            <Field label="渲染分辨率倍率">
              <NumberInput value={settings.renderScale} step={0.25}
                onChange={(v) => updateBase({ renderScale: v })} />
            </Field>
          </div>
        </div>

        {saved && (
          <div className="tag tag-success" style={{ alignSelf: 'flex-start', padding: 'var(--sp-2) var(--sp-4)' }}>
            设置已保存到 IndexedDB
          </div>
        )}
      </div>
    </>
  )
}
