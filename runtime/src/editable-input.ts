// editable-input — how a native <input> or <textarea> reports what the person does to
// its text, shared by the DOM backend and canvas mode's overlay element. The rules
// are the ones measured in Chrome, Safari and Firefox (docs/system-design/
// editing-values.md §7):
//
// - a change that `beforeinput` describes (typing, paste, drop, a line break, a
//   single-character delete) is put to the spec's `admit` BEFORE it lands:
//   refused, it is cancelled and never enters the field's undo history; rewritten,
//   it is cancelled and the rewrite applied through the browser's own editing
//   command, which records it as one undoable step;
// - a change it can't describe beforehand — a composition (never touched while it
//   composes), a change with no `beforeinput` at all (autofill), undo and redo,
//   word and line deletes — lands, and is reported as UNCHECKED, for the field to
//   judge right after;
// - the element's value is written from the model only when it differs, never
//   during a composition, and keeping the caret's distance from the end.

import type { EditableSpec } from "./backend.js";

type Field = HTMLInputElement | HTMLTextAreaElement;

/** What a change would make the text, from `beforeinput` — or null when it can't
 *  be known beforehand (word and line deletes, history, anything unrecognised). */
function prospective(el: Field, ev: InputEvent): string | null {
  const t = ev.inputType, v = el.value;
  const s = el.selectionStart ?? v.length, e = el.selectionEnd ?? s;
  const data = ev.data ?? ev.dataTransfer?.getData("text/plain") ?? null;
  if (t === "insertLineBreak" || t === "insertParagraph") return v.slice(0, s) + "\n" + v.slice(e);
  if (t.startsWith("insert") && t !== "insertCompositionText" && data !== null) return v.slice(0, s) + data + v.slice(e);
  if (t === "deleteContentBackward" || t === "deleteContentForward" || t === "deleteByCut" || t === "deleteByDrag") {
    if (s !== e) return v.slice(0, s) + v.slice(e);
    if (t === "deleteByCut" || t === "deleteByDrag") return null;
    // one character (a whole code point), before or after the caret
    if (t === "deleteContentBackward") {
      if (s === 0) return v;
      const back = s >= 2 && /[\uDC00-\uDFFF]/.test(v[s - 1]) ? 2 : 1;
      return v.slice(0, s - back) + v.slice(s);
    }
    if (s >= v.length) return v;
    const fwd = /[\uD800-\uDBFF]/.test(v[s]) ? 2 : 1;
    return v.slice(0, s) + v.slice(s + fwd);
  }
  return null;
}

/** Replace the text with `next`, changing only the range that differs, through the
 *  browser's editing command so it is one undoable step; the caret goes after what
 *  was inserted. Falls back to a plain write (not undoable) where the command is
 *  unavailable. */
export function applyEditableText(el: Field, next: string): void {
  const v = el.value;
  if (v === next) return;
  let p = 0;
  while (p < v.length && p < next.length && v[p] === next[p]) p++;
  let q = 0;
  while (q < v.length - p && q < next.length - p && v[v.length - 1 - q] === next[next.length - 1 - q]) q++;
  const APPLYING = (el as Field & { $applying?: number });
  APPLYING.$applying = (APPLYING.$applying ?? 0) + 1;
  try {
    el.setSelectionRange(p, v.length - q);
    const ok = typeof document.execCommand === "function" && document.execCommand("insertText", false, next.slice(p, next.length - q));
    if (!ok || el.value !== next) {
      el.value = next;
      const at = next.length - q;
      el.setSelectionRange(at, at);
    }
  } finally { APPLYING.$applying! -= 1; }
}

/** Write the model's text into the element: only when it differs, never while the
 *  person is composing, keeping the caret's distance from the end of the text. */
export function setEditableValue(el: Field, value: string): void {
  if (el.value === value || (el as Field & { $composing?: boolean }).$composing === true) return;
  const focused = el.ownerDocument.activeElement === el;
  const fromEnd = focused ? el.value.length - (el.selectionEnd ?? el.value.length) : 0;
  el.value = value;
  (el as Field & { $synced?: () => void }).$synced?.();
  if (focused) {
    const at = Math.max(0, value.length - fromEnd);
    try { el.setSelectionRange(at, at); } catch { /* input types without selection */ }
  }
}

/** Wire the element's editing events to the spec the getter returns. The spec's
 *  `onInput(value, checked)` hears every change once it has landed: `checked` when
 *  `admit` already saw it, false when it couldn't (the field then judges it). */
export function wireEditableInput(el: Field, spec: () => EditableSpec | null): void {
  const F = el as Field & { $applying?: number; $composing?: boolean };
  let checked = false;
  let reported = el.value;
  const report = (isChecked: boolean): void => {
    const s = spec();
    if (s === null || el.value === reported) { reported = el.value; return; }
    reported = el.value;
    s.onSelect?.(el.selectionStart ?? 0, el.selectionEnd ?? 0);
    s.onInput(el.value, isChecked);
  };
  el.addEventListener("beforeinput", (e) => {
    const ev = e as InputEvent;
    if ((F.$applying ?? 0) > 0) { checked = true; return; }   // our own rewrite: already admitted
    if (ev.isComposing || ev.inputType === "insertCompositionText" || ev.inputType === "deleteCompositionText") return;
    const s = spec();
    const admit = s?.admit;
    const next = prospective(el, ev);
    if (admit === undefined || next === null) { checked = false; return; }
    const r = admit(next);
    if (r === null || (r === el.value && next !== el.value)) {
      if (ev.cancelable) { ev.preventDefault(); return; }
      checked = false; return;   // can't be stopped: judged once it lands
    }
    if (r === next) { checked = true; return; }
    if (!ev.cancelable) { checked = false; return; }
    ev.preventDefault();
    applyEditableText(el, r);
  });
  el.addEventListener("compositionstart", () => { F.$composing = true; });
  el.addEventListener("compositionend", () => {
    F.$composing = false;
    // the finished composition is one change, judged once it has landed: the last
    // `input` of a composition arrives before this (Chrome) or after it (Safari)
    setTimeout(() => report(false), 0);
  });
  el.addEventListener("input", (e) => {
    const ev = e as InputEvent;
    if (ev.isComposing || F.$composing === true) return;
    const was = checked;
    checked = false;
    report(was || (F.$applying ?? 0) > 0);
  });
  // the model writing the element (setEditableValue) is not a change of the person's
  const sync = (): void => { reported = el.value; };
  (el as Field & { $synced?: () => void }).$synced = sync;
}
