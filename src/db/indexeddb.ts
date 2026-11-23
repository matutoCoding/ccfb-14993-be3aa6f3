import type {
  AppSettings, BatchRecord, GlassSurface, InspectionStation, VehicleProfile,
} from '@/types'
import {
  DEFAULT_DERIVATIVE_STEP, DEFAULT_INVERSE_NX, LIMIT_A_DEFAULT, LIMIT_B_DEFAULT,
} from '@/physics/constants'

const DB_NAME = 'windshield_distortion_lab'
const DB_VERSION = 1

export const STORE = {
  vehicles: 'vehicles',
  surfaces: 'surfaces',
  stations: 'stations',
  batches: 'batches',
  settings: 'settings',
} as const

let dbPromise: Promise<IDBDatabase> | null = null

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE.vehicles)) db.createObjectStore(STORE.vehicles, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE.surfaces)) db.createObjectStore(STORE.surfaces, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE.stations)) db.createObjectStore(STORE.stations, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE.batches)) db.createObjectStore(STORE.batches, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE.settings)) db.createObjectStore(STORE.settings, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode)
        const req = fn(t.objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export const db = {
  getAll: <T>(store: string) => tx(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),
  get: <T>(store: string, id: string) => tx(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>),
  put: <T>(store: string, value: T) => tx(store, 'readwrite', (s) => s.put(value) as IDBRequest<IDBValidKey>),
  delete: (store: string, id: string) => tx(store, 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>),
  clear: (store: string) => tx(store, 'readwrite', (s) => s.clear() as IDBRequest<undefined>),
}

export function defaultSettings(): AppSettings {
  return {
    id: 'global',
    limits: {
      limitA: LIMIT_A_DEFAULT,
      limitB: LIMIT_B_DEFAULT,
      derivativeStep: DEFAULT_DERIVATIVE_STEP,
      inverseNx: DEFAULT_INVERSE_NX,
      inverseNy: DEFAULT_INVERSE_NX,
    },
    phaseShiftSteps: 4,
    renderScale: 1,
    updatedAt: Date.now(),
  }
}

export async function loadSettings(): Promise<AppSettings> {
  const existing = await db.get<AppSettings>(STORE.settings, 'global')
  if (existing) return existing
  const fresh = defaultSettings()
  await db.put(STORE.settings, fresh)
  return fresh
}

export type EntityMap = {
  [STORE.vehicles]: VehicleProfile
  [STORE.surfaces]: GlassSurface
  [STORE.stations]: InspectionStation
  [STORE.batches]: BatchRecord
  [STORE.settings]: AppSettings
}
