import * as Popover from '@radix-ui/react-popover'
import * as Select from '@radix-ui/react-select'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { HexAlphaColorPicker } from 'react-colorful'
import type { Color } from '../api/types'
import { normalizeColor, rgba, SWATCHES } from '../model/colors'
import { CheckIcon, ChevronDownIcon, NoneIcon } from './icons'
import { Tip } from './controls'
import { cx } from './cx'
import { MIXED, type Mixed } from './mixed'
import styles from './fields.module.css'

/* ---------- Numbers ---------- */

interface NumberFieldProps {
  label: string
  /** A short label drawn inside the field, such as X or W; the full label is still its name. */
  glyph?: ReactNode
  value: Mixed<number> | undefined
  onCommit: (value: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  disabled?: boolean
  className?: string
}

/**
 * A number that can be typed, stepped with the arrow keys (by ten with shift) or left alone. It
 * commits on Enter, on leaving the field, and on each arrow press; Escape puts it back.
 */
export function NumberField({ label, glyph, value, onCommit, min = -Infinity, max = Infinity, step = 1, unit, disabled, className }: NumberFieldProps) {
  const shown = value === undefined ? '' : value === MIXED ? '' : formatNumber(value)
  // What is being typed, while the field has focus; otherwise the field shows the value itself.
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? shown
  const setText = (next: string) => setDraft(next)
  const inputRef = useRef<HTMLInputElement>(null)

  const commit = (raw: string) => {
    const parsed = Number.parseFloat(raw.replace(',', '.'))
    if (!Number.isFinite(parsed)) {
      setText(shown)
      return
    }
    const next = Math.min(max, Math.max(min, parsed))
    setText(formatNumber(next))
    if (value === MIXED || value === undefined || Math.abs(next - value) > 1e-9) onCommit(next)
  }

  return (
    <label className={cx(styles.numberField, disabled && styles.disabled, className)}>
      {glyph ? <span className={styles.glyph} aria-hidden="true">{glyph}</span> : null}
      <input
        ref={inputRef}
        className={styles.numberInput}
        aria-label={label}
        title={label}
        inputMode="decimal"
        disabled={disabled}
        value={disabled ? '' : text}
        placeholder={value === MIXED ? 'Mixed' : '–'}
        onFocus={(e) => {
          setDraft(shown)
          e.currentTarget.select()
        }}
        onBlur={(e) => {
          commit(e.currentTarget.value)
          setDraft(null)
        }}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            commit(e.currentTarget.value)
            e.currentTarget.select()
          } else if (e.key === 'Escape') {
            setText(shown)
            e.currentTarget.blur()
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const base = value === MIXED || value === undefined ? Number.parseFloat(text) || 0 : value
            const delta = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)
            const next = Math.min(max, Math.max(min, roundTo(base + delta, step)))
            setText(formatNumber(next))
            onCommit(next)
            requestAnimationFrame(() => inputRef.current?.select())
          }
        }}
      />
      {unit ? <span className={styles.unit} aria-hidden="true">{unit}</span> : null}
    </label>
  )
}

function roundTo(value: number, step: number) {
  return step < 1 ? Math.round(value * 100) / 100 : Math.round(value)
}

function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100)
}

/* ---------- Colours ---------- */

interface ColorFieldProps {
  label: string
  value: Mixed<Color | null> | undefined
  /** `live` is true while a colour is being dragged in the picker, so those changes can be one step. */
  onChange: (color: Color | null, live: boolean) => void
  allowNone?: boolean
  disabled?: boolean
}

