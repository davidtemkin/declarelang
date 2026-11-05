import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { canReorder, shareParent } from '../model/arrange'
import { findElement } from '../model/elements'
import { hasClipboardContent } from './clipboard'
import { currentElements, useEditorStore, type EditorState } from './store'
import type { SyncEngine } from './sync'
import * as I from '../ui/icons'
import type { MenuEntry } from '../ui/Menu'

/**
 * Every action the editor offers, described once. The menus, the context menus, the toolbar
 * buttons and the keyboard all run these, so an action is labelled, enabled and done the same way
 * wherever it is found.
 */
export interface Command {
  label: string
  shortcut?: string
  icon?: ReactNode
  enabled: boolean
  run: () => void
}

export type CommandId =
  | 'undo' | 'redo'
  | 'cut' | 'copy' | 'paste' | 'duplicate' | 'delete' | 'selectAll'
  | 'group' | 'ungroup'
  | 'bringForward' | 'sendBackward' | 'bringToFront' | 'sendToBack'
  | 'alignLeft' | 'alignCenter' | 'alignRight' | 'alignTop' | 'alignMiddle' | 'alignBottom'
  | 'distributeHorizontal' | 'distributeVertical'
  | 'addSlide' | 'duplicateSlide' | 'deleteSlide'
  | 'present' | 'save'

export type Commands = Record<CommandId, Command>

export const SyncContext = createContext<SyncEngine | null>(null)

export function useSync(): SyncEngine {
  const sync = useContext(SyncContext)
  if (!sync) throw new Error('useSync must be used inside an open presentation')
  return sync
}

/** What the commands depend on, picked so that the list is rebuilt only when one of these changes. */
function summarize(s: EditorState) {
  const elements = currentElements(s)
  const selected = s.selection
  const groupsSelected = selected.filter((id) => findElement(elements, id)?.kind === 'group').length
  return [
    s.past.length > 0 || s.editingTextId !== null,
    s.future.length > 0,
    selected.length,
    groupsSelected,
    selected.length >= 2 && shareParent(elements, selected),
    selected.length > 0 && canReorder(elements, selected, 'forward'),
    selected.length > 0 && canReorder(elements, selected, 'backward'),
    s.doc.order.length,
    s.currentSlide,
  ] as const
}

export function useCommands(): Commands {
  const store = useEditorStore()
  const sync = useSync()
  const key = useStore(store, (s) => summarize(s).join('|'))

  return useMemo(() => {
    const s = store.getState()
    const [canUndo, canRedo, count, groups, canGroup, canForward, canBackward, slideCount, currentSlide] = summarize(s)
    const a = () => store.getState().actions
    const some = count > 0
    return {
      undo: { label: 'Undo', shortcut: 'mod+z', icon: <I.UndoIcon />, enabled: canUndo, run: () => a().undo() },
      redo: { label: 'Redo', shortcut: 'mod+shift+z', icon: <I.RedoIcon />, enabled: canRedo, run: () => a().redo() },
      cut: { label: 'Cut', shortcut: 'mod+x', icon: <I.ScissorsIcon />, enabled: some, run: () => void a().cut() },
      copy: { label: 'Copy', shortcut: 'mod+c', icon: <I.CopyIcon />, enabled: some, run: () => void a().copy() },
      paste: {
        label: 'Paste',
        shortcut: 'mod+v',
        icon: <I.ClipboardIcon />,
        // Copying changes nothing in the store, so this is asked afresh each time a menu draws it.
        get enabled() {
          return hasClipboardContent()
        },
        run: () => void a().paste(),
      },
      duplicate: { label: 'Duplicate', shortcut: 'mod+d', icon: <I.DuplicateIcon />, enabled: some, run: () => a().duplicateSelection() },
      delete: { label: 'Delete', shortcut: 'backspace', icon: <I.TrashIcon />, enabled: some, run: () => a().deleteSelection() },
      selectAll: { label: 'Select all', shortcut: 'mod+a', enabled: true, run: () => a().selectAll() },
      group: { label: 'Group', shortcut: 'mod+g', icon: <I.GroupIcon />, enabled: canGroup, run: () => a().groupSelection() },
      ungroup: { label: 'Ungroup', shortcut: 'mod+shift+g', icon: <I.UngroupIcon />, enabled: groups > 0, run: () => a().ungroupSelection() },
      bringForward: { label: 'Bring forward', shortcut: 'mod+]', icon: <I.BringForwardIcon />, enabled: canForward, run: () => a().reorderSelection('forward') },
      sendBackward: { label: 'Send backward', shortcut: 'mod+[', icon: <I.SendBackwardIcon />, enabled: canBackward, run: () => a().reorderSelection('backward') },
      bringToFront: { label: 'Bring to front', shortcut: 'mod+shift+]', icon: <I.BringFrontIcon />, enabled: canForward, run: () => a().reorderSelection('front') },
      sendToBack: { label: 'Send to back', shortcut: 'mod+shift+[', icon: <I.SendBackIcon />, enabled: canBackward, run: () => a().reorderSelection('back') },
      alignLeft: { label: 'Align left edges', icon: <I.AlignLeftIcon />, enabled: some, run: () => a().alignSelection('left') },
      alignCenter: { label: 'Align centres', icon: <I.AlignCenterIcon />, enabled: some, run: () => a().alignSelection('center') },
      alignRight: { label: 'Align right edges', icon: <I.AlignRightIcon />, enabled: some, run: () => a().alignSelection('right') },
      alignTop: { label: 'Align tops', icon: <I.AlignTopIcon />, enabled: some, run: () => a().alignSelection('top') },
      alignMiddle: { label: 'Align middles', icon: <I.AlignMiddleIcon />, enabled: some, run: () => a().alignSelection('middle') },
      alignBottom: { label: 'Align bottoms', icon: <I.AlignBottomIcon />, enabled: some, run: () => a().alignSelection('bottom') },
      distributeHorizontal: { label: 'Distribute across', icon: <I.DistributeHIcon />, enabled: count >= 3, run: () => a().distributeSelection('horizontal') },
      distributeVertical: { label: 'Distribute down', icon: <I.DistributeVIcon />, enabled: count >= 3, run: () => a().distributeSelection('vertical') },
      addSlide: { label: 'New slide', shortcut: 'mod+enter', icon: <I.PlusIcon />, enabled: true, run: () => a().addSlide() },
      duplicateSlide: { label: 'Duplicate slide', shortcut: 'mod+shift+d', icon: <I.DuplicateIcon />, enabled: true, run: () => a().duplicateSlide(currentSlide) },
      deleteSlide: { label: 'Delete slide', icon: <I.TrashIcon />, enabled: slideCount > 1, run: () => a().deleteSlide(currentSlide) },
      present: { label: 'Present', shortcut: 'mod+alt+p', icon: <I.PlayIcon />, enabled: true, run: () => startPresenting(() => a().setPresenting(true)) },
      save: { label: 'Save now', shortcut: 'mod+s', enabled: true, run: () => void sync.saveNow() },
    }
    // `key` stands for everything read from the store above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, store, sync])
}

/** A command as a menu item. Whether it is enabled is asked when the menu draws, not when it is built. */
export function menuItem(command: Command, label = command.label): MenuEntry {
  return {
    label,
    icon: command.icon,
    shortcut: command.shortcut,
    get disabled() {
      return !command.enabled
    },
    onSelect: command.run,
  }
}

/**
 * Full screen can only be asked for while handling the person's click or key, so it is asked for
 * here, before the presenter appears, rather than once it has.
 */
function startPresenting(show: () => void) {
  document.documentElement.requestFullscreen?.().catch(() => undefined)
  show()
}
