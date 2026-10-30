// TextInput — the editable text field (docs/system-design/input.md, Layer 3). The top
// of the input stack: a focus client (Layer 2) whose `text` is the MODEL source
// of truth, realized by the backend as a native editable element (DOM in-box, a
// canvas overlay) so caret, selection, clipboard, IME, and accessibility are
// native — the ruled D-5 approach (OL5's static-measured-text + DOM overlay,
// here always-live for v1). No two-way operator (D-6 dropped): edits flow
// native → model through `onInput`; a `text` bound to a constraint is a
// controlled, read-only field (edits revert).
//
// Two directions of focus sync: Declare focus → the native caret (focusChanged →
// activateEditable) and the native caret → Declare focus (a click into the field
// fires the element's focus → Focus.focus(this)). The keyboard itself needs no
// wiring here — deliverKeys (Layer 2) already routes keys to the focused view;
// the native element consumes character input directly while it holds the
// caret.

import { View, fireEvent, onDiscard } from "./view.js";
import type { RenderBackend, Surface, EditableSpec } from "./backend.js";
import { bindDerived, defineAttributes, isSet, ownerOf, providedDefault, providedRead } from "./attributes.js";
import { Constraint, settle } from "./reactive.js";
import { Focus } from "./focus.js";
import { fontMetrics, fontString, wrapEditable, type TextStyle, type FontWeight } from "./measure.js";
import { heldFamily, type FamilyValue } from "./font-value.js";
import { isTwoWay, edited, commitDraft, revertDraft, judgeDraft, runValidate, floorError } from "./editor.js";
import { insetSides, stroke, type Color, type Inset } from "./value.js";
import { hintsOf, type Purpose } from "./purpose.js";
import type { NumeralWidth } from "./font-features.js";

export class TextInput extends View {
  // The FACE slots (off View — docs/system-design/style.md): each defaults to
  // the nearest provided value, so a field inherits its region's text style.
  declare textColor: Color;
  declare fontSize: number;
  /** A family string, a Font, or a list of them. */
  declare fontFamily: FamilyValue;
  declare fontWeight: FontWeight;
  declare letterSpacing: number;
  /** The digits' advance: "tabular" lines figures up (a card number, an amount). */
  declare numeralWidth: NumeralWidth;
  declare selectable: boolean;
  declare text: string;
  declare placeholder: string;
  declare multiline: boolean;
  declare enterSubmits: boolean;
  /** The native selection, read-only: where it starts and ends (equal for a
   *  bare caret). Reported by the backend as the user moves it; `select()` is
   *  the write half. */
  declare selectionStart: number;
  declare selectionEnd: number;
  declare spellcheck: boolean;
  /** What the field holds — an email, a password, a card number (purpose.ts). */
  declare purpose: Purpose;
  /** What is typed is hidden; a password's purpose sets it. */
  declare concealed: boolean;
  declare wrap: boolean;
  declare padding: Inset;
  declare initial: string;
  /** Inert: not focusable, takes no edits, and says so to assistive technology. */
  declare disabled: boolean;

  // ── the edit session (editor.ts): `text` is the draft ──
  /** "input" (live) | "blur" | "enter" | "manual" — when a valid draft commits. */
  declare commitOn: string;
  /** What is wrong with the value now, "" when nothing is: the refusal, then
   *  `required`, then `validate`, then the schema floor (reactive). */
  declare problem: string;
  /** `problem` once judged — the default display rule (reactive). */
  declare error: string;
  /** Is `problem` empty? (reactive) */
  declare valid: boolean;
  /** Has the field been judged: left, `judge()`d, or submitted with its form. Writable. */
  declare judged: boolean;
  /** The field's address in its form: the key a service names it by. */
  declare name: string;
  /** `true`, or the message to say, when the field may not be left empty. */
  declare required: boolean | string;
  /** An outside message about the value — a service's refusal. It counts while
   *  the value is the one refused. */
  declare refused: string;
  /** The form this field belongs to: the nearest `Form` above, unless set. */
  declare form: View | null;
  /** The value `refused` was said of (captured when it is written). */
  $refusedValue: unknown = undefined;
  /** Does the draft differ from the committed value? (reactive) */
  declare dirty: boolean;

