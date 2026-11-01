/**
 * Presentify's small set of controls, built on Radix primitives for focus, keyboard and
 * screen-reader behaviour, and styled in ui.css.
 */
import * as RadixDialog from '@radix-ui/react-dialog';
import * as RadixMenu from '@radix-ui/react-dropdown-menu';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { type ButtonHTMLAttributes, forwardRef, type ReactNode, useEffect, useState } from 'react';
import { CheckIcon, ChevronDownIcon } from './icons';
import './ui.css';

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Turn "Mod+Shift+Z" into "⇧⌘Z" on a Mac and "Ctrl+Shift+Z" elsewhere. */
export function formatShortcut(shortcut: string): string {
  const parts = shortcut.split('+');
  if (!isMac) return parts.map((p) => (p === 'Mod' ? 'Ctrl' : p)).join('+');
  const symbols: Record<string, string> = { Mod: '⌘', Shift: '⇧', Alt: '⌥', Ctrl: '⌃', Enter: '↩', Backspace: '⌫', Delete: '⌫', Escape: 'Esc' };
  const order = ['Ctrl', 'Alt', 'Shift', 'Mod'];
  const mods = parts.slice(0, -1).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return [...mods, parts.at(-1)!].map((p) => symbols[p] ?? p).join('');
}

// ---------------------------------------------------------------- tooltip

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={450} skipDelayDuration={200}>
      {children}
    </RadixTooltip.Provider>
  );
}

export function Tooltip({ label, shortcut, children, side = 'bottom' }: {
  label: string;
  shortcut?: string;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className="tooltip" side={side} sideOffset={6} collisionPadding={8}>
          {label}
          {shortcut && <kbd className="tooltip-kbd">{formatShortcut(shortcut)}</kbd>}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

// ---------------------------------------------------------------- buttons

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  shortcut?: string;
  pressed?: boolean;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
};

/** A square button showing only an icon. Its label is its tooltip and its accessible name. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, pressed, tooltipSide, className = '', children, ...rest },
  ref,
) {
  return (
    <Tooltip label={label} shortcut={shortcut} side={tooltipSide}>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        aria-keyshortcuts={shortcut?.replace('Mod', isMac ? 'Meta' : 'Control')}
        className={`icon-button ${pressed ? 'is-pressed' : ''} ${className}`}
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  );
});

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }>(
  function Button({ variant = 'secondary', className = '', ...rest }, ref) {
    return <button ref={ref} type="button" className={`button button-${variant} ${className}`} {...rest} />;
  },
);

// ---------------------------------------------------------------- menus

export const Menu = RadixMenu.Root;
export const MenuTrigger = RadixMenu.Trigger;

export function MenuContent({ children, align = 'start' }: { children: ReactNode; align?: 'start' | 'center' | 'end' }) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content className="menu" align={align} sideOffset={6} collisionPadding={8} loop>
        {children}
      </RadixMenu.Content>
    </RadixMenu.Portal>
  );
}

export function MenuItem({ children, shortcut, icon, disabled, danger, onSelect }: {
  children: ReactNode;
  shortcut?: string;
  icon?: ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}) {
  return (
    <RadixMenu.Item className={`menu-item ${danger ? 'is-danger' : ''}`} disabled={disabled} onSelect={onSelect}>
      <span className="menu-item-icon">{icon}</span>
      <span className="menu-item-label">{children}</span>
      {shortcut && <kbd className="menu-item-kbd">{formatShortcut(shortcut)}</kbd>}
    </RadixMenu.Item>
  );
}

export function MenuCheckItem({ children, checked, onSelect }: { children: ReactNode; checked: boolean; onSelect: () => void }) {
  return (
    <RadixMenu.CheckboxItem className="menu-item" checked={checked} onSelect={onSelect}>
      <span className="menu-item-icon">{checked && <CheckIcon size={16} />}</span>
      <span className="menu-item-label">{children}</span>
    </RadixMenu.CheckboxItem>
  );
}

export function MenuSeparator() {
  return <RadixMenu.Separator className="menu-separator" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <RadixMenu.Label className="menu-label">{children}</RadixMenu.Label>;
}

/** A text button that opens a menu, as in a menu bar. */
export function MenuBarButton({ children }: { children: ReactNode }) {
  return (
    <RadixMenu.Trigger asChild>
      <button type="button" className="menubar-button">
        {children}
        <ChevronDownIcon size={14} />
      </button>
    </RadixMenu.Trigger>
  );
}

// ---------------------------------------------------------------- dialogs

export function Dialog({ open, onOpenChange, title, description, children, footer }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer: ReactNode;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog-overlay" />
        <RadixDialog.Content className="dialog" aria-describedby={description ? undefined : undefined}>
          <RadixDialog.Title className="dialog-title">{title}</RadixDialog.Title>
          {description ? (
            <RadixDialog.Description className="dialog-description">{description}</RadixDialog.Description>
          ) : (
            <RadixDialog.Description className="visually-hidden">{title}</RadixDialog.Description>
          )}
          {children}
          <div className="dialog-footer">{footer}</div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

export const DialogClose = RadixDialog.Close;

// ---------------------------------------------------------------- number field

/**
 * A number input that commits on Enter or blur (one undo step), and steps with the arrow
 * keys (shift for ten). Shows "Mixed" when the selection disagrees.
 */
export function NumberField({ label, value, onCommit, min = -Infinity, max = Infinity, suffix, disabled, step = 1 }: {
  label: string;
  value: number | 'mixed' | null;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  disabled?: boolean;
  step?: number;
}) {
  const shown = value === null ? '' : value === 'mixed' ? '' : String(Math.round(value * 100) / 100);
  const [draft, setDraft] = useState(shown);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(shown);
  }, [shown, focused]);

  const commit = (text: string) => {
    const n = Number.parseFloat(text);
    if (Number.isFinite(n)) {
      const clamped = Math.min(max, Math.max(min, n));
      if (clamped !== value) onCommit(clamped);
      setDraft(String(clamped));
    } else {
      setDraft(shown);
    }
  };

  return (
    <label className={`number-field ${disabled ? 'is-disabled' : ''}`}>
      <span className="number-field-label">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={draft}
        disabled={disabled}
        placeholder={value === 'mixed' ? 'Mixed' : '—'}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setFocused(false);
          commit(draft);
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit(draft);
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setDraft(shown);
            e.currentTarget.blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const base = Number.parseFloat(draft);
            const start = Number.isFinite(base) ? base : typeof value === 'number' ? value : 0;
            const next = Math.min(max, Math.max(min, start + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)));
            setDraft(String(next));
            onCommit(next);
          }
          e.stopPropagation();
        }}
      />
      {suffix && <span className="number-field-suffix">{suffix}</span>}
    </label>
  );
}

/** A row of mutually exclusive icon buttons. */
export function Segmented<T extends string>({ label, value, options, onChange, disabled }: {
  label: string;
  value: T | 'mixed' | null;
  options: { value: T; label: string; icon: ReactNode }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <Tooltip key={o.value} label={o.label}>
          <button
            type="button"
            role="radio"
            aria-checked={value === o.value}
            aria-label={o.label}
            disabled={disabled}
            className={`segmented-option ${value === o.value ? 'is-on' : ''}`}
            onClick={() => onChange(o.value)}
          >
            {o.icon}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
