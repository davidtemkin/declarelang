import * as Tooltip from '@radix-ui/react-tooltip'
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { shortcutLabel } from './shortcuts'
import { cx } from './cx'
import styles from './controls.module.css'

interface TipProps {
  label: string
  shortcut?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: ReactNode
}

/** Says what a control does to a pointer resting on it, with its shortcut. */
export function Tip({ label, shortcut, side = 'bottom', children }: TipProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className={styles.tooltip} side={side} sideOffset={6} collisionPadding={8}>
          {label}
          {shortcut ? <kbd className={styles.kbd}>{shortcutLabel(shortcut)}</kbd> : null}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  /** What the button does: its accessible name and its tooltip. */
  label: string
  shortcut?: string
  /** For toggles and tools: whether it is on. */
  pressed?: boolean
  size?: 'sm' | 'md' | 'lg'
  tipSide?: TipProps['side']
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, pressed, size = 'md', tipSide, className, children, ...rest },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      className={cx(styles.iconButton, styles[size], pressed && styles.pressed, className)}
      {...rest}
    >
      {children}
    </button>
  )
  // A disabled button gets no pointer events, so its tooltip hangs on a wrapper.
  return (
    <Tip label={label} shortcut={shortcut} side={tipSide}>
      {rest.disabled ? <span className={styles.disabledWrap}>{button}</span> : button}
    </Tip>
  )
})

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  icon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', icon, className, children, ...rest },
  ref,
) {
  return (
    <button ref={ref} type="button" className={cx(styles.button, styles[variant], className)} {...rest}>
      {icon}
      <span>{children}</span>
    </button>
  )
})
