import * as Popover from '@radix-ui/react-popover';
import { useEffect, useState } from 'react';
import { HexAlphaColorPicker } from 'react-colorful';
import { Tooltip } from './ui';

/** Presentify's swatches: calm inks and paper, and a few clear accents. */
export const SWATCHES = [
  '#FFFFFF', '#F6F4EF', '#D9D6CE', '#8E8B85', '#3B3A38', '#141414',
  '#0E3B43', '#2F6F8F', '#4F7CFF', '#7C5CFF', '#C2408C', '#E05A47',
  '#E07A5F', '#F2A541', '#F6D55C', '#5BAE7A', '#2E8B6D', '#8CC2C9',
];

/** "#rrggbbff" → "#RRGGBB"; anything else uppercased. */
export function normalizeColor(color: string): string {
  let c = color.toUpperCase();
  if (/^#[0-9A-F]{3}$/.test(c)) c = '#' + [...c.slice(1)].map((ch) => ch + ch).join('');
  if (c.length === 9 && c.endsWith('FF')) c = c.slice(0, 7);
  return c;
}

export function isValidColor(color: string): boolean {
  return /^#([0-9A-F]{6}|[0-9A-F]{8})$/i.test(color);
}

interface ColorFieldProps {
  label: string;
  /** `null` is no colour; `'mixed'` when the selection disagrees. */
  value: string | null | 'mixed';
  allowNone?: boolean;
  disabled?: boolean;
  /** While the person drags in the picker: show it, but don't make a step yet. */
  onPreview: (color: string) => void;
  /** The change is final (one undo step). `null` means none. */
  onCommit: (color: string | null) => void;
}

export function Swatch({ color }: { color: string | null | 'mixed' }) {
  if (color === 'mixed') return <span className="swatch swatch-mixed" />;
  if (color === null) return <span className="swatch swatch-none" />;
  return (
    <span className="swatch swatch-checker">
      <span style={{ background: color }} />
    </span>
  );
}

export function ColorField({ label, value, allowNone, disabled, onPreview, onCommit }: ColorFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [hex, setHex] = useState('');
  const shown = typeof value === 'string' && value !== 'mixed' ? value : null;
  useEffect(() => setHex(shown ?? ''), [shown]);

  const finishDrag = () => {
    if (draft !== null) onCommit(draft);
    setDraft(null);
  };

  const commitHex = () => {
    const candidate = normalizeColor(hex.startsWith('#') ? hex : '#' + hex);
    if (isValidColor(candidate) && candidate !== value) onCommit(candidate);
    else setHex(shown ?? '');
  };

  const valueText = value === 'mixed' ? 'Mixed' : value === null ? 'None' : value;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) finishDrag();
        setOpen(next);
      }}
    >
      <div className={`color-field ${disabled ? 'is-disabled' : ''}`}>
        <Tooltip label={`${label}: ${valueText}`}>
          <Popover.Trigger asChild>
            <button type="button" className="color-field-trigger" disabled={disabled} aria-label={`${label}: ${valueText}`}>
              <Swatch color={disabled ? null : value} />
              <span className={`color-field-value ${value === 'mixed' || value === null ? 'is-muted' : ''}`}>
                {disabled ? '—' : valueText}
              </span>
            </button>
          </Popover.Trigger>
        </Tooltip>
      </div>
      <Popover.Portal>
        <Popover.Content className="popover color-popover" side="left" align="start" sideOffset={10} collisionPadding={12}>
          <div className="color-popover-title">{label}</div>
          <div
            onPointerUp={finishDrag}
            onKeyUp={finishDrag}
          >
            <HexAlphaColorPicker
              color={draft ?? shown ?? '#FFFFFF'}
              onChange={(c) => {
                const n = normalizeColor(c);
                setDraft(n);
                setHex(n);
                onPreview(n);
              }}
            />
          </div>
          <div className="color-popover-swatches" role="group" aria-label="Swatches">
            {allowNone && (
              <button type="button" className="swatch-button" aria-label="None" title="None" onClick={() => onCommit(null)}>
                <Swatch color={null} />
              </button>
            )}
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch-button ${shown === c ? 'is-on' : ''}`}
                aria-label={c}
                title={c}
                onClick={() => onCommit(c)}
              >
                <Swatch color={c} />
              </button>
            ))}
          </div>
          <label className="color-popover-hex">
            <span>Hex</span>
            <input
              value={hex}
              spellCheck={false}
              placeholder={value === 'mixed' ? 'Mixed' : 'None'}
              onChange={(e) => setHex(e.target.value)}
              onBlur={commitHex}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') commitHex();
              }}
            />
          </label>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
