// Recording a session, or correcting one. Built for a thumb: everything is a
// choice or a nudge, the likely answer is already filled in, and the save
// button always says what it's about to do — or what's still missing.

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type PointerEvent } from "react";
import { SPORTS, type Session, type SessionInput, type Sport } from "../api";
import { relativeDay, toDay, toIso, WEEKDAYS, weekday, type Day } from "../lib/dates";
import { distance as formatKm, duration as formatMinutes, SPORT_NAME } from "../lib/format";
import { estimateKm, isHard, likelySport, sportHabit } from "../lib/stats";
import { useCreateSession, useUpdateSession } from "../hooks/useHistory";
import { effortFill } from "./EffortMeter";
import "./SessionForm.css";

interface Props {
  sessions: Session[];
  today: Day;
  /** The session being corrected; absent when recording a new one. */
  editing?: Session;
  onSaved(session: Session): void;
}

const KM_STEP: Record<Sport, number> = { run: 0.5, ride: 1, swim: 0.1, lift: 0 };
const RECENT_DAYS = 7;

export function SessionForm({ sessions, today, editing, onSaved }: Props) {
  const create = useCreateSession();
  const update = useUpdateSession();
  const mutation = editing ? update : create;

  const initialSport = editing?.sport ?? likelySport(sessions, today);
  const initialHabit = sportHabit(sessions, initialSport);

  const [sport, setSport] = useState<Sport>(initialSport);
  const [date, setDate] = useState(editing?.date ?? toIso(today));
  const [minutes, setMinutes] = useState<number>(editing?.minutes ?? initialHabit.minutes);
  const [km, setKm] = useState<number | null>(
    editing ? editing.distanceKm : estimateKm(initialHabit, initialSport, initialHabit.minutes),
  );
  const [effort, setEffort] = useState(editing?.effort ?? initialHabit.effort);
  const [note, setNote] = useState(editing?.note ?? "");
  const [noteOpen, setNoteOpen] = useState(Boolean(editing?.note));
  // Until a field is touched it keeps following the likeliest answer.
  const [touched, setTouched] = useState({ minutes: !!editing, km: !!editing, effort: !!editing });

  const habit = useMemo(() => sportHabit(sessions, sport), [sessions, sport]);

  const chooseSport = (next: Sport) => {
    setSport(next);
    const h = sportHabit(sessions, next);
    const m = touched.minutes ? minutes : h.minutes;
    if (!touched.minutes) setMinutes(m);
    if (!touched.effort) setEffort(h.effort);
    if (next === "lift") setKm(null);
    else if (!touched.km || km === null) setKm(estimateKm(h, next, m));
  };

  const changeMinutes = (m: number) => {
    const next = Math.max(1, Math.min(600, Math.round(m)));
    setMinutes(next);
    setTouched((t) => ({ ...t, minutes: true }));
    // Distance follows duration until it has been set by hand.
    if (!touched.km && sport !== "lift") setKm(estimateKm(habit, sport, next));
  };

  const changeKm = (value: number | null) => {
    setKm(value === null ? null : Math.max(0, Math.round(value * 10) / 10));
    setTouched((t) => ({ ...t, km: true }));
  };

  const changeEffort = (e: number) => {
    setEffort(e);
    setTouched((t) => ({ ...t, effort: true }));
  };

  // What still stands between the person and a saved session. Controls make
  // most mistakes impossible; this covers what typing can still get wrong.
  const missing: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) missing.push("pick a date");
  else if (toDay(date) > today) missing.push("choose a day that has happened");
  if (!(minutes > 0)) missing.push("set how long");

  const input: SessionInput = {
    sport,
    date,
    minutes,
    distanceKm: sport === "lift" || !km ? null : km,
    effort,
    note: note.trim() || null,
  };
  const changes = editing ? diff(editing, input) : input;
  const unchanged = editing !== undefined && Object.keys(changes).length === 0;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (missing.length || unchanged || mutation.isPending) return;
    if (editing) update.mutate({ id: editing.id, changes }, { onSuccess: onSaved });
    else create.mutate(input, { onSuccess: onSaved });
  };

  // At a keyboard: digits set effort, ⌘/Ctrl-Enter saves from anywhere. The
  // form is modal, so listening on the window is safe while it is mounted.
  const onKey = useRef<(e: KeyboardEvent) => void>(undefined);
  onKey.current = (e) => {
    const typing = e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLInputElement && e.target.type !== "radio");
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      return submit();
    }
    if (!typing && /^[0-9]$/.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      changeEffort(e.key === "0" ? 10 : Number(e.key));
    }
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey.current?.(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const when = /^\d{4}-\d{2}-\d{2}$/.test(date) ? relativeDay(toDay(date), today) : "";
  const summary = `${SPORT_NAME[sport]} · ${formatMinutes(minutes || 0)}${input.distanceKm ? ` · ${formatKm(input.distanceKm)}` : ""} · ${when}`;

  return (
    <form className="form" onSubmit={submit} noValidate>
      <h2 className="form__title">{editing ? "Correct this session" : "Log a session"}</h2>

      <Field label="What">
        <div className="choices choices--sports" role="radiogroup" aria-label="Sport">
          {SPORTS.map((s) => (
            <Choice key={s} name="sport" checked={sport === s} onChange={() => chooseSport(s)}>
              {SPORT_NAME[s]}
            </Choice>
          ))}
        </div>
      </Field>

      <Field label="When">
        <DatePicker value={date} today={today} onChange={setDate} />
      </Field>

      <Field label="How long" hint={touched.minutes ? undefined : "your usual"}>
        <Stepper
          display={minutes > 0 ? <BigDuration minutes={minutes} /> : <span className="stepper__empty">—</span>}
          onStep={(dir) => changeMinutes(minutes + dir * (minutes < 20 ? 1 : 5))}
          canDecrease={minutes > 1}
          decreaseLabel="Five minutes less"
          increaseLabel="Five minutes more"
          edit={{
            label: "Minutes",
            value: minutes,
            onCommit: (v) => (v > 0 ? changeMinutes(v) : setMinutes(0)),
          }}
        />
        <div className="choices choices--quick">
          {habit.durationChoices.map((m) => (
            <button key={m} type="button" className={`chip${m === minutes ? " is-on" : ""}`} onClick={() => changeMinutes(m)}>
              {formatMinutes(m)}
            </button>
          ))}
        </div>
      </Field>

      {sport !== "lift" && (
        <Field
          label="How far"
          hint={km !== null && !touched.km ? "from your usual pace" : undefined}
          action={km !== null && <button type="button" className="field__action" onClick={() => changeKm(null)}>No distance</button>}
        >
          {km === null ? (
            <button type="button" className="chip chip--wide" onClick={() => changeKm(estimateKm(habit, sport, minutes) ?? 1)}>
              Add a distance
            </button>
          ) : (
            <>
              <Stepper
                display={<span className="big">{km.toFixed(1)}<span className="unit"> km</span></span>}
                onStep={(dir) => changeKm(Math.max(KM_STEP[sport], km + dir * KM_STEP[sport]))}
                canDecrease={km > KM_STEP[sport]}
                decreaseLabel={`${KM_STEP[sport]} km less`}
                increaseLabel={`${KM_STEP[sport]} km more`}
                edit={{ label: "Kilometres", value: km, step: 0.1, onCommit: (v) => changeKm(v > 0 ? v : null) }}
              />
            </>
          )}
        </Field>
      )}

      <Field label="How it felt" hint={touched.effort ? undefined : "your usual"}>
        <EffortPicker value={effort} onChange={changeEffort} />
      </Field>

      {noteOpen ? (
        <Field label="Note">
          <textarea
            className="form__note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            autoFocus={!editing}
            placeholder="Anything worth remembering"
          />
        </Field>
      ) : (
        <button type="button" className="chip chip--wide form__addnote" onClick={() => setNoteOpen(true)}>
          Add a note
        </button>
      )}

      <div className="form__bar">
        {mutation.error && (
          <p className="form__error" role="alert">{mutation.error.message}</p>
        )}
        <button
          type="submit"
          className="save"
          disabled={missing.length > 0 || unchanged || mutation.isPending}
          aria-describedby="save-status"
        >
          <span className="save__verb">
            {mutation.isPending ? "Saving…" : editing ? "Save changes" : "Save"}
          </span>
          <span className="save__what" id="save-status">
            {missing.length ? `To save: ${missing.join(", ")}` : unchanged ? "Nothing changed yet" : summary}
          </span>
        </button>
        <p className="form__keys">Keys: 1–9, 0 set effort · ⌘/Ctrl-Enter saves</p>
      </div>
    </form>
  );
}

