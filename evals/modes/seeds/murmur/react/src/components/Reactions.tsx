import type { Person, PersonId, Reaction } from '../service/types'
import './Reactions.css'

interface ReactionsProps {
  reactions: Reaction[]
  me: PersonId
  people: Record<PersonId, Person>
  onReact: (emoji: string) => void
}

function names(people: PersonId[], me: PersonId, all: Record<PersonId, Person>): string {
  const list = people.map((p) => (p === me ? 'you' : (all[p]?.name ?? 'someone')))
  return list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`
}

/** The marks on a message, one chip per mark, counted. */
export function Reactions({ reactions, me, people, onReact }: ReactionsProps) {
  const groups = new Map<string, PersonId[]>()
  for (const r of reactions) groups.set(r.emoji, [...(groups.get(r.emoji) ?? []), r.person])

  return (
    <div className="reactions">
      {[...groups].map(([emoji, from]) => {
        const mine = from.includes(me)
        return (
          <button
            key={emoji}
            type="button"
            className="reaction"
            aria-pressed={mine}
            aria-label={`${emoji} from ${names(from, me, people)}`}
            title={names(from, me, people)}
            onClick={() => !mine && onReact(emoji)}
          >
            <span className="reaction__emoji">{emoji}</span>
            {from.length > 1 && <span className="reaction__count">{from.length}</span>}
          </button>
        )
      })}
    </div>
  )
}