  /** The field's element holds what is typed, the selection and focus. */
  protected override $eagerSurface(): boolean { return true; }

  /** @api Commit the current draft into the bound dataset field, if it
   *  validates — for a `commitOn = "manual"` field or a Save button. */
  commit(): void { commitDraft(this, "text"); }

  /** @api Discard edits — reset the field to the committed dataset value. */
  revert(): void { revertDraft(this, "text"); }

  /** @api Say what is wrong with the draft now, without waiting for the field
   *  to be left — for a Save or a Pay that checks every field. */
  judge(): void { judgeDraft(this, "text"); }

  /** @api Say an outside message about the current value — a service's
   *  refusal. It is the field's `problem` until the value changes; `""`
   *  withdraws it. A form's `refuse` lays a service's problems this way. */
  refuse(message: string): void {
    this.refused = "";
    this.$refusedValue = this.text;
    this.refused = message;
  }

  /** Install the judging derives — `problem`, `valid`, `error` — once: at
   *  attach, or on the first edit-session refresh of a field never attached. */
  $judging(): void {
    if (this.$judges) return;
    this.$judges = true;
    bindDerived(this, "problem", () => this.$problem());
    bindDerived(this, "valid", () => this.problem === "");
    bindDerived(this, "error", () => (this.judged ? this.problem : ""));
  }
  private $judges = false;

  /** What is wrong with the value now — the one rule `problem` derives. */
  private $problem(): string {
    const text = this.text;
    if (this.refused !== "" && text === this.$refusedValue) return this.refused;
    const req = this.required;
    if (req !== false && req !== "" && text.trim() === "") return typeof req === "string" ? req : "Required";
    return runValidate(this, text) ?? floorError(this, "text") ?? "";
  }

