import { useEffect } from 'react'
import { appStore } from '@/state/app_store'
import { bootstrap } from '@/state/bootstrap'
import { Sidebar } from '@/components/sidebar'
import { VehiclesPage } from '@/pages/vehicles_page'
import { SurfacesPage } from '@/pages/surfaces_page'
import { StationsPage } from '@/pages/stations_page'
import { AnalysisPage } from '@/pages/analysis_page'
import { BatchesPage } from '@/pages/batches_page'
import { SettingsPage } from '@/pages/settings_page'

export function App() {
  const ready = appStore.useStore((s) => s.ready)
  const page = appStore.useStore((s) => s.page)

  useEffect(() => {
    bootstrap()
  }, [])

  if (!ready) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-3)' }}>
        正在初始化光学畸变仿真系统…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'auto', padding: 'var(--sp-7)' }}>
        {page === 'vehicles' && <VehiclesPage />}
        {page === 'surfaces' && <SurfacesPage />}
        {page === 'stations' && <StationsPage />}
        {page === 'analysis' && <AnalysisPage />}
        {page === 'batches' && <BatchesPage />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
