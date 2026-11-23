import { createStore } from './store'
import type {
  AppSettings, BatchRecord, GlassSurface, InspectionStation, VehicleProfile,
} from '@/types'

export type PageKey =
  | 'vehicles'
  | 'surfaces'
  | 'stations'
  | 'analysis'
  | 'batches'
  | 'settings'

type AppState = {
  ready: boolean
  page: PageKey
  vehicles: VehicleProfile[]
  surfaces: GlassSurface[]
  stations: InspectionStation[]
  batches: BatchRecord[]
  settings: AppSettings | null
  selectedVehicleId: string | null
  selectedSurfaceId: string | null
  selectedStationId: string | null
}

export const appStore = createStore<AppState>({
  ready: false,
  page: 'vehicles',
  vehicles: [],
  surfaces: [],
  stations: [],
  batches: [],
  settings: null,
  selectedVehicleId: null,
  selectedSurfaceId: null,
  selectedStationId: null,
})

export function currentVehicle(state: AppState): VehicleProfile | undefined {
  return state.vehicles.find((v) => v.id === state.selectedVehicleId)
}

export function currentSurface(state: AppState): GlassSurface | undefined {
  return state.surfaces.find((s) => s.id === state.selectedSurfaceId)
}

export function currentStation(state: AppState): InspectionStation | undefined {
  return state.stations.find((s) => s.id === state.selectedStationId)
}