  override $attach(backend: RenderBackend, parentSurface: Surface | null, before: Surface | null = null): void {
    // A text field is a tab stop by default, and not while disabled; an
    // explicit `focusable` (was-set or bound) opts out untouched, exactly like
    // Text's auto-size.
    if (!isSet(this, "focusable") && ownerOf(this, "focusable") === null) bindDerived(this, "focusable", () => !this.disabled);
    super.$attach(backend, parentSurface, before);
    // Uncontrolled seed: unless the author bound or hard-set `text`, it
    // follows `initial` via a YIELDING derive — reactive, so a source that
    // arrives late fills the field — disposed on the first edit
    // (onNativeInput) so typing takes over; a programmatic `text` write
    // displaces it the same way (own()'s yielding-replace). The guard is
    // text-side ONLY: probing whether `initial` is set at attach raced
    // constraint installation on windowed creation (a late-batch grid cell
    // attached before its `initial` constraint installed, so the seed never
    // bound and the field stayed empty); following the default "" until an
    // initial arrives is the same observable behavior, race-free.
    // …and never for a TWO-WAY field: `text <-> :title` seeds `text` from the
    // record before attach (editor.ts's reseed), and the derive installed here
    // displaced that seed with `initial`'s "" — the field opened empty while the
    // record said "Untitled" (the docs' twoway demo, 2026-09-10). A bound field's
    // seed is its record's.
    if (!isSet(this, "text") && ownerOf(this, "text") === null && !isTwoWay(this, "text")) {
      bindDerived(this, "text", () => this.initial);
    }
    // What is wrong, and whether to say so (editor.ts, forms): `problem` is
    // the truth now — the refusal, `required`, the field's own `validate`,
    // the schema floor — and reactive over whatever `validate` reads; `valid`
    // is its emptiness; `error` is the default display rule, `problem` once
    // the field is judged (a field that speaks at every edit is judged from the start).
    this.$judging();
    if (!isSet(this, "accessibilityRequired") && ownerOf(this, "accessibilityRequired") === null)
      bindDerived(this, "accessibilityRequired", () => this.required !== false && this.required !== "");
    // Membership (library form.declare): the field joins the form it is in,
    // and reports itself to the Field around it, through the members those
    // classes declare — the same protocol a library ValueControl keeps.
    let joined: View | null = null;
    const member = new Constraint("TextInput.form", () => this.form, (f) => {
      if (joined === f) return;
      (joined as unknown as { _leave?: (c: View) => void } | null)?._leave?.(this);
      joined = f as View | null;
      (joined as unknown as { _join?: (c: View) => void } | null)?._join?.(this);
    }, 0);
    let held: View | null = null;
    const field = new Constraint("TextInput.field", () => providedRead(this, "_field", true, null), (f) => {
      if (held === f) return;
      (held as unknown as { _release?: (c: View) => void } | null)?._release?.(this);
      held = f as View | null;
      (held as unknown as { _hold?: (c: View) => void } | null)?._hold?.(this);
    }, 0);
    member.run();
    field.run();
    onDiscard(this, () => {
      member.dispose();
      field.dispose();
      (joined as unknown as { _leave?: (c: View) => void } | null)?._leave?.(this);
      (held as unknown as { _release?: (c: View) => void } | null)?._release?.(this);
    });
    // The house FIELD rendition (library-charter §6: a bare TextInput must
    // carry real visual articulation — today's edgeless default is a defect).
    // Same YIELDING-derive pattern as the seed above: reactive on the
    // provided theme and on focus, displaced the moment the author assigns
    // the slot. Surface fill, a 1px line edge that turns accent when the
    // field holds keyboard focus, the theme's controlCornerRadius geometry token.
    const tok = (name: string, fallback: number): number => {
      // The house field chrome reads the PROVIDED theme (a class-library
      // value now — off View); unprovided it is null and the fallbacks below
      // stand in, so a bare, library-free TextInput still renders articulated.
      // Read inside the derives, so a provided theme change re-styles the field.
      const theme = providedRead(this, "theme", true, null) as Record<string, unknown> | null;
      const v = theme?.[name];
      return typeof v === "number" ? v : fallback;
    };
    // a password is hidden unless the author shows it (a reveal toggle sets `concealed`)
    if (!isSet(this, "concealed") && ownerOf(this, "concealed") === null)
      bindDerived(this, "concealed", () => hintsOf(this.purpose).concealed);
    if (!isSet(this, "fill") && ownerOf(this, "fill") === null)
      bindDerived(this, "fill", () => tok("surface", 0xFFFFFF));
    // what is wrong with the value is said with the field, as it is shown
    if (!isSet(this, "accessibilityError") && ownerOf(this, "accessibilityError") === null)
      bindDerived(this, "accessibilityError", () => this.error);
    if (!isSet(this, "stroke") && ownerOf(this, "stroke") === null)
      bindDerived(this, "stroke", () => stroke(1, this.error !== "" ? tok("error", 0xC93429) : this.focused ? tok("accent", 0x2E6FE0) : tok("line", 0xDBE1E9)));
    if (!isSet(this, "cornerRadius") && ownerOf(this, "cornerRadius") === null)
      bindDerived(this, "cornerRadius", () => tok("fieldCornerRadius", tok("controlCornerRadius", 7)));
    if (!isSet(this, "padding") && ownerOf(this, "padding") === null)
      bindDerived(this, "padding", () => tok("fieldPadding", 10));
    // An unset HEIGHT auto-sizes to the text — the same rule Text follows and
    // the same rule View states generally (a box's size defaults to its
    // measured content), through the same yielding bind as the rendition
    // above, so a declared height still wins outright. That is the ordinary
    // case and stays so: a field is normally a fixed viewport the platform
    // scrolls. What it fixes is the field whose text IS the content — a code
    // listing, a note — which had no way to say "as tall as what I hold"
    // short of counting lines by hand; and a bare field, whose unset height
    // was 0 (auto-extent over a view with no children), i.e. invisible.
    //
    // Height only. Auto-WIDTH is deliberately not offered: a box that resized
    // itself under the caret as you typed is nobody's idea of a text field.
    //
    // The measure is `wrapEditable` — the model's approximation of the wrap
    // the NATIVE element will perform, which is a different rule from the one
    // a box of text follows (measure.ts). Where it under-counts — wrapLines
    // lists what the breaker does not know — the field scrolls, which is
    // exactly today's behavior, so this degrades to the status quo rather
    // than to a broken layout.
    if (!isSet(this, "height") && ownerOf(this, "height") === null) {
      bindDerived(this, "height", () => {
        const font = fontString(this.$editStyle());
        const met = fontMetrics(font);
        const [t, r, b, l] = insetSides(this.padding);
        const inner = this.width - l - r;
        const lines = !this.multiline ? 1
          : this.wrap && inner > 0
            ? wrapEditable(this.text, font, inner, this.letterSpacing).length
            : this.text.split("\n").length;
        return Math.ceil(lines * (met.ascent + met.descent) + t + b);
      });
    }
  }

