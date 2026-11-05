The platform's own editable text, inside a view of yours: placed as a child, it makes **that
view** a native text field (an input on the page, an overlay in canvas mode, an AppKit field on
the Mac), so the caret, selection, input methods, the clipboard, undo, autofill and
accessibility are the platform's. It is what the library's `TextInput` is made of; use
`TextInput` unless you are building a field of your own.

**The view is the field, not this node.** The view keeps the focus, `focused`, its own
`onFocus`/`onBlur`/`onKeyDown`, its box and its padding; this node only carries text across
the platform's edge, both ways:

- **Down:** `text` is what the field shows — constrain it (`text = { classroot.shown }`). It is
  written into the element only when it differs, and never during an input method's
  composition.
- **Up:** each change the person makes is put to the **view's** `admit(t)` before it lands,
  where the platform describes the change beforehand (typing, paste, a delete, a line break),
  and reported once it has landed to the view's `_typed(t)`. A change that can't be described
  beforehand — a composition, autofill, undo — lands and is judged by `admit` right after; a
  refused one goes back, a rewritten one is applied, each as one undoable step.

So the view it rides answers to `admit(t)` (returning the text to show, or `null` to refuse),
`_typed(t)`, `endEdit()`, `onEnter()`, `disabled` and `padding` — the members a
`ValueControl` has (library/valuecontrol.declare), which is why a field of your own extends it:

```declare-fragment
class CodeBox extends ValueControl [ value: string = "", fieldValue = { value },
    commit(t: string) { value = t },
    _typed(t: string) { if (!editing) beginEdit(); _take(t); if (!focused) endEdit() },
    _native: NativeText [ text = { "" + (classroot.shown ?? "") }, multiline = true, wrap = false ]
    ]
```

The face — font, size, weight, colour — is the provided face values', as any text leaf's is.

## text
**What the field shows**, the view's to constrain. A change the person makes does not write
it; it reaches the view (`_typed`), and the view's constraint brings it back.

## placeholder
The grey prompt shown while the field is empty.

## multiline
A multi-line area rather than a single line; Return then types a line break unless
`enterSubmits`.

## wrap
For a multi-line field, whether long lines wrap (`true`) or scroll sideways (`false`).

## enterSubmits
For a multi-line field: Return ends the edit and calls the view's `onEnter`, and Shift-Return
types the line break.

## spellcheck
The platform's spell-check underline. A field whose `purpose` is not prose is never
spell-checked, whatever this says.

## purpose
What the field holds, for autofill, password managers and a phone's keyboard — the tokens are
`TextInput.purpose`'s.

## concealed
What is typed is hidden, as a password is. Follows `purpose` until set.

## textColor
The colour of the text, the nearest provided value unless set — so setting `textColor` on the
field view colours what is typed, as it colours a `Text` inside it.

## fontSize
The text's size, the nearest provided value unless set.

## fontFamily
The text's family (or a list of them), the nearest provided value unless set.

## fontWeight
The text's weight, the nearest provided value unless set.

## letterSpacing
Extra space between letters, the nearest provided value unless set.

## numeralWidth
The digits' advance, as on `Text`.

## textAlign
Where the text sits across the field, as on `Text`.

## italic
The text slants, as on `Text`.

## selectionStart
**Read-only.** Where the selection starts, as an index into `text`, reported as the person
moves it.

## selectionEnd
**Read-only.** Where the selection ends; equal to `selectionStart` for a bare caret.

## textHeight
**Read-only.** The height of the text's lines at the field's face, padding excluded — what a
view with this node and no height of its own sizes to, plus its padding.

## select()
`select(at, end?)` — place the caret or select a range: `select(7)`, `select(3, 9)`,
`select("start")`, `select("end")`, `select("all")`. Applied at once while the view holds
focus; otherwise held for its next non-pointer focus.