export function ColorField({ label, value, onChange, allowNone, disabled }: ColorFieldProps) {
  const [open, setOpen] = useState(false)
  const current = value === MIXED || value === undefined ? null : value
  const description = value === undefined ? '' : value === MIXED ? 'Mixed' : value === null ? 'None' : value.toUpperCase()
  // What is being typed into the hex field; otherwise it shows the colour itself.
  const [hexDraft, setHexDraft] = useState<string | null>(null)
  const hex = hexDraft ?? current ?? ''
  const setHex = (next: string) => setHexDraft(next)

  return (
    <Popover.Root open={open && !disabled} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cx(styles.colorButton, disabled && styles.disabled)}
          disabled={disabled}
          aria-label={`${label}: ${description || 'none'}`}
          title={label}
        >
          {disabled ? <span className={styles.swatch} /> : <Swatch color={value} />}
          <span className={styles.colorText}>{disabled ? '' : description}</span>
          <ChevronDownIcon size={14} className={styles.chevron} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.popover} side="left" align="start" sideOffset={10} collisionPadding={12} aria-label={label}>
          <div className={styles.popoverTitle}>{label}</div>
          <div className={styles.picker}>
            <HexAlphaColorPicker color={current ?? '#5B3DF5'} onChange={(c) => onChange(normalizeColor(c) ?? c, true)} />
          </div>
          <div className={styles.hexRow}>
            <span className={styles.hexHash}>#</span>
            <input
              className={styles.hexInput}
              aria-label={`${label} hex value`}
              value={hex.replace('#', '')}
              placeholder={value === MIXED ? 'Mixed' : 'None'}
              onChange={(e) => setHex(e.currentTarget.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') {
                  const c = normalizeColor(e.currentTarget.value)
                  if (c) onChange(c, false)
                  setHexDraft(null)
                }
              }}
              onBlur={(e) => {
                const c = normalizeColor(e.currentTarget.value)
                if (c && c !== current) onChange(c, false)
                setHexDraft(null)
              }}
            />
            {current ? <span className={styles.alpha}>{Math.round(rgba(current).a * 100)}%</span> : null}
          </div>
          <div className={styles.swatches} role="group" aria-label="Swatches">
            {allowNone ? (
              <Tip label="None" side="top">
                <button
                  type="button"
                  className={cx(styles.swatchButton, value === null && styles.swatchChosen)}
                  aria-label="None"
                  onClick={() => onChange(null, false)}
                >
                  <NoneIcon size={18} />
                </button>
              </Tip>
            ) : null}
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                className={cx(styles.swatchButton, current?.toUpperCase() === c && styles.swatchChosen)}
                style={{ '--swatch': c } as CSSProperties}
                aria-label={c}
                title={c}
                onClick={() => onChange(c, false)}
              />
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export function Swatch({ color }: { color: Mixed<Color | null> | undefined }) {
  if (color === MIXED) return <span className={cx(styles.swatch, styles.swatchMixed)} />
  if (color === null || color === undefined) return <span className={cx(styles.swatch, styles.swatchNone)} />
  return (
    <span className={styles.swatch}>
      <span style={{ background: color }} />
    </span>
  )
}

/* ---------- Choices ---------- */

interface SegmentedProps<T extends string> {
  label: string
  value: Mixed<T> | undefined
  options: { value: T; label: string; icon: ReactNode }[]
  onChange: (value: T) => void
  disabled?: boolean
}

export function Segmented<T extends string>({ label, value, options, onChange, disabled }: SegmentedProps<T>) {
  return (
    <div className={cx(styles.segmented, disabled && styles.disabled)} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <Tip key={o.value} label={o.label}>
          <button
            type="button"
            role="radio"
            aria-checked={value === o.value}
            aria-label={o.label}
            disabled={disabled}
            className={cx(styles.segment, value === o.value && !disabled && styles.segmentOn)}
            onClick={() => onChange(o.value)}
          >
            {o.icon}
          </button>
        </Tip>
      ))}
    </div>
  )
}

interface SelectFieldProps {
  label: string
  value: Mixed<string> | undefined
  options: { value: string; label: string; style?: CSSProperties }[]
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
}

export function SelectField({ label, value, options, onChange, disabled, className }: SelectFieldProps) {
  const known = typeof value === 'string' && !options.some((o) => o.value === value) ? [...options, { value, label: value }] : options
  const chosen = typeof value === 'string' ? known.find((o) => o.value === value) : undefined
  return (
    <Select.Root value={typeof value === 'string' ? value : ''} onValueChange={onChange} disabled={disabled}>
      <Select.Trigger className={cx(styles.select, disabled && styles.disabled, className)} aria-label={label} title={label}>
        <span className={styles.selectValue} style={chosen?.style}>
          {disabled ? '' : value === MIXED ? <span className={styles.mixedText}>Mixed</span> : (chosen?.label ?? '')}
        </span>
        <Select.Icon className={styles.chevron}>
          <ChevronDownIcon size={14} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className={styles.selectContent} position="popper" sideOffset={4} collisionPadding={12}>
          <Select.Viewport className={styles.selectViewport}>
            {known.map((o) => (
              <Select.Item key={o.value} value={o.value} className={styles.selectItem}>
                <Select.ItemText>
                  <span style={o.style}>{o.label}</span>
                </Select.ItemText>
                <Select.ItemIndicator className={styles.selectCheck}>
                  <CheckIcon size={14} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

export function Toggle({
  label,
  pressed,
  onChange,
  disabled,
  children,
}: {
  label: string
  pressed: Mixed<boolean> | undefined
  onChange: (on: boolean) => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Tip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed === MIXED ? 'mixed' : !!pressed}
        disabled={disabled}
        className={cx(styles.toggle, pressed === true && !disabled && styles.toggleOn, pressed === MIXED && !disabled && styles.toggleMixed)}
        onClick={() => onChange(pressed !== true)}
      >
        {children}
      </button>
    </Tip>
  )
}

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: Mixed<boolean> | undefined
  onChange: (on: boolean) => void
  disabled?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = checked === MIXED
  }, [checked])
  return (
    <label className={cx(styles.checkbox, disabled && styles.disabled)}>
      <input ref={ref} type="checkbox" checked={checked === true} disabled={disabled} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span className={styles.checkboxBox} aria-hidden="true">
        <CheckIcon size={12} />
      </span>
      <span>{label}</span>
      {checked === MIXED && !disabled ? <span className={styles.mixedNote}>Mixed</span> : null}
    </label>
  )
}