function diff(before: Session, after: SessionInput): Partial<SessionInput> {
  const out: Partial<SessionInput> = {};
  for (const key of ["sport", "date", "minutes", "distanceKm", "effort", "note"] as const) {
    if (before[key] !== after[key]) (out as Record<string, unknown>)[key] = after[key];
  }
  return out;
}

interface FieldProps {
  label: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

function Field({ label, hint, action, children }: FieldProps) {
  return (
    <fieldset className="field">
      <legend className="field__label">
        <span className="label">{label}</span>
        {hint && <span className="field__hint">{hint}</span>}
        {action}
      </legend>
      {children}
    </fieldset>
  );
}

function Choice({
  name, checked, onChange, children, className = "",
}: { name: string; checked: boolean; onChange(): void; children: React.ReactNode; className?: string }) {
  return (
    <label className={`choice ${className}${checked ? " is-on" : ""}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="visually-hidden" />
      {children}
    </label>
  );
}

function BigDuration({ minutes }: { minutes: number }) {
  const h = Math.floor(minutes / 60);
  return (
    <span className="big">
      {h > 0 && <>{h}<span className="unit">h</span> </>}
      {h > 0 ? minutes % 60 : minutes}
      <span className="unit">m</span>
    </span>
  );
}

interface StepperProps {
  display: React.ReactNode;
  onStep(direction: 1 | -1): void;
  canDecrease: boolean;
  decreaseLabel: string;
  increaseLabel: string;
  /** Tapping the figure lets someone with a keyboard type it instead. */
  edit: { label: string; value: number; step?: number; onCommit(value: number): void };
}

function Stepper({ display, onStep, canDecrease, decreaseLabel, increaseLabel, edit }: StepperProps) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const valueRef = useRef<HTMLButtonElement>(null);
  const wasTyping = useRef(false);
  // Hand focus back to the figure after typing, so the keyboard stays in the form.
  useEffect(() => {
    if (wasTyping.current && !typing) valueRef.current?.focus();
    wasTyping.current = typing;
  }, [typing]);
  const commit = () => {
    setTyping(false);
    const n = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(n)) edit.onCommit(n);
  };
  return (
    <div className="stepper">
      <button type="button" className="stepper__btn" onClick={() => onStep(-1)} disabled={!canDecrease} aria-label={decreaseLabel}>
        −
      </button>
      {typing ? (
        <input
          className="stepper__input"
          type="number"
          inputMode="decimal"
          step={edit.step ?? 1}
          min={0}
          aria-label={edit.label}
          value={draft}
          autoFocus
          onFocus={(e) => e.target.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              setTyping(false);
            }
          }}
        />
      ) : (
        <button
          ref={valueRef}
          type="button"
          className="stepper__value"
          onClick={() => {
            setDraft(String(edit.value));
            setTyping(true);
          }}
          aria-label={`${edit.label}: ${edit.value}. Type a value`}
        >
          {display}
        </button>
      )}
      <button type="button" className="stepper__btn" onClick={() => onStep(1)} aria-label={increaseLabel}>
        +
      </button>
    </div>
  );
}

function DatePicker({ value, today, onChange }: { value: string; today: Day; onChange(iso: string): void }) {
  const id = useId();
  const days = Array.from({ length: RECENT_DAYS }, (_, i) => today - i);
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(value) ? toDay(value) : null;
  const isRecent = selected !== null && today - selected >= 0 && today - selected < RECENT_DAYS;
  const [other, setOther] = useState(!isRecent);

  return (
    <div className="dates">
      <div className="choices choices--dates" role="radiogroup" aria-label="Date">
        {days.map((d) => {
          const ago = today - d;
          return (
            <Choice key={d} name="date" checked={!other && selected === d} onChange={() => { setOther(false); onChange(toIso(d)); }} className="choice--date">
              <span className="choice__small">{ago === 0 ? "Today" : ago === 1 ? "Yesterday" : WEEKDAYS[weekday(d)].slice(0, 3)}</span>
              <span className="choice__big">{new Date(d * 86_400_000).getUTCDate()}</span>
            </Choice>
          );
        })}
        <Choice name="date" checked={other} onChange={() => setOther(true)} className="choice--date">
          <span className="choice__small">Earlier</span>
          <span className="choice__big">…</span>
        </Choice>
      </div>
      {other && (
        <label className="dates__other" htmlFor={id}>
          <span className="label">Date</span>
          <input id={id} type="date" max={toIso(today)} value={value} onChange={(e) => onChange(e.target.value)} />
        </label>
      )}
    </div>
  );
}

/** Ten steps from easy to all-out. Tap one, or drag a thumb along the row. */
function EffortPicker({ value, onChange }: { value: number; onChange(effort: number): void }) {
  const row = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);

  const pick = (e: PointerEvent) => {
    const r = row.current!.getBoundingClientRect();
    const n = Math.min(10, Math.max(1, Math.ceil(((e.clientX - r.left) / r.width) * 10)));
    if (n !== value) onChange(n);
  };

  return (
    <div className="effort">
      <div
        ref={row}
        className="effort__row"
        role="radiogroup"
        aria-label="Effort, 1 easy to 10 all-out"
        onPointerDown={(e) => {
          scrubbing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e);
        }}
        onPointerMove={(e) => scrubbing.current && pick(e)}
        onPointerUp={() => (scrubbing.current = false)}
        onPointerCancel={() => (scrubbing.current = false)}
      >
        {Array.from({ length: 10 }, (_, i) => {
          const n = i + 1;
          const on = n <= value;
          return (
            <label key={n} className={`effort__step${n === value ? " is-on" : ""}`}>
              <input
                type="radio"
                name="effort"
                className="visually-hidden"
                checked={n === value}
                onChange={() => onChange(n)}
                aria-label={`Effort ${n}`}
              />
              <span
                className="effort__fill"
                style={{ background: on ? effortFill(value) : undefined, height: `${30 + n * 7}%` }}
              />
              <span className="effort__num">{n}</span>
            </label>
          );
        })}
      </div>
      <div className="effort__ends">
        <span>Easy</span>
        <span className={`effort__now${isHard(value) ? " is-hard" : ""}`}>{value}</span>
        <span>All out</span>
      </div>
    </div>
  );
}
