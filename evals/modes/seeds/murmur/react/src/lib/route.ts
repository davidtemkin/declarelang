import { useSyncExternalStore } from 'react'

// The open conversation lives in the URL hash, so the platform's back
// gesture and button leave a conversation the way people expect.

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

function currentThread(): string | null {
  const match = /^#\/(.+)$/.exec(location.hash)
  return match ? decodeURIComponent(match[1]) : null
}

function notify() {
  for (const listener of listeners) listener()
}

export function useOpenThread(): string | null {
  return useSyncExternalStore(subscribe, currentThread)
}

export function openThread(id: string) {
  if (currentThread() === id) return
  const state = { fromList: currentThread() === null }
  history.pushState(state, '', `#/${encodeURIComponent(id)}`)
  notify()
}

export function closeThread() {
  if ((history.state as { fromList?: boolean } | null)?.fromList) {
    history.back()
  } else {
    history.replaceState(null, '', location.pathname + location.search)
    notify()
  }
}
