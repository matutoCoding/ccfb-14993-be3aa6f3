// 应用状态仓库：IndexedDB 持久化 + 内存响应式状态（极简发布订阅）
import { idb, StoreName, uid } from './indexeddb'
import {
  AppSettings,
  BatchRecord,
  GlassSurface,
  InspectionStation,
  VehicleModel
} from '../models/types'
import { seedSettings, seedStation, seedVehicles } from '../models/seed'
import { DEFAULT_LAYER } from '../optics/laminate'

type Listener = () => void

interface AppState {
  ready: boolean
  vehicles: VehicleModel[]
  surfaces: GlassSurface[]
  stations: InspectionStation[]
  batches: BatchRecord[]
  settings: AppSettings
  currentVehicleId: string
  currentSurfaceId: string
  currentStationId: string
}

const state: AppState = {
  ready: false,
  vehicles: [],
  surfaces: [],
  stations: [],
  batches: [],
  settings: seedSettings(),
  currentVehicleId: 'veh_sedan',
  currentSurfaceId: '',
  currentStationId: 'stn_default'
}

const listeners = new Set<Listener>()
export const subscribe = (fn: Listener): (() => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const emit = () => listeners.forEach((fn) => fn())

export const getState = (): AppState => state

// 首次启动写入种子数据
export const initStore = async (): Promise<void> => {
  const existingVehicles = await idb.getAll<VehicleModel>('vehicles')
  if (existingVehicles.length === 0) {
    await idb.bulkPut('vehicles', seedVehicles())
    await idb.put('stations', seedStation())
    await idb.put('settings', seedSettings())
    await idb.bulkPut('surfaces', seedSurfaces())
  }
  state.vehicles = await idb.getAll<VehicleModel>('vehicles')
  state.surfaces = await idb.getAll<GlassSurface>('surfaces')
  state.stations = await idb.getAll<InspectionStation>('stations')
  state.batches = await idb.getAll<BatchRecord>('batches')
  state.settings = (await idb.get<AppSettings>('settings', 'settings_main')) ?? seedSettings()
  state.currentSurfaceId = state.surfaces[0]?.id ?? ''
  state.ready = true
  emit()
}

// 每个车型配一块默认控制曲线玻璃
const seedSurfaces = (): GlassSurface[] =>
  (['veh_sedan', 'veh_suv', 'veh_hud'] as const).map((vehicleId, i) => ({
    id: `sfc_${vehicleId}`,
    vehicleId,
    name: '主曲面',
    source: 'control_curves' as const,
    controlCurves: [
      {
        yNorm: 0.2,
        points: [
          { xNorm: 0, sag: 0.012 + i * 0.002 },
          { xNorm: 0.5, sag: 0 },
          { xNorm: 1, sag: 0.012 + i * 0.002 }
        ]
      },
      {
        yNorm: 0.5,
        points: [
          { xNorm: 0, sag: 0.02 + i * 0.003 },
          { xNorm: 0.5, sag: 0 },
          { xNorm: 1, sag: 0.02 + i * 0.003 }
        ]
      },
      {
        yNorm: 0.8,
        points: [
          { xNorm: 0, sag: 0.014 + i * 0.002 },
          { xNorm: 0.5, sag: 0 },
          { xNorm: 1, sag: 0.014 + i * 0.002 }
        ]
      }
    ],
    layer: { ...DEFAULT_LAYER },
    defects: [],
    updatedAt: Date.now()
  }))

const persist = async <T extends { id: string }>(store: StoreName, value: T, key: keyof AppState) => {
  await idb.put(store, value)
  const list = (state[key] as { id: string }[]).filter((v) => v.id !== value.id)
  ;(state[key] as unknown as T[]).push(value)
  ;(state[key] as unknown as T[]) = [...list, value] as never
  emit()
}

export const saveVehicle = async (v: VehicleModel) => {
  v.updatedAt = Date.now()
  await persist('vehicles', v, 'vehicles')
}
export const saveSurface = async (s: GlassSurface) => {
  s.updatedAt = Date.now()
  await persist('surfaces', s, 'surfaces')
}
export const saveStation = async (s: InspectionStation) => persist('stations', s, 'stations')
export const saveBatch = async (b: BatchRecord) => persist('batches', b, 'batches')
export const saveSettings = async (s: AppSettings) => {
  await idb.put('settings', s)
  state.settings = s
  emit()
}

export const removeVehicle = async (id: string) => {
  await idb.remove('vehicles', id)
  state.vehicles = state.vehicles.filter((v) => v.id !== id)
  emit()
}
export const removeSurface = async (id: string) => {
  await idb.remove('surfaces', id)
  state.surfaces = state.surfaces.filter((s) => s.id !== id)
  emit()
}
export const removeBatch = async (id: string) => {
  await idb.remove('batches', id)
  state.batches = state.batches.filter((b) => b.id !== id)
  emit()
}

export const setCurrent = (patch: Partial<Pick<AppState, 'currentVehicleId' | 'currentSurfaceId' | 'currentStationId'>>) => {
  Object.assign(state, patch)
  emit()
}

export const newId = uid
