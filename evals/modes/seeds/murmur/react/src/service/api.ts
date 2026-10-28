import type { ClientFrame, History, ServerFrame } from './types'

/** Media paths in the history are relative to the service root. */
export function mediaUrl(path: string): string {
  return `/${path.replace(/^\//, '')}`
}

export async function fetchHistory(signal?: AbortSignal): Promise<History> {
  const res = await fetch('/threads.json', { signal })
  if (!res.ok) throw new Error(`History request failed: ${res.status}`)
  return res.json()
}

export interface LiveConnection {
  send(frame: ClientFrame): void
  close(): void
}

/**
 * Opens the live feed. Frames sent before the socket opens are queued.
 * The brief rules out reconnection, so there is none.
 */
export function connectLive(onFrame: (frame: ServerFrame) => void): LiveConnection {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(`${protocol}//${location.host}/live`)
  const queue: string[] = []

  socket.addEventListener('open', () => {
    for (const data of queue.splice(0)) socket.send(data)
  })
  socket.addEventListener('message', (event) => {
    onFrame(JSON.parse(event.data) as ServerFrame)
  })

  return {
    send(frame) {
      const data = JSON.stringify(frame)
      if (socket.readyState === WebSocket.OPEN) socket.send(data)
      else queue.push(data)
    },
    close() {
      socket.close()
    },
  }
}
