import * as ContextMenu from '@radix-ui/react-context-menu'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'
import { shortcutLabel } from './shortcuts'
import styles from './Menu.module.css'

/**
 * One description of a menu, drawn either as a dropdown (from a button) or as a context menu
 * (from a right-click), so the same commands are always found the same way.
 */
export type MenuEntry =
  | {
      kind?: 'item'
      label: string
      icon?: ReactNode
      shortcut?: string
      disabled?: boolean
      danger?: boolean
      onSelect: () => void
    }
  | { kind: 'separator' }
  | { kind: 'label'; label: string }

export function DropdownMenu({
  trigger,
  entries,
  align = 'start',
}: {
  trigger: ReactNode
  entries: MenuEntry[]
  align?: 'start' | 'end' | 'center'
}) {
  return (
    <Dropdown.Root modal={false}>
      <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content className={styles.content} align={align} sideOffset={6} collisionPadding={8} loop>
          {entries.map((entry, i) => renderEntry(entry, i, Dropdown))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  )
}

export function ContextMenuArea({ children, entries, onOpen }: { children: ReactNode; entries: MenuEntry[]; onOpen?: () => void }) {
  return (
    <ContextMenu.Root modal={false} onOpenChange={(open) => open && onOpen?.()}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={styles.content} collisionPadding={8} loop>
          {entries.map((entry, i) => renderEntry(entry, i, ContextMenu))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

type Parts = typeof Dropdown | typeof ContextMenu

function renderEntry(entry: MenuEntry, index: number, Parts: Parts) {
  if (entry.kind === 'separator') return <Parts.Separator key={index} className={styles.separator} />
  if (entry.kind === 'label') return <Parts.Label key={index} className={styles.label}>{entry.label}</Parts.Label>
  return (
    <Parts.Item
      key={index}
      className={styles.item}
      data-danger={entry.danger ? '' : undefined}
      disabled={entry.disabled}
      onSelect={entry.onSelect}
    >
      <span className={styles.icon}>{entry.icon}</span>
      <span className={styles.itemLabel}>{entry.label}</span>
      {entry.shortcut ? <span className={styles.shortcut}>{shortcutLabel(entry.shortcut)}</span> : null}
    </Parts.Item>
  )
}
