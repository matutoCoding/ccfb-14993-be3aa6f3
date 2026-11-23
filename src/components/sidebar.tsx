import { appStore, type PageKey } from '@/state/app_store'

const NAV: { key: PageKey; label: string; icon: string }[] = [
  { key: 'vehicles', label: '车型档案', icon: 'M4 6h16M4 12h16M4 18h10' },
  { key: 'surfaces', label: '玻璃曲面', icon: 'M3 17c4-8 14-8 18 0M3 17h18' },
  { key: 'stations', label: '检测工位', icon: 'M4 4h16v16H4zM4 12h16M12 4v16' },
  { key: 'analysis', label: '畸变分析', icon: 'M4 19V5m6 14V9m6 10v-6m6 6V7' },
  { key: 'batches', label: '批次记录', icon: 'M9 3h6v4H9zM5 7h14v14H5zM9 13h6M9 17h6' },
  { key: 'settings', label: '设置', icon: 'M12 15a3 3 0 100-6 3 3 0 000 6z M19 12a7 7 0 00-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 00-1.7-1L14.5 2h-5l-.4 2.6a7 7 0 00-1.7 1l-2.3-1-2 3.4 2 1.5a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.7 1l.4 2.6h5l.4-2.6a7 7 0 001.7-1l2.3 1 2-3.4-2-1.5c.1-.3.1-.7.1-1z' },
]

export function Sidebar() {
  const page = appStore.useStore((s) => s.page)
  return (
    <aside
      style={{
        width: 224,
        flexShrink: 0,
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border)',
        padding: 'var(--sp-5) var(--sp-3)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--sp-2)',
      }}
    >
      <div style={{ padding: '0 var(--sp-3) var(--sp-5)' }}>
        <div style={{ fontSize: 'var(--fs-lg)', fontWeight: 'var(--fw-semibold)' }}>
          光学畸变实验室
        </div>
        <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)', marginTop: 'var(--sp-1)' }}>
          Windshield Distortion Lab
        </div>
      </div>
      {NAV.map((item) => {
        const active = page === item.key
        return (
          <button
            key={item.key}
            onClick={() => appStore.set({ page: item.key })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-3)',
              width: '100%',
              padding: 'var(--sp-3) var(--sp-4)',
              borderRadius: 'var(--radius)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 'var(--fs-sm)',
              fontWeight: active ? 'var(--fw-semibold)' : 'var(--fw-normal)',
              color: active ? 'var(--primary)' : 'var(--text-2)',
              background: active ? 'var(--primary-soft)' : 'transparent',
              transition: 'background var(--t-fast)',
              textAlign: 'left',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d={item.icon} />
            </svg>
            {item.label}
          </button>
        )
      })}
    </aside>
  )
}
