import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle, action }: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--sp-6)' }}>
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-sub">{subtitle}</div>}
      </div>
      {action}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

export function NumberInput({ value, onChange, step = 1, min, max, suffix }: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
      <input
        className="input"
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {suffix && <span style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)', whiteSpace: 'nowrap' }}>{suffix}</span>}
    </div>
  )
}

export function EmptyState({ title, subtitle, icon }: { title: string; subtitle: string; icon: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--sp-3)',
        padding: 'var(--sp-7)',
        color: 'var(--text-3)',
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--text-3)',
        }}
      >
        {icon}
      </div>
      <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-medium)', color: 'var(--text-2)' }}>{title}</div>
      <div style={{ fontSize: 'var(--fs-sm)' }}>{subtitle}</div>
    </div>
  )
}
