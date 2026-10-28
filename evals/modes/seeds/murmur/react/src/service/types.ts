// Shapes of the conversation service's contract (task/api/API.md).

export type PersonId = string
export type ThreadId = string
export type MessageId = string

export interface Person {
  id: PersonId
  name: string
  avatar: string | null
}

export interface Reaction {
  person: PersonId
  emoji: string
}

interface MessageBase {
  id: MessageId
  from: PersonId
  at: string
  reactions?: Reaction[]
}

export interface TextMessage extends MessageBase {
  kind: 'text'
  text: string
}

export interface PhotoMessage extends MessageBase {
  kind: 'photo'
  src: string
  alt: string
}

export interface VoiceMessage extends MessageBase {
  kind: 'voice'
  src: string
  durationMs: number
  peaks: number[]
}

export type Message = TextMessage | PhotoMessage | VoiceMessage

export interface Sendable {
  src: string
  alt: string
}

export interface Thread {
  id: ThreadId
  title: string | null
  participants: PersonId[]
  lastSeen: MessageId | null
  messages: Message[]
}

export interface History {
  me: PersonId
  people: Person[]
  sendable: Sendable[]
  threads: Thread[]
}

export type ServerFrame =
  | { t: 'hello'; me: PersonId; serverNow: number }
  | { t: 'composing'; thread: ThreadId; person: PersonId; state: 'start' | 'stop' }
  | { t: 'message'; thread: ThreadId; message: Message }
  | { t: 'reaction'; thread: ThreadId; message: MessageId; person: PersonId; emoji: string }
  | { t: 'seen'; thread: ThreadId; person: PersonId; through: MessageId }
  | { t: 'sent'; ref: string; message: Message }

export type ClientFrame =
  | { t: 'send'; ref: string; thread: ThreadId; kind: 'text'; text: string }
  | { t: 'send'; ref: string; thread: ThreadId; kind: 'photo'; src: string }
  | { t: 'react'; thread: ThreadId; message: MessageId; emoji: string }
