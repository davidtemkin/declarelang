import type {
  History,
  Message,
  MessageId,
  Person,
  PersonId,
  Reaction,
  Sendable,
  ServerFrame,
  ThreadId,
} from '../service/types'

/**
 * A message as the app holds it. `key` is stable for the message's whole life
 * on screen, including the moment an optimistic send is replaced by the
 * service's copy with its real id.
 */
export type ChatMessage = Message & { key: string; pending?: boolean }

export interface ChatThread {
  id: ThreadId
  title: string | null
  participants: PersonId[]
  messages: ChatMessage[]
  /** The last message the person using the app has read. */
  lastSeen: MessageId | null
  /** How far each other participant has read, as reported live. */
  seenBy: Record<PersonId, MessageId>
  composing: PersonId[]
}

export interface ChatState {
  me: PersonId
  people: Record<PersonId, Person>
  sendable: Sendable[]
  threads: Record<ThreadId, ChatThread>
}

export type ChatAction =
  | { type: 'frame'; frame: ServerFrame }
  | { type: 'sending'; thread: ThreadId; message: ChatMessage }
  | { type: 'reacting'; thread: ThreadId; message: MessageId; emoji: string }
  | { type: 'read'; thread: ThreadId; through: MessageId }

export function initialState(history: History): ChatState {
  const threads: Record<ThreadId, ChatThread> = {}
  for (const t of history.threads) {
    threads[t.id] = {
      id: t.id,
      title: t.title,
      participants: t.participants,
      messages: t.messages.map((m) => ({ ...m, key: m.id })),
      lastSeen: t.lastSeen,
      seenBy: {},
      composing: [],
    }
  }
  return {
    me: history.me,
    people: Object.fromEntries(history.people.map((p) => [p.id, p])),
    sendable: history.sendable,
    threads,
  }
}

function updateThread(
  state: ChatState,
  id: ThreadId,
  update: (thread: ChatThread) => ChatThread,
): ChatState {
  const thread = state.threads[id]
  if (!thread) return state
  const next = update(thread)
  return next === thread ? state : { ...state, threads: { ...state.threads, [id]: next } }
}

function addReaction(message: ChatMessage, reaction: Reaction): ChatMessage {
  const reactions = message.reactions ?? []
  const exists = reactions.some((r) => r.person === reaction.person && r.emoji === reaction.emoji)
  return exists ? message : { ...message, reactions: [...reactions, reaction] }
}

function withMessage(
  thread: ChatThread,
  id: MessageId,
  update: (m: ChatMessage) => ChatMessage,
): ChatThread {
  const index = thread.messages.findIndex((m) => m.id === id)
  if (index < 0) return thread
  const updated = update(thread.messages[index])
  if (updated === thread.messages[index]) return thread
  const messages = thread.messages.slice()
  messages[index] = updated
  return { ...thread, messages }
}

export function indexOfMessage(thread: ChatThread, id: MessageId | null | undefined): number {
  return id ? thread.messages.findIndex((m) => m.id === id) : -1
}

function applyFrame(state: ChatState, frame: ServerFrame): ChatState {
  switch (frame.t) {
    case 'hello':
      return state

    case 'message':
      return updateThread(state, frame.thread, (thread) => {
        if (thread.messages.some((m) => m.id === frame.message.id)) return thread
        return {
          ...thread,
          messages: [...thread.messages, { ...frame.message, key: frame.message.id }],
          composing: thread.composing.filter((p) => p !== frame.message.from),
        }
      })

    case 'sent': {
      const entry = Object.values(state.threads).find((t) =>
        t.messages.some((m) => m.key === frame.ref),
      )
      if (!entry) return state
      return updateThread(state, entry.id, (thread) => ({
        ...thread,
        messages: thread.messages.map((m) =>
          m.key === frame.ref ? { ...frame.message, key: m.key, reactions: m.reactions } : m,
        ),
      }))
    }

    case 'reaction':
      return updateThread(state, frame.thread, (thread) =>
        withMessage(thread, frame.message, (m) =>
          addReaction(m, { person: frame.person, emoji: frame.emoji }),
        ),
      )

    case 'composing':
      return updateThread(state, frame.thread, (thread) => {
        const others = thread.composing.filter((p) => p !== frame.person)
        const composing = frame.state === 'start' ? [...others, frame.person] : others
        if (composing.length === thread.composing.length && frame.state === 'stop') return thread
        return { ...thread, composing }
      })

    case 'seen':
      return updateThread(state, frame.thread, (thread) => ({
        ...thread,
        seenBy: { ...thread.seenBy, [frame.person]: frame.through },
      }))
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'frame':
      return applyFrame(state, action.frame)

    case 'sending':
      return updateThread(state, action.thread, (thread) => ({
        ...thread,
        messages: [...thread.messages, action.message],
      }))

    case 'reacting':
      return updateThread(state, action.thread, (thread) =>
        withMessage(thread, action.message, (m) =>
          addReaction(m, { person: state.me, emoji: action.emoji }),
        ),
      )

    case 'read':
      return updateThread(state, action.thread, (thread) => {
        const current = indexOfMessage(thread, thread.lastSeen)
        const next = indexOfMessage(thread, action.through)
        return next > current ? { ...thread, lastSeen: action.through } : thread
      })
  }
}

// —— Selectors ——

export function lastActivity(thread: ChatThread): number {
  const last = thread.messages.at(-1)
  return last ? Date.parse(last.at) : 0
}

export function sortedThreads(state: ChatState): ChatThread[] {
  return Object.values(state.threads).sort((a, b) => lastActivity(b) - lastActivity(a))
}

export function unreadCount(thread: ChatThread, me: PersonId): number {
  const seen = indexOfMessage(thread, thread.lastSeen)
  let count = 0
  for (let i = seen + 1; i < thread.messages.length; i++) {
    if (thread.messages[i].from !== me) count++
  }
  return count
}

export function firstName(person: Person | undefined): string {
  return person?.name.split(/\s+/)[0] ?? 'Someone'
}

/** A group's own title, or the names of the other people in it. */
export function threadTitle(thread: ChatThread, state: ChatState): string {
  if (thread.title) return thread.title
  const others = thread.participants.filter((p) => p !== state.me).map((p) => state.people[p])
  if (others.length === 1) return others[0]?.name ?? 'Conversation'
  const names = others.map(firstName)
  return `${names.slice(0, -1).join(', ')} & ${names.at(-1)}`
}

export function isGroup(thread: ChatThread): boolean {
  return thread.participants.length > 2
}
