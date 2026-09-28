import { memo, useRef } from 'react'
import type { Person, PersonId } from '../service/types'
import type { ChatMessage } from '../state/chat'
import { useLongPress } from '../lib/useLongPress'
import { personHue } from '../lib/personColor'
import { formatStamp } from '../lib/time'
import { Avatar } from './Avatar'
import { Photo } from './Photo'
import { Reactions } from './Reactions'
import { VoiceMessage } from './VoiceMessage'
import './MessageRow.css'

interface MessageRowProps {
  message: ChatMessage
  sender: Person | undefined
  mine: boolean
  group: boolean
  runStart: boolean
  runEnd: boolean
  space: number
  seenBy: PersonId[]
  me: PersonId
  people: Record<PersonId, Person>
  onReact: (message: ChatMessage, emoji: string) => void
  onOpenPicker: (message: ChatMessage, bubble: HTMLElement) => void
  onOpenPhoto: (message: ChatMessage) => void
}

export const MessageRow = memo(function MessageRow({
  message,
  sender,
  mine,
  group,
  runStart,
  runEnd,
  space,
  seenBy,
  me,
  people,
  onReact,
  onOpenPicker,
  onOpenPhoto,
}: MessageRowProps) {
  const bubbleRef = useRef<HTMLDivElement>(null)
  const canReact = !message.pending
  const press = useLongPress(() => {
    if (canReact && bubbleRef.current) onOpenPicker(message, bubbleRef.current)
  })
  const showFace = group && !mine
  const at = Date.parse(message.at)
  const reactions = message.reactions ?? []

  return (
    <div
      className={`row ${mine ? 'row--mine' : 'row--theirs'}`}
      data-key={message.key}
      data-id={message.pending ? undefined : message.id}
      data-run-start={runStart}
      data-run-end={runEnd}
      data-face={showFace}
      style={{ '--space': `${space}px`, '--hue': personHue(message.from) } as React.CSSProperties}
    >
      {showFace && runStart && (
        <div className="row__name" aria-hidden="true">
          {sender?.name}
        </div>
      )}

      <div className="row__line">
        {showFace && (
          <div className="row__face">{runEnd && <Avatar person={sender} size={28} />}</div>
        )}

        <div className="row__stack">
          <div
            ref={bubbleRef}
            className={`bubble bubble--${message.kind} ${mine ? 'bubble--mine' : 'bubble--theirs'}`}
            data-pending={message.pending}
            title={formatStamp(at)}
            {...(canReact ? press : {})}
          >
            <span className="visually-hidden">
              {mine ? 'You' : sender?.name}, {formatStamp(at)}:
            </span>
            {message.kind === 'text' && <p className="bubble__text">{message.text}</p>}
            {message.kind === 'photo' && (
              <button
                type="button"
                className="bubble__photo"
                onClick={() => onOpenPhoto(message)}
                aria-label={`Photo: ${message.alt}. Open full size`}
              >
                <Photo src={message.src} alt={message.alt} />
              </button>
            )}
            {message.kind === 'voice' && <VoiceMessage message={message} />}
          </div>

          {canReact && (
            <button
              type="button"
              className="row__react"
              aria-label="Add a reaction"
              onClick={() => bubbleRef.current && onOpenPicker(message, bubbleRef.current)}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="9" cy="10" r="1.2" fill="currentColor" />
                <circle cx="15" cy="10" r="1.2" fill="currentColor" />
                <path d="M8.6 14c.9 1.3 2 2 3.4 2s2.5-.7 3.4-2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {reactions.length > 0 && (
        <Reactions
          reactions={reactions}
          me={me}
          people={people}
          onReact={(emoji) => onReact(message, emoji)}
        />
      )}

      {seenBy.length > 0 && (
        <div className="row__seen" aria-label={`Seen by ${seenBy.map((p) => people[p]?.name).join(', ')}`}>
          {seenBy.map((p) => (
            <Avatar key={p} person={people[p]} size={16} />
          ))}
        </div>
      )}
    </div>
  )
})
