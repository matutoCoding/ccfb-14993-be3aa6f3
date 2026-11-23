// 极简响应式 store：createStore 返回 get/set/subscribe，配合浅比较
import { useEffect, useState } from 'react'

export type Listener<T> = (state: T) => void

export function createStore<T extends object>(initial: T) {
  let state = initial
  const listeners = new Set<Listener<T>>()

  const get = () => state
  const set = (patch: Partial<T>) => {
    state = { ...state, ...patch }
    listeners.forEach((l) => l(state))
  }
  const subscribe = (l: Listener<T>) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }
  const useStore = <S>(selector: (s: T) => S): S => {
    const [value, setValue] = useState(() => selector(state))
    useEffect(() => {
      const unsub = subscribe((s) => {
        const next = selector(s)
        setValue((prev) => (Object.is(prev, next) ? prev : next))
      })
      return unsub
    }, [selector])
    return value
  }

  return { get, set, subscribe, useStore }
}
