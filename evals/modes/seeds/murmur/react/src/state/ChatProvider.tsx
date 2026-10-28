import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { connectLive, fetchHistory, type LiveConnection } from '../service/api'
import type { MessageId, Sendable, ThreadId } from '../service/types'
import { chatReducer, initialState, type ChatMessage, type ChatState } from './chat'
import { ChatContext, type ChatContextValue, type ReadingPosition } from './context'

let refCounter = 0
function nextRef(): string {
  refCounter += 1
  return `local-${Date.now().toString(36)}-${refCounter}`
}

type Store = { state: ChatState | null }
type StoreAction = { type: 'loaded'; state: ChatState } | Parameters<typeof chatReducer>[1]

function storeReducer(store: Store, action: StoreAction): Store {
  if (action.type === 'loaded') return { state: action.state }
  return store.state ? { state: chatReducer(store.state, action) } : store
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const [{ state }, dispatch] = useReducer(storeReducer, { state: null })
  const [live, setLive] = useState<LiveConnection | null>(null)
  const loaded = state !== null
  const me = state?.me
  const positions = useRef(new Map<ThreadId, ReadingPosition>())

  useEffect(() => {
    const controller = new AbortController()
    fetchHistory(controller.signal).then(
      (history) => dispatch({ type: 'loaded', state: initialState(history) }),
      (error: unknown) => {
        if (!controller.signal.aborted) console.error(error)
      },
    )
    return () => controller.abort()
  }, [])

  // The live schedule starts at connect, so connect only once there is
  // history to apply it to.
  useEffect(() => {
    if (!loaded) return
    const connection = connectLive((frame) => dispatch({ type: 'frame', frame }))
    setLive(connection)
    return () => connection.close()
  }, [loaded])

  const sendText = useCallback(
    (thread: ThreadId, text: string) => {
      if (!live || !me) return
      const ref = nextRef()
      const message: ChatMessage = {
        id: ref, key: ref, pending: true, from: me, at: new Date().toISOString(), kind: 'text', text,
      }
      dispatch({ type: 'sending', thread, message })
      live.send({ t: 'send', ref, thread, kind: 'text', text })
    },
    [live, me],
  )

  const sendPhoto = useCallback(
    (thread: ThreadId, photo: Sendable) => {
      if (!live || !me) return
      const ref = nextRef()
      const message: ChatMessage = {
        id: ref, key: ref, pending: true, from: me, at: new Date().toISOString(),
        kind: 'photo', src: photo.src, alt: photo.alt,
      }
      dispatch({ type: 'sending', thread, message })
      live.send({ t: 'send', ref, thread, kind: 'photo', src: photo.src })
    },
    [live, me],
  )

  const react = useCallback(
    (thread: ThreadId, message: MessageId, emoji: string) => {
      if (!live) return
      dispatch({ type: 'reacting', thread, message, emoji })
      live.send({ t: 'react', thread, message, emoji })
    },
    [live],
  )

  const markRead = useCallback((thread: ThreadId, through: MessageId) => {
    dispatch({ type: 'read', thread, through })
  }, [])

  const value = useMemo<ChatContextValue>(
    () => ({ state, sendText, sendPhoto, react, markRead, positions: positions.current }),
    [state, sendText, sendPhoto, react, markRead],
  )

  return <ChatContext value={value}>{children}</ChatContext>
}
