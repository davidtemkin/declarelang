import { createContext, use } from 'react'
import type { MessageId, Sendable, ThreadId } from '../service/types'
import type { ChatState } from './chat'

/**
 * Where someone was in a conversation: the message at the top of their view
 * and how far from the top it sat. Held for the session only.
 */
export interface ReadingPosition {
  key: string
  offset: number
}

export interface ChatContextValue {
  /** Null until the history has arrived. */
  state: ChatState | null
  sendText(thread: ThreadId, text: string): void
  sendPhoto(thread: ThreadId, photo: Sendable): void
  react(thread: ThreadId, message: MessageId, emoji: string): void
  markRead(thread: ThreadId, through: MessageId): void
  positions: Map<ThreadId, ReadingPosition>
}

export const ChatContext = createContext<ChatContextValue | null>(null)

export function useChat(): ChatContextValue {
  const value = use(ChatContext)
  if (!value) throw new Error('useChat must be used inside <ChatProvider>')
  return value
}

/** For components that only render once the history is in. */
export function useChatState(): ChatState {
  const { state } = useChat()
  if (!state) throw new Error('useChatState used before the history loaded')
  return state
}
