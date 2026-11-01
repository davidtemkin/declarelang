/**
 * The editor's keyboard shortcuts. Keys typed into a field, a menu or a dialog are left
 * alone; everything here is also on screen in a menu or a button.
 */
import { useEffect } from 'react';
import * as cmd from './commands';
import { editor, type Tool, useEditor } from './store';
import { activeSync } from './sync';

const TOOL_KEYS: Record<string, Tool> = { v: 'select', r: 'rect', o: 'ellipse', l: 'line', t: 'text' };

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !['checkbox', 'radio', 'button', 'range'].includes(target.type);
  return !!target.closest('[role="menu"], [role="dialog"]');
}

export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const state = useEditor.getState();
      if (state.presenting || e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // Saving and presenting work from anywhere, even from a field.
      if (mod && key === 's') {
        e.preventDefault();
        activeSync()?.saveNow();
        return;
      }
      if (isTypingTarget(e.target)) return;

      const run = (fn: () => void) => {
        e.preventDefault();
        fn();
      };

      if (mod) {
        if (key === 'z' && e.shiftKey) return run(editor.redo);
        if (key === 'z') return run(editor.undo);
        if (key === 'y') return run(editor.redo);
        if (key === 'a') return run(cmd.selectAll);
        if (key === 'c') return state.selection.length ? run(cmd.copySelection) : undefined;
        if (key === 'x') return state.selection.length ? run(cmd.cutSelection) : undefined;
        if (key === 'v') return run(cmd.paste);
        if (key === 'd') return run(cmd.duplicateSelection);
        if (key === 'g' && e.shiftKey) return run(cmd.ungroup);
        if (key === 'g') return run(cmd.group);
        if (e.key === 'Enter') return run(() => cmd.present());
        if (e.code === 'BracketRight') return run(() => cmd.changeOrder(e.shiftKey || e.altKey ? 'front' : 'forward'));
        if (e.code === 'BracketLeft') return run(() => cmd.changeOrder(e.shiftKey || e.altKey ? 'back' : 'backward'));
        return;
      }
      if (e.altKey) return;

      const step = e.shiftKey ? 10 : 1;
      const has = state.selection.length > 0;
      switch (e.key) {
        case 'Escape':
          if (state.tool !== 'select') return run(() => editor.setTool('select'));
          return run(cmd.clearSelection);
        case 'Delete':
        case 'Backspace':
          return has ? run(cmd.deleteSelection) : undefined;
        case 'ArrowLeft':
          return run(() => (has ? cmd.nudge(-step, 0) : cmd.goToSlide(-1)));
        case 'ArrowRight':
          return run(() => (has ? cmd.nudge(step, 0) : cmd.goToSlide(1)));
        case 'ArrowUp':
          return run(() => (has ? cmd.nudge(0, -step) : cmd.goToSlide(-1)));
        case 'ArrowDown':
          return run(() => (has ? cmd.nudge(0, step) : cmd.goToSlide(1)));
        case 'Enter': {
          // Enter on a selected text box starts typing in it.
          const only = state.selection.length === 1 ? state.selection[0] : null;
          const el = only ? cmd.selectedElements()[0] : null;
          if (el?.kind === 'text') return run(() => editor.startEditing(el.id));
          return;
        }
      }
      if (!e.shiftKey && TOOL_KEYS[key]) return run(() => editor.setTool(TOOL_KEYS[key]));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
