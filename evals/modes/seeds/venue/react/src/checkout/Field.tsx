import { useId, type ComponentPropsWithRef, type ReactNode } from 'react'
import styles from './Field.module.css'

type Common = {
  label: string
  hint?: ReactNode
  error?: string
  optional?: boolean
  /** Ids of other elements that describe the field, e.g. a recognised card brand. */
  describedBy?: string
  className?: string
}

function useFieldIds(error?: string, hint?: ReactNode, extra?: string) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy =
    [error && errorId, hint && hintId, extra].filter(Boolean).join(' ') || undefined
  return { id, hintId, errorId, describedBy }
}

function Label({
  htmlFor,
  label,
  optional,
}: {
  htmlFor: string
  label: string
  optional?: boolean
}) {
  return (
    <label htmlFor={htmlFor} className={styles.label}>
      {label}
      {optional && <span className={styles.optional}> (optional)</span>}
    </label>
  )
}

function Message({ id, error }: { id: string; error?: string }) {
  // Always present, so a message arriving in it is announced.
  return (
    <p id={id} className={styles.error} aria-live="polite">
      {error && (
        <>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="7" />
            <path d="M8 4.5v4.25M8 11.25v.25" />
          </svg>
          {error}
        </>
      )}
    </p>
  )
}

type TextFieldProps = Common &
  Omit<ComponentPropsWithRef<'input'>, 'className'> & {
    /** Shown inside the field, at its end. */
    adornment?: ReactNode
  }

export function TextField({
  label,
  hint,
  error,
  optional,
  describedBy: extra,
  className,
  adornment,
  ...input
}: TextFieldProps) {
  const { id, hintId, errorId, describedBy } = useFieldIds(error, hint, extra)
  return (
    <div className={`${styles.field} ${className ?? ''}`} data-invalid={error ? true : undefined}>
      <Label htmlFor={id} label={label} optional={optional} />
      <div className={styles.control}>
        <input
          id={id}
          className={styles.input}
          required={!optional}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          data-adorned={adornment ? true : undefined}
          {...input}
        />
        {adornment && <span className={styles.adornment}>{adornment}</span>}
      </div>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      <Message id={errorId} error={error} />
    </div>
  )
}

type SelectFieldProps = Common &
  Omit<ComponentPropsWithRef<'select'>, 'className'> & { children: ReactNode }

export function SelectField({
  label,
  hint,
  error,
  optional,
  describedBy: extra,
  className,
  children,
  ...select
}: SelectFieldProps) {
  const { id, hintId, errorId, describedBy } = useFieldIds(error, hint, extra)
  return (
    <div className={`${styles.field} ${className ?? ''}`} data-invalid={error ? true : undefined}>
      <Label htmlFor={id} label={label} optional={optional} />
      <div className={styles.control}>
        <select
          id={id}
          className={`${styles.input} ${styles.select}`}
          required={!optional}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...select}
        >
          {children}
        </select>
        <svg className={styles.selectCaret} viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </div>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      <Message id={errorId} error={error} />
    </div>
  )
}
