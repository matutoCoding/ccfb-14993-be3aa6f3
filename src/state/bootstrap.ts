import { db, loadSettings, STORE } from '@/db/indexeddb'
import { buildSeedData } from '@/data/seed'
import { appStore } from './app_store'

// 首次启动写入种子车型；之后全部走 IndexedDB
export async function bootstrap() {
  const existingVehicles = await db.getAll<unknown>(STORE.vehicles)
  if (existingVehicles.length === 0) {
    const seeds = buildSeedData()
    for (const bundle of seeds) {
      await db.put(STORE.vehicles, bundle.vehicle)
      await db.put(STORE.surfaces, bundle.surface)
      await db.put(STORE.stations, bundle.station)
    }
  }
  await reloadAll()
}

export async function reloadAll() {
  const [vehicles, surfaces, stations, batches, settings] = await Promise.all([
    db.getAll<import('@/types').VehicleProfile>(STORE.vehicles),
    db.getAll<import('@/types').GlassSurface>(STORE.surfaces),
    db.getAll<import('@/types').InspectionStation>(STORE.stations),
    db.getAll<import('@/types').BatchRecord>(STORE.batches),
    loadSettings(),
  ])
  const state = appStore.get()
  appStore.set({
    ready: true,
    vehicles,
    surfaces,
    stations,
    batches,
    settings,
    selectedVehicleId: state.selectedVehicleId ?? vehicles[0]?.id ?? null,
    selectedSurfaceId: state.selectedSurfaceId
      ?? surfaces.find((s) => s.vehicleId === (state.selectedVehicleId ?? vehicles[0]?.id))?.id
      ?? surfaces[0]?.id ?? null,
    selectedStationId: state.selectedStationId
      ?? stations.find((s) => s.vehicleId === (state.selectedVehicleId ?? vehicles[0]?.id))?.id
      ?? stations[0]?.id ?? null,
  })
}
