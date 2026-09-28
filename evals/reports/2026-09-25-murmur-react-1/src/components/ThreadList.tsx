import { useChat } from '../state/context'
import {
  firstName,
  isGroup,
  lastActivity,
  sortedThreads,
  threadTitle,
  unreadCount,
  type ChatMessage,
  type ChatState,
  type ChatThread,
} from '../state/chat'
import { openThread } from '../lib/route'
import { formatDuration, formatListTime } from '../lib/time'
import { Avatar, GroupAvatar } from './Avatar'
import './ThreadList.css'

export function ThreadList({ selectedId }: { selectedId: string | null }) {
  const { state } = useChat()

  return (
    <nav className="thread-list" aria-label="Conversations">
      <header className="thread-list__header">
        <h1 className="thread-list__title">Murmur</h1>
      </header>
      {state ? (
        <ul className="thread-list__items">
          {sortedThreads(state).map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              state={state}
              selected={thread.id === selectedId}
            />
          ))}
        </ul>
      ) : (
        <ListSkeleton />
      )}
    </nav>
  )
}

interface ThreadRowProps {
  thread: ChatThread
  state: ChatState
  selected: boolean
}

function ThreadRow({ thread, state, selected }: ThreadRowProps) {
  const unread = unreadCount(thread, state.me)
  const title = threadTitle(thread, state)
  const others = thread.participants.filter((p) => p !== state.me).map((p) => state.people[p])
  const last = thread.messages.at(-1)
  const composing = thread.composing.map((p) => state.people[p])

  return (
    <li>
      <button
        type="button"
        className="thread-row"
        data-unread={unread > 0}
        aria-current={selected ? 'page' : undefined}
        onClick={() => openThread(thread.id)}
      >
        {isGroup(thread) ? <GroupAvatar people={others} size={52} /> : <Avatar person={others[0]} size={52} />}
        <span className="thread-row__body">
          <span className="thread-row__top">
            <span className="thread-row__name">{title}</span>
            {last && (
              <time className="thread-row__time" dateTime={last.at}>
                {formatListTime(lastActivity(thread))}
              </time>
            )}
          </span>
          <span className="thread-row__bottom">
            {composing.length > 0 ? (
              <span className="thread-row__preview thread-row__preview--composing">
                {composing.length === 1 ? `${firstName(composing[0])} is writing…` : 'Several people are writing…'}
              </span>
            ) : (
              <span className="thread-row__preview">{last ? preview(last, thread, state) : 'No messages yet'}</span>
            )}
            {unread > 0 && (
              <span className="thread-row__badge">
                {unread}
                <span className="visually-hidden"> unread</span>
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  )
}

function preview(message: ChatMessage, thread: ChatThread, state: ChatState): string {
  const body =
    message.kind === 'text'
      ? message.text
      : message.kind === 'photo'
        ? 'Photo'
        : `Voice message, ${formatDuration(message.durationMs)}`
  if (message.from === state.me) return `You: ${body}`
  if (isGroup(thread)) return `${firstName(state.people[message.from])}: ${body}`
  return body
}

function ListSkeleton() {
  return (
    <ul className="thread-list__items" aria-busy="true" aria-label="Loading conversations">
      {[0.62, 0.44, 0.7, 0.52, 0.38].map((width, i) => (
        <li key={i} className="thread-row thread-row--skeleton" style={{ animationDelay: `${i * 90}ms` }}>
          <span className="skeleton skeleton--circle" />
          <span className="thread-row__body">
            <span className="skeleton skeleton--line" style={{ width: `${width * 100}%` }} />
            <span className="skeleton skeleton--line skeleton--faint" style={{ width: `${width * 130}%` }} />
          </span>
        </li>
      ))}
    </ul>
  )
}
