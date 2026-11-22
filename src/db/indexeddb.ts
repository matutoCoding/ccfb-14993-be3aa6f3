// IndexedDB 极简 Promise 封装：单库多对象仓库，无第三方依赖
const DB_NAME = 'windshield_optics_db'
const DB_VERSION = 1

export type StoreName =
  | 'vehicles'
  | 'surfaces'
  | 'stations'
  | 'batches'
  | 'settings'

const STORES: StoreName[] = ['vehicles', 'surfaces', 'stations', 'batches', 'settings']

let dbPromise: Promise<IDBDatabase> | null = null

const openDb = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

const tx = async <T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = fn(t.objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const idb = {
  get: async <T>(store: StoreName, id: string): Promise<T | undefined> =>
    tx(store, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>),

  getAll: async <T>(store: StoreName): Promise<T[]> =>
    tx(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),

  put: async <T extends { id: string }>(store: StoreName, value: T): Promise<T> =>
    tx(store, 'readwrite', (s) => s.put(value) as IDBRequest<IDBValidKey>).then(() => value),

  bulkPut: async <T extends { id: string }>(store: StoreName, values: T[]): Promise<void> => {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite')
      const s = t.objectStore(store)
      for (const v of values) s.put(v)
      t.oncomplete = () => resolve()
      t.onerror = () => reject(t.error)
    })
  },

  remove: async (store: StoreName, id: string): Promise<void> => {
    await tx(store, 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>)
  },

  clear: async (store: StoreName): Promise<void> => {
    await tx(store, 'readwrite', (s) => s.clear() as IDBRequest<undefined>)
  }
}

export const uid = (prefix = 'id'): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
