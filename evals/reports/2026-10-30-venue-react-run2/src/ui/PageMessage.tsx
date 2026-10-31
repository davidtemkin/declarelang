import styles from "./ui.module.css";

type Props = { title: string; body?: string; busy?: boolean; onRetry?: () => void };

export function PageMessage({ title, body, busy, onRetry }: Props) {
  return (
    <main className={styles.pageMessage} aria-busy={busy || undefined}>
      <h1 className={styles.pageMessageTitle} role={busy ? "status" : undefined}>
        {title}
      </h1>
      {body && <p role="alert">{body}</p>}
      {onRetry && (
        <button type="button" className="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </main>
  );
}
