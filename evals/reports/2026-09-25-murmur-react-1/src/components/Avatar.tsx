import { useState } from 'react'
import { mediaUrl } from '../service/api'
import type { Person } from '../service/types'
import { personHue } from '../lib/personColor'
import './Avatar.css'

function initials(name: string): string {
  const parts = name.split(/[\s-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts.at(-1)![0] : '')).toUpperCase()
}

interface AvatarProps {
  person: Person | undefined
  size: number
}

/** A person's picture, or their initials while it loads or if they have none. */
export function Avatar({ person, size }: AvatarProps) {
  const [loaded, setLoaded] = useState(false)
  const hue = person ? personHue(person.id) : 0
  return (
    <span
      className="avatar"
      style={{ '--size': `${size}px`, '--hue': hue } as React.CSSProperties}
      aria-hidden="true"
    >
      <span className="avatar__initials">{person ? initials(person.name) : ''}</span>
      {person?.avatar && (
        <img
          className="avatar__image"
          src={mediaUrl(person.avatar)}
          alt=""
          data-loaded={loaded}
          onLoad={() => setLoaded(true)}
          draggable={false}
        />
      )}
    </span>
  )
}

/** Two faces overlapping, for a conversation of more than two people. */
export function GroupAvatar({ people, size }: { people: (Person | undefined)[]; size: number }) {
  const small = Math.round(size * 0.68)
  return (
    <span className="group-avatar" style={{ '--size': `${size}px` } as React.CSSProperties} aria-hidden="true">
      <span className="group-avatar__back">
        <Avatar person={people[1]} size={small} />
      </span>
      <span className="group-avatar__front">
        <Avatar person={people[0]} size={small} />
      </span>
    </span>
  )
}