  protected override $flush(s: Surface): void {
    super.$flush(s);
    // The style is the cold, provided path (like Text): a standing derive
    // over the four text slots so a provider re-rooting above re-styles the
    // field. It reads the slots under tracking; the apply re-syncs the element.
    const style = new Constraint(
      "TextInput.editStyle",
      () => this.$editStyle(),
      () => this.$syncEditable(),
      0
    );
    style.run();
    onDiscard(this, () => style.dispose());
    this.$syncEditable();
  }

  private $editStyle(): TextStyle {
    return {
      fontFamily: heldFamily(this, "fontFamily", this.fontFamily),
      fontSize: this.fontSize,
      fontWeight: this.fontWeight,
      letterSpacing: this.letterSpacing,
      color: this.textColor,
      shadow: null,
      ...(this.numeralWidth !== "normal" ? { numeralWidth: this.numeralWidth } : {}),
    };
  }

  /** Push the whole editable spec across the seam — value, style, callbacks.
   *  Idempotent and cheap; called on any model change (text/placeholder/
   *  multiline pushes, the style derive) and at flush. */
  $syncEditable(): void {
    const s = this.$surface;
    if (s === undefined || s === null) return;
    const spec: EditableSpec = {
      value: this.text,
      multiline: this.multiline,
      spellcheck: this.spellcheck,
      purpose: this.purpose,
      concealed: this.concealed,
      wrap: this.wrap,
      padding: this.padding,
      placeholder: this.placeholder,
      style: this.$editStyle(),
      enterSubmits: this.enterSubmits,
      enterHint: this.multiline || this.form === null ? "" : String((this.form as unknown as { _enterHint?: (c: View) => string })._enterHint?.(this) ?? ""),
      disabled: this.disabled,
      onInput: (v) => this.$onNativeInput(v),
      // The native element ECHOES focus the runtime just gave it (Tab →
      // focusChanged → el.focus() → this event). Re-announcing the already-
      // focused view through Focus.focus() would clear keyboard modality —
      // every Tab into a field cancelling its own focus-visible state — so
      // the echo is silenced HERE, at its source; a genuine first focus from
      // the element (a click into the field) still claims normally.
      onFocus: () => { if (Focus.getFocus() !== this) Focus.focus(this); },
      onBlur: () => {
        // a field hidden or disabled under focus is the focus service's to settle
        // (rewatch): it clears focus and gives it where the program says
        if (Focus.getFocus() === this && Focus.reaches(this)) Focus.blur();
        if (this.commitOn === "blur" && isTwoWay(this, "text")) commitDraft(this, "text");
        judgeDraft(this, "text");
      },
      onEnter: () => {
        if (this.commitOn === "enter" && isTwoWay(this, "text")) commitDraft(this, "text");
        // Return in a single-line field submits its form, as on the web —
        // unless the field says what Return does itself (an `onEnter`).
        const own = typeof (this as unknown as { onEnter?: unknown }).onEnter === "function";
        fireEvent(this, "enter");
        // (a form whose Return moves on takes the field to the next: Form.enterMoves)
        if (!own && !this.multiline && this.form !== null) {
          const f = this.form as unknown as { _enter?: (c: View) => void; submit?: () => void };
          if (typeof f._enter === "function") f._enter(this); else f.submit?.();
        }
      },
      onSelect: (start, end) => {
        if (this.selectionStart !== start) this.selectionStart = start;
        if (this.selectionEnd !== end) this.selectionEnd = end;
      },
    };
    s.setEditable(spec);
  }

