import type { PersonId } from '../service/types'
import { daysBetween } from '../lib/time'
import type { ChatMessage, ChatThread } from './chat'

/**
 * The conversation log as rows: messages, and the marks between them that
 * tell a reader when things were said.
 *
 * The space above each message grows with the time that passed before it, so
 * a quick back-and-forth sits tight and a quiet afternoon opens up. Pauses
 * long enough to lose the thread are labelled; new days are headed.
 */
export type Row =
  | { type: 'day'; key: string; at: number }
  | { type: 'pause'; key: string; at: number; gap: number }
  | { type: 'unread'; key: string }
  | {
      type: 'message'
      key: string
      message: ChatMessage
      mine: boolean
      /** First of consecutive messages from one person. */
      runStart: boolean
      /** Last of them; where the sender's face sits. */
      runEnd: boolean
      /** Pixels of air above this message. */
      space: number
      /** Other people who have read up to and including this message. */
      seenBy: PersonId[]
    }

const PAUSE_MS = 2 * 60 * 60 * 1000

function airAbove(gapMs: number, sameSender: boolean): number {
  const minutes = Math.max(0, gapMs / 60000)
  const growth = Math.log2(1 + minutes)
  return sameSender ? 2 + Math.min(10, growth * 1.6) : 6 + Math.min(18, growth * 2.6)
}

export function buildRows(
  thread: ChatThread,
  me: PersonId,
  unreadAfter: string | null,
): Row[] {
  const rows: Row[] = []
  const seenAt = new Map<string, PersonId[]>()
  for (const [person, through] of Object.entries(thread.seenBy)) {
    // Having read up to your own message says nothing anyone needs to know.
    const message = thread.messages.find((m) => m.id === through)
    if (person === me || !message || message.from === person) continue
    seenAt.set(through, [...(seenAt.get(through) ?? []), person])
  }

  const unreadIndex = unreadAfter === null ? -1 : thread.messages.findIndex((m) => m.id === unreadAfter)
  let dividerPlaced = unreadAfter === null
  let previous: ChatMessage | undefined
  let previousRow: Extract<Row, { type: 'message' }> | undefined

  thread.messages.forEach((message, index) => {
    const at = Date.parse(message.at)
    const prevAt = previous ? Date.parse(previous.at) : 0
    let broken = !previous

    if (!previous || daysBetween(prevAt, at) !== 0) {
      rows.push({ type: 'day', key: `day-${message.key}`, at })
      broken = true
    } else if (at - prevAt >= PAUSE_MS) {
      rows.push({ type: 'pause', key: `pause-${message.key}`, at, gap: at - prevAt })
      broken = true
    }

    if (!dividerPlaced && index > unreadIndex && message.from !== me) {
      rows.push({ type: 'unread', key: 'unread' })
      dividerPlaced = true
      broken = true
    }

    const runStart = broken || previous?.from !== message.from
    if (runStart && previousRow) previousRow.runEnd = true

    previousRow = {
      type: 'message',
      key: message.key,
      message,
      mine: message.from === me,
      runStart,
      runEnd: false,
      space: broken ? 0 : airAbove(at - prevAt, !runStart),
      seenBy: seenAt.get(message.id) ?? [],
    }
    rows.push(previousRow)
    previous = message
  })

  if (previousRow) previousRow.runEnd = true
  return rows
}
