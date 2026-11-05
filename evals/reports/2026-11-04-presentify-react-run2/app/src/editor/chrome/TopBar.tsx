import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Button, IconButton, Tip } from '../../ui/controls'
import { ChevronDownIcon, ChevronLeftIcon, PlayIcon, RedoIcon, UndoIcon } from '../../ui/icons'
import { DropdownMenu, type MenuEntry } from '../../ui/Menu'
import { LogoMark } from '../../ui/Wordmark'
import { menuItem, useCommands, type CommandId, type Commands } from '../commands'
import { useEditor, useEditorActions } from '../store'
import { SaveStatus } from './SaveStatus'
import styles from './TopBar.module.css'

export const UNTITLED = 'Untitled presentation'

export function TopBar({ focusTitle }: { focusTitle: boolean }) {
  const c = useCommands()

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <Tip label="All presentations">
          <Link to="/" className={styles.home} aria-label="All presentations">
            <ChevronLeftIcon size={16} />
            <LogoMark size={26} />
          </Link>
        </Tip>
        <TitleField autoFocus={focusTitle} />
        <SaveStatus />
      </div>

      <nav className={styles.menus} aria-label="Menus">
        <MenuButton label="Edit" entries={editEntries(c)} />
        <MenuButton label="Arrange" entries={arrangeEntries(c)} />
        <MenuButton label="Slide" entries={slideEntries(c)} />
      </nav>

      <div className={styles.right}>
        <IconButton label="Undo" shortcut="mod+z" disabled={!c.undo.enabled} onClick={c.undo.run}>
          <UndoIcon />
        </IconButton>
        <IconButton label="Redo" shortcut="mod+shift+z" disabled={!c.redo.enabled} onClick={c.redo.run}>
          <RedoIcon />
        </IconButton>
        <span className={styles.sep} />
        <Tip label="Present from this slide" shortcut="mod+alt+p">
          <Button variant="primary" icon={<PlayIcon size={16} />} onClick={c.present.run}>
            Present
          </Button>
        </Tip>
      </div>
    </header>
  )
}

function MenuButton({ label, entries }: { label: string; entries: MenuEntry[] }) {
  return (
    <DropdownMenu
      entries={entries}
      trigger={
        <button type="button" className={styles.menuButton}>
          {label}
          <ChevronDownIcon size={14} />
        </button>
      }
    />
  )
}

const pick = (c: Commands, ids: (CommandId | '-')[]): MenuEntry[] => ids.map((id) => (id === '-' ? { kind: 'separator' } : menuItem(c[id])))

function editEntries(c: Commands): MenuEntry[] {
  return pick(c, ['undo', 'redo', '-', 'cut', 'copy', 'paste', 'duplicate', 'delete', '-', 'selectAll', '-', 'save'])
}

function arrangeEntries(c: Commands): MenuEntry[] {
  return [
    ...pick(c, ['group', 'ungroup', '-', 'bringToFront', 'bringForward', 'sendBackward', 'sendToBack', '-']),
    { kind: 'label', label: 'Align' },
    ...pick(c, ['alignLeft', 'alignCenter', 'alignRight', 'alignTop', 'alignMiddle', 'alignBottom', '-']),
    { kind: 'label', label: 'Distribute' },
    ...pick(c, ['distributeHorizontal', 'distributeVertical']),
  ]
}

function slideEntries(c: Commands): MenuEntry[] {
  return pick(c, ['addSlide', 'duplicateSlide', 'deleteSlide', '-', 'present'])
}

/** The presentation's title, edited in place. A very long one is cut off with an ellipsis and shown whole in its tooltip. */
function TitleField({ autoFocus }: { autoFocus: boolean }) {
  const title = useEditor((s) => s.title)
  const actions = useEditorActions()
  // What is being typed, while the field has focus; otherwise it shows the title itself.
  const [typed, setTyped] = useState<string | null>(null)
  const editing = typed !== null
  const draft = typed ?? title
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus()
      ref.current?.select()
    }
  }, [autoFocus])

  const commit = () => {
    const next = draft.trim() || UNTITLED
    if (next !== title) actions.rename(next)
    setTyped(null)
  }

  return (
    <span className={styles.titleWrap} data-value={draft || UNTITLED} title={editing ? undefined : title}>
      <input
        ref={ref}
        className={styles.title}
        aria-label="Presentation title"
        value={draft}
        placeholder={UNTITLED}
        maxLength={200}
        spellCheck={false}
        onFocus={(e) => {
          setTyped(title)
          e.currentTarget.select()
        }}
        onChange={(e) => setTyped(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setTyped(title)
            requestAnimationFrame(() => ref.current?.blur())
          }
        }}
      />
    </span>
  )
}
