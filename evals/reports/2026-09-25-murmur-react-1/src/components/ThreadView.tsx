import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Sendable } from '../service/types'
import { useChat, useChatState } from '../state/context'
import {
  firstName,
  isGroup,
  threadTitle,
  unreadCount,
  type ChatMessage,
  type ChatThread,
} from '../state/chat'
import { buildRows } from '../state/rows'
import { closeThread } from '../lib/route'
import { formatDay, formatPause, formatStamp, formatTime } from '../lib/time'
import { useReadingPosition, type Anchor } from '../lib/useReadingPosition'
import { Avatar, GroupAvatar } from './Avatar'
import { Composer } from './Composer'
import { Lightbox } from './Lightbox'
import { MessageRow } from './MessageRow'
import { ReactionPicker } from './ReactionPicker'
import './ThreadView.css'

interface ThreadViewProps {
  threadId: string
  /** False while it slides away on a phone, or sits behind the list. */
  active: boolean
  showBack: boolean
}

export function ThreadView({ threadId, active, showBack }: ThreadViewProps) {
  const { sendText, sendPhoto, react, markRead, positions } = useChat()
  const state = useChatState()
  const thread = state.threads[threadId]
  const { me, people } = state
  const group = isGroup(thread)

  // Where "new" began when this conversation was opened. It stays put while
  // it is open, even as the reader catches up.
  const [unreadAfter] = useState(() =>
    unreadCount(thread, me) > 0 ? thread.lastSeen : null,
  )
  const rows = useMemo(() => buildRows(thread, me, unreadAfter), [thread, me, unreadAfter])

  const scrollerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [initial] = useState<Anchor | 'bottom'>(() => {
    const remembered = positions.get(threadId)
    if (remembered) return remembered
    if (unreadAfter !== null) return { key: 'unread', offset: 72 }
    return 'bottom'
  })
  const remember = useCallback((anchor: Anchor) => positions.set(threadId, anchor), [positions, threadId])
  const reading = useReadingPosition({ scrollerRef, contentRef, initial, active, onMove: remember })

  // Whatever has been on screen has been read.
  const lastRead = useRef(thread.lastSeen)
  const readVisible = useCallback(() => {
    const scroller = scrollerRef.current
    if (!scroller || !active || document.visibilityState !== 'visible') return
    const bottom = scroller.getBoundingClientRect().bottom
    const rendered = contentRef.current?.querySelectorAll<HTMLElement>('[data-id]') ?? []
    for (let i = rendered.length - 1; i >= 0; i--) {
      if (rendered[i].getBoundingClientRect().top < bottom) {
        const id = rendered[i].dataset.id!
        if (id !== lastRead.current) {
          lastRead.current = id
          markRead(threadId, id)
        }
        return
      }
    }
  }, [active, markRead, threadId])

  useEffect(() => {
    const scroller = scrollerRef.current
    readVisible()
    scroller?.addEventListener('scroll', readVisible, { passive: true })
    document.addEventListener('visibilitychange', readVisible)
    return () => {
      scroller?.removeEventListener('scroll', readVisible)
      document.removeEventListener('visibilitychange', readVisible)
    }
  }, [readVisible, thread.messages.length])

  const [picker, setPicker] = useState<{ message: ChatMessage; bubble: HTMLElement } | null>(null)
  const [viewing, setViewing] = useState<ChatMessage | null>(null)

  const onReact = useCallback(
    (message: ChatMessage, emoji: string) => react(threadId, message.id, emoji),
    [react, threadId],
  )
  const onOpenPicker = useCallback(
    (message: ChatMessage, bubble: HTMLElement) => setPicker({ message, bubble }),
    [],
  )
  const closePicker = useCallback(() => setPicker(null), [])

  const onSendText = (text: string) => {
    reading.pin()
    sendText(threadId, text)
  }
  const onSendPhoto = (photo: Sendable) => {
    reading.pin()
    sendPhoto(threadId, photo)
  }

  const unread = unreadCount(thread, me)
  const composing = thread.composing.filter((p) => p !== me)
  const others = thread.participants.filter((p) => p !== me).map((p) => people[p])
  const title = threadTitle(thread, state)

  return (
    <section className="thread" aria-label={title}>
      <header className="thread__header">
        {showBack && (
          <button type="button" className="thread__back" onClick={closeThread} aria-label="All conversations">
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {group ? <GroupAvatar people={others} size={38} /> : <Avatar person={others[0]} size={38} />}
        <div className="thread__heading">
          <h2 className="thread__title">{title}</h2>
          <Subtitle thread={thread} composingNames={composing.map((p) => firstName(people[p]))} />
        </div>
      </header>

      <div className="thread__log" ref={scrollerRef}>
        <div className="thread__content" ref={contentRef}>
          {thread.messages.length <= 3 && <Beginning thread={thread} />}
          {rows.map((row) => {
            switch (row.type) {
              case 'day':
                return (
                  <h3 key={row.key} data-key={row.key} className="mark mark--day">
                    {formatDay(row.at)}
                  </h3>
                )
              case 'pause':
                return (
                  <p key={row.key} data-key={row.key} className="mark mark--pause">
                    <span>{formatPause(row.gap)} later</span> · {formatTime(row.at)}
                  </p>
                )
              case 'unread':
                return (
                  <p key={row.key} data-key={row.key} className="mark mark--unread">
                    <span>New</span>
                  </p>
                )
              case 'message':
                return (
                  <MessageRow
                    key={row.key}
                    message={row.message}
                    sender={people[row.message.from]}
                    mine={row.mine}
                    group={group}
                    runStart={row.runStart}
                    runEnd={row.runEnd}
                    space={row.space}
                    seenBy={row.seenBy}
                    me={me}
                    people={people}
                    onReact={onReact}
                    onOpenPicker={onOpenPicker}
                    onOpenPhoto={setViewing}
                  />
                )
            }
          })}
          {composing.length > 0 && (
            <div className="typing" data-key="typing" aria-hidden="true">
              {group && <Avatar person={people[composing[0]]} size={28} />}
              <span className="typing__bubble">
                <span />
                <span />
                <span />
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="thread__below">
        {(unread > 0 ? !reading.atEnd : reading.farFromEnd) && (
          <button
            type="button"
            className="jump"
            data-new={unread > 0}
            onClick={() => reading.toEnd('smooth')}
          >
            {unread > 0 ? `${unread} new` : 'Latest'}
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path d="M12 5v14M5.5 12.5L12 19l6.5-6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <Composer
          placeholder={group ? `Message ${title}` : `Message ${firstName(others[0])}`}
          photos={state.sendable}
          onSendText={onSendText}
          onSendPhoto={onSendPhoto}
        />
      </div>

      {picker && (
        <ReactionPicker
          target={picker.bubble}
          alignEnd={picker.message.from === me}
          chosen={(picker.message.reactions ?? []).filter((r) => r.person === me).map((r) => r.emoji)}
          onPick={(emoji) => onReact(picker.message, emoji)}
          onClose={closePicker}
        />
      )}

      {viewing?.kind === 'photo' && (
        <Lightbox
          src={viewing.src}
          alt={viewing.alt}
          caption={`${viewing.from === me ? 'You' : (people[viewing.from]?.name ?? '')} · ${formatStamp(Date.parse(viewing.at))}`}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  )
}

function Subtitle({ thread, composingNames }: { thread: ChatThread; composingNames: string[] }) {
  const state = useChatState()
  if (composingNames.length > 0) {
    const who = isGroup(thread) ? `${composingNames.join(' and ')} ${composingNames.length > 1 ? 'are' : 'is'}` : ''
    return <p className="thread__subtitle thread__subtitle--live">{who ? `${who} writing…` : 'writing…'}</p>
  }
  if (!isGroup(thread)) return null
  const names = thread.participants.filter((p) => p !== state.me).map((p) => firstName(state.people[p]))
  return <p className="thread__subtitle">{[...names, 'you'].join(', ')}</p>
}

/** What sits above the first message when there are only a few. */
function Beginning({ thread }: { thread: ChatThread }) {
  const state = useChatState()
  const first = thread.messages[0]
  const others = thread.participants.filter((p) => p !== state.me).map((p) => state.people[p])
  return (
    <div className="beginning" data-key="beginning">
      {isGroup(thread) ? <GroupAvatar people={others} size={64} /> : <Avatar person={others[0]} size={64} />}
      <p className="beginning__title">{threadTitle(thread, state)}</p>
      <p className="beginning__note">
        {first ? `Began ${formatStamp(Date.parse(first.at))}` : 'Nothing has been said yet.'}
      </p>
    </div>
  )
}
