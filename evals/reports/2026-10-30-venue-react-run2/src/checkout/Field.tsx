import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import styles from "./Checkout.module.css";

/** The props `register` supplies, which the field passes to its control. */
type Registered = "name" | "onChange" | "onBlur" | "ref";

type Common = {
  label: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  registration: UseFormRegisterReturn;
  className?: string;
};

type FieldShellProps = Omit<Common, "registration"> & {
  id: string;
  children: ReactNode;
  adornment?: ReactNode;
};

function FieldShell({ id, label, error, hint, optional, className, adornment, children }: FieldShellProps) {
  return (
    <div className={`${styles.field} ${className ?? ""}`} data-invalid={error ? true : undefined}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {optional && <span className={styles.optional}> (optional)</span>}
      </label>
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      <div className={styles.control}>
        {children}
        {adornment}
      </div>
      {error && (
        <p id={`${id}-error`} className={styles.error} role="alert">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="7" />
            <path d="M8 4.5v4.2M8 11.2v.3" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, hint: unknown, error: unknown) =>
  [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;

type TextFieldProps = Common &
  Omit<InputHTMLAttributes<HTMLInputElement>, Registered | "className"> & {
    adornment?: ReactNode;
    /** Rewrites the value as it is typed — grouping a card number, say — keeping the caret in place. */
    format?: (value: string) => string;
  };

export function TextField({
  label, error, hint, optional, registration, className, adornment, format, ...input
}: TextFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} optional={optional} className={className} adornment={adornment}>
      <input
        id={id}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        aria-required={optional ? undefined : true}
        {...input}
        {...registration}
        onChange={(event) => {
          if (format) reformat(event.target, format);
          return registration.onChange(event);
        }}
      />
    </FieldShell>
  );
}

type SelectFieldProps = Common &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, Registered | "className"> & {
    children: ReactNode;
  };

export function SelectField({ label, error, hint, optional, registration, className, children, ...select }: SelectFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} optional={optional} className={className}>
      <select
        id={id}
        className={`${styles.input} ${styles.select}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...select}
        {...registration}
      >
        {children}
      </select>
    </FieldShell>
  );
}

/**
 * Applies a format to an input's value in place, keeping the caret after the
 * same number of meaningful characters as before.
 */
function reformat(input: HTMLInputElement, format: (value: string) => string) {
  const before = input.value;
  const next = format(before);
  if (next === before) return;
  const caret = input.selectionStart ?? before.length;
  const meaningful = (s: string) => s.replace(/[\s/]/g, "").length;
  const kept = meaningful(before.slice(0, caret));
  let position = 0;
  let seen = 0;
  while (position < next.length && seen < kept) {
    if (!/[\s/]/.test(next[position])) seen++;
    position++;
  }
  // Step over a separator that now follows the caret, so typing carries on after it.
  while (caret === before.length && position < next.length && /[\s/]/.test(next[position])) position++;
  input.value = next;
  if (document.activeElement === input) input.setSelectionRange(position, position);
}
