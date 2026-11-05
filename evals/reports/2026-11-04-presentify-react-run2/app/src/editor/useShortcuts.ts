import { useEffect } from 'react'
import type { StoreApi } from 'zustand/vanilla'
import { findElement, parentIdOf } from '../model/elements'
import { isMod } from '../ui/shortcuts'
import { TOOLS } from './chrome/tools'
import type { Commands } from './commands'
import { currentElements, type EditorState } from './store'

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
}

/** The editor's keyboard. Each key runs the same command its button or menu item does. */
export function useShortcuts(store: StoreApi<EditorState>, commands: Commands) {
  useEffect(() => {
    const run = (e: KeyboardEvent, id: keyof Commands) => {
      e.preventDefault()
      if (commands[id].enabled) commands[id].run()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const s = store.getState()
      if (s.presenting || e.defaultPrevented) return
      const mod = isMod(e)
      const key = e.key.toLowerCase()

      // These work everywhere, even while typing.
      if (mod && key === 's') return run(e, 'save')
      if (s.editingTextId && mod && key === 'z') return run(e, e.shiftKey ? 'redo' : 'undo')
      if (isTyping(e.target)) return
      // Inside an open menu or dialog, its own keys apply.
      if ((e.target as HTMLElement | null)?.closest?.('[role="menu"], [role="dialog"], [role="listbox"][data-radix-select-viewport]')) return

      if (mod) {
        if (key === 'z') return run(e, e.shiftKey ? 'redo' : 'undo')
        if (key === 'y') return run(e, 'redo')
        if (key === 'c') return run(e, 'copy')
        if (key === 'x') return run(e, 'cut')
        if (key === 'v') return run(e, 'paste')
        if (key === 'd') return run(e, e.shiftKey ? 'duplicateSlide' : 'duplicate')
        if (key === 'a') return run(e, 'selectAll')
        if (key === 'g') return run(e, e.shiftKey ? 'ungroup' : 'group')
        if (e.code === 'BracketRight') return run(e, e.shiftKey ? 'bringToFront' : 'bringForward')
        if (e.code === 'BracketLeft') return run(e, e.shiftKey ? 'sendToBack' : 'sendBackward')
        if (key === 'enter') return run(e, 'addSlide')
        if (e.altKey && e.code === 'KeyP') return run(e, 'present')
        return
      }

      if (key === 'backspace' || key === 'delete') return run(e, 'delete')

      if (key.startsWith('arrow') && s.selection.length > 0) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0
        s.actions.nudge(dx, dy, e.repeat)
        return
      }

      if (key === 'escape') {
        e.preventDefault()
        if (s.tool !== 'select') s.actions.setTool('select')
        else if (s.scope) {
          // Step out of an open group, leaving the group selected.
          s.actions.select([s.scope], parentIdOf(currentElements(s), s.scope))
        } else s.actions.clearSelection()
        return
      }

      if (key === 'enter' && s.selection.length === 1) {
        const el = findElement(currentElements(s), s.selection[0])
        if (el?.kind === 'text') {
          e.preventDefault()
          s.actions.beginTextEditing(el.id)
        } else if (el?.kind === 'group') {
          e.preventDefault()
          s.actions.select([el.children[0].id], el.id)
        }
        return
      }

      if (!e.altKey && !e.ctrlKey && !e.metaKey) {
        const tool = TOOLS.find((t) => t.key === key) ?? (key === 'e' ? TOOLS.find((t) => t.tool === 'ellipse') : undefined)
        if (tool) {
          e.preventDefault()
          s.actions.setTool(tool.tool)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [store, commands])
}
