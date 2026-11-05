import styles from './Wordmark.module.css'

/**
 * Presentify's mark: a slide with a spark of coral and a play-shaped notch, as a stage about to go
 * live. The wordmark sets "presentify" in Bricolage Grotesque, tightly tracked.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="1.5" y="5" width="29" height="22" rx="6.5" fill="#5B3DF5" />
      <path d="M12.6 11.4v9.2c0 .7.8 1.1 1.4.7l7-4.6c.5-.3.5-1.1 0-1.4l-7-4.6c-.6-.4-1.4 0-1.4.7Z" fill="#fff" />
      <circle cx="26.5" cy="6.5" r="4.6" fill="#FF6A4D" stroke="#fff" strokeWidth="2" />
    </svg>
  )
}

export function Wordmark({ size = 28, showText = true }: { size?: number; showText?: boolean }) {
  return (
    <span className={styles.wordmark} style={{ fontSize: size * 0.78 }}>
      <LogoMark size={size} />
      {showText ? <span className={styles.text}>presentify</span> : null}
    </span>
  )
}
