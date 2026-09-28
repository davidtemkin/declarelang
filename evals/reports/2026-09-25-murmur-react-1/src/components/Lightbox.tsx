import { useEffect, useRef, useState } from 'react'
import { mediaUrl } from '../service/api'
import './Lightbox.css'

interface LightboxProps {
  src: string
  alt: string
  caption: string
  onClose: () => void
}

const DISMISS_DISTANCE = 110

/** A photograph at full size, over everything else. */
export function Lightbox({ src, alt, caption, onClose }: LightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const drag = useRef<{ id: number; y: number } | null>(null)
  const moved = useRef(false)
  const [offset, setOffset] = useState(0)

  // Leaving the document closes the dialog, so there is nothing to undo.
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  // On touch, a photo can be pulled down and away.
  function onPointerDown(event: React.PointerEvent) {
    moved.current = false
    if (event.pointerType === 'mouse') return
    drag.current = { id: event.pointerId, y: event.clientY }
  }
  function onPointerMove(event: React.PointerEvent) {
    if (drag.current?.id !== event.pointerId) return
    const distance = event.clientY - drag.current.y
    if (Math.abs(distance) > 8) moved.current = true
    setOffset(Math.max(0, distance))
  }
  function onPointerUp() {
    if (!drag.current) return
    drag.current = null
    if (offset > DISMISS_DISTANCE) onClose()
    else setOffset(0)
  }

  return (
    <dialog
      ref={dialogRef}
      className="lightbox"
      aria-label={alt || 'Photo'}
      onClose={onClose}
      onClick={(event) => {
        if (!moved.current && !(event.target instanceof HTMLImageElement)) onClose()
      }}
      style={{ '--pull': offset } as React.CSSProperties}
      data-dragging={offset > 0}
    >
      <div
        className="lightbox__stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img className="lightbox__image" src={mediaUrl(src)} alt={alt} draggable={false} />
      </div>
      <p className="lightbox__caption">
        <span className="lightbox__alt">{alt}</span>
        <span>{caption}</span>
      </p>
      <button type="button" className="lightbox__close" onClick={onClose} aria-label="Close photo" autoFocus>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
    </dialog>
  )
}