  /** The native element's value changed. A writable `text` takes the edit; a
   *  HARD constraint makes text a controlled, read-only field — revert the
   *  element to the model. A YIELDING default (a `{ }` the field merely STARTS
   *  from — a theme value, a pristine source) is overridable: the edit disposes
   *  it, exactly like any author write (attributes.ts set path), so a field can
   *  be seeded from a binding yet stay editable. */
  private $onNativeInput(v: string): void {
    // A disabled field takes no edits, whatever reached the element (a host
    // that cannot disable its native field yet): put the model's text back.
    if (this.disabled) { this.$syncEditable(); return; }
    const owner = ownerOf(this, "text");
    if (owner !== null && !owner.yielding) {
      // CONTROLLED — the constraint owns the slot, so the keystroke does NOT
      // land in `text`. That much is right: a `{ }` is the value's source and an
      // edit cannot overwrite it. But the attempt is still the only news the
      // program gets, and this path used to revert and return without firing —
      // so `text = { app.who }` plus an `onInput` handler was a DEAD field: no
      // edit, no event, no error at any rung, and no way for the app to drive
      // the field at all (it could not even clear a form). The event is the
      // whole mechanism of the controlled pattern — the handler writes the slot
      // the constraint reads, and the new value arrives back through it.
      //
      // Fire, settle, THEN reconcile: if the handler moved the model the
      // element lands on the new value directly, rather than flashing the old
      // one and correcting a beat later.
      this.$inInput = true;
      try { fireEvent(this, "input", v); settle(); this.$syncEditable(); }
      finally { this.$inInput = false; }
      this.$applySelection();
      return;
    }
    if (this.text !== v) this.text = v;
    // A two-way (`<->`) field runs its edit session FIRST — refresh
    // dirty/valid/error and commit the draft to the dataset per `commitOn`
    // (editor.ts) — so the user's `onInput` handler below sees the model already
    // settled (the committed value in the dataset), not a value about to change.
    if (isTwoWay(this, "text")) edited(this, "text", this.commitOn);
    this.$inInput = true;
    try { fireEvent(this, "input", v); }
    finally { this.$inInput = false; }
    this.$applySelection();
  }

  /** An input handler is running: a select() it makes waits until the field
   *  holds the text the handler produced, so the caret lands in that text. */
  private $inInput = false;

  /** The field's text folds into `contentHeight` as its measured lines (the
   *  same measure as the unset-height derive), so the documented cap reads as
   *  it does for any box: `height = { Math.min(contentHeight, 120) }` — a
   *  multi-line field that grows with its text, then scrolls. */
  protected override $contentExtent(size: "width" | "height"): number {
    if (size === "width") return super.$contentExtent(size);
    const font = fontString(this.$editStyle());
    const met = fontMetrics(font);
    const [, r, , l] = insetSides(this.padding);
    const inner = this.width - l - r;
    const lines = !this.multiline ? 1
      : this.wrap && inner > 0
        ? wrapEditable(this.text, font, inner, this.letterSpacing).length
        : this.text.split("\n").length;
    return Math.ceil(lines * (met.ascent + met.descent));
  }

  /** Declare focus arrived/left — give or take the platform caret (Layer 2 hook,
   *  separate from the author's onFocus/onBlur). A held select() applies HERE,
   *  after activation — so Tab and programmatic focus land where the program
   *  said. A pointer CLICK is the exception, by the platform's own ordering:
   *  the browser places the click's caret at mouseup, after focus handlers —
   *  and that is the right ranking, because a deliberate click names a spot. */
  override $focusChanged(focused: boolean): void {
    // the Return key's word depends on where the field sits in its form: said as it is focused
    if (focused && this.form !== null) this.$syncEditable();
    this.$surface?.activateEditable(focused);
    if (focused) this.$applySelection();
  }

