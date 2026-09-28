import { useLayoutEffect, useRef, useState } from 'react'
import type { Sendable } from '../service/types'
import { useMediaQuery } from '../lib/useMediaQuery'
import { Photo } from './Photo'
import './Composer.css'

interface ComposerProps {
  placeholder: string
  photos: Sendable[]
  onSendText: (text: string) => void
  onSendPhoto: (photo: Sendable) => void
}

const MAX_LINES_HEIGHT = 160

export function Composer({ placeholder, photos, onSendText, onSendPhoto }: ComposerProps) {
  const [text, setText] = useState('')
  const [trayOpen, setTrayOpen] = useState(false)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  // With a keyboard, Return sends. On a touchscreen it starts a new line,
  // as it does in every other messaging app there.
  const returnSends = useMediaQuery('(hover: hover) and (pointer: fine)')
  const canSend = text.trim().length > 0

  // Grow with what is written, up to a point.
  useLayoutEffect(() => {
    const field = fieldRef.current
    if (!field) return
    field.style.height = 'auto'
    field.style.height = `${Math.min(field.scrollHeight, MAX_LINES_HEIGHT)}px`
  }, [text])

  function send() {
    if (!canSend) return
    onSendText(text.trim())
    setText('')
    fieldRef.current?.focus()
  }

  return (
    <div className="composer">
      {trayOpen && (
        <div className="composer__tray" role="group" aria-label="Photos you can send">
          <ul className="composer__photos">
            {photos.map((photo) => (
              <li key={photo.src}>
                <button
                  type="button"
                  className="composer__photo"
                  aria-label={`Send photo: ${photo.alt}`}
                  onClick={() => {
                    onSendPhoto(photo)
                    setTrayOpen(false)
                  }}
                >
                  <Photo src={photo.src} alt="" className="photo--thumb" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <form
        className="composer__bar"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <button
          type="button"
          className="composer__icon"
          aria-label={trayOpen ? 'Hide photos' : 'Send a photo'}
          aria-expanded={trayOpen}
          onClick={() => setTrayOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <circle cx="9" cy="10" r="1.7" fill="currentColor" />
            <path d="M4 17l5-4.5 3.5 3 3-2.5L20 17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          </svg>
        </button>

        <textarea
          ref={fieldRef}
          className="composer__field"
          rows={1}
          value={text}
          placeholder={placeholder}
          aria-label="Message"
          enterKeyHint={returnSends ? 'send' : 'enter'}
          onChange={(event) => setText(event.target.value)}
          onFocus={() => setTrayOpen(false)}
          onKeyDown={(event) => {
            if (returnSends && event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              send()
            }
          }}
        />

        <button
          type="submit"
          className="composer__send"
          aria-label="Send"
          disabled={!canSend}
          // Keep the keyboard up when sending from a phone.
          onPointerDown={(event) => event.preventDefault()}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </div>
  )
}