  /** Place the caret or select a range (#22) — the write half of the native
   *  selection, one verb: a caret IS a zero-length range. `select(7)` puts the
   *  caret at 7; `select(3, 9)` selects the range; the word forms need no
   *  lengths — `select("start")`, `select("end")`, `select("all")`. Numbers
   *  clamp to the text, like every scroll write. Applied now if the field
   *  holds focus; otherwise HELD and applied at the next non-pointer focus
   *  (Tab, or a program's), re-resolved against the text of that moment — a
   *  click into the field keeps the clicked caret. Called from an input
   *  handler, it applies once the field shows the text the handler wrote. */
  select(at: number | "start" | "end" | "all", end?: number): void {
    this.pendingSel = { at, end };
    if (this.focused && !this.$inInput) this.$applySelection();
  }

  private pendingSel: { at: number | "start" | "end" | "all"; end?: number } | null = null;

  private $applySelection(): void {
    const p = this.pendingSel;
    if (p === null) return;
    this.pendingSel = null;
    const len = this.text.length;
    const clamp = (n: number): number => Math.max(0, Math.min(len, Math.floor(n)));
    const [s, e] =
      p.at === "start" ? [0, 0]
      : p.at === "end" ? [len, len]
      : p.at === "all" ? [0, len]
      : [clamp(p.at), clamp(p.end ?? p.at)];
    this.$surface?.setSelection?.(Math.min(s, e), Math.max(s, e));
  }
}

defineAttributes(TextInput, {
  textColor: { def: 0x000000, defBinding: providedDefault("textColor", 0x000000) },
  fontSize: { def: 16, defBinding: providedDefault("fontSize", 16) },
  fontFamily: { def: "sans-serif", defBinding: providedDefault("fontFamily", "sans-serif") },
  fontWeight: { def: "normal", defBinding: providedDefault("fontWeight", "normal") },
  letterSpacing: { def: 0, defBinding: providedDefault("letterSpacing", 0) },
  selectable: { def: false, defBinding: providedDefault("selectable", false) },
  // a field's name, unless it is given one: the caption a Field around it provides
  ...((typeof __DECLARE_ACCESSIBILITY__ === "undefined" || __DECLARE_ACCESSIBILITY__) ? { accessibilityLabel: { def: "", defBinding: providedDefault("fieldLabel", "") } } : {}),
  text: { def: "", push: (t) => t.$syncEditable() },
  placeholder: { def: "", push: (t) => t.$syncEditable() },
  multiline: { def: false, push: (t) => t.$syncEditable() },
  enterSubmits: { def: false, push: (t) => t.$syncEditable() },
  spellcheck: { def: true, push: (t) => t.$syncEditable() },
  purpose: { def: "text", push: (t) => t.$syncEditable() },
  concealed: { def: false, push: (t) => t.$syncEditable() },
  wrap: { def: true, push: (t) => t.$syncEditable() },
  // the field's content box, as View's: where the text sits inside it
  padding: { def: 0, push: (t, p) => {
    const [top, r, b, l] = insetSides(p as Inset);
    t.$insetX = l + r;
    t.$insetY = top + b;
    t.$syncEditable();
  } },
  initial: { def: "" },
  numeralWidth: { def: "normal" },
  selectionStart: { def: 0 },
  selectionEnd: { def: 0 },
  disabled: { def: false, push: (t) => t.$syncEditable() },
  commitOn: { def: "input" },
  problem: { def: "" },
  error: { def: "" },
  valid: { def: true },
  dirty: { def: false },
  judged: { def: false },
  name: { def: "" },
  required: { def: false },
  // read-only: a refusal is said through refuse(), which remembers the text it was said of
  refused: { def: "" },
  form: { def: null, defBinding: providedDefault("_form", null) },
});

// what a TextInput is to assistive technology (View.$leafRole), in a build with the layer
if (typeof __DECLARE_ACCESSIBILITY__ === "undefined" || __DECLARE_ACCESSIBILITY__) TextInput.prototype.$leafRole = () => "textField";
