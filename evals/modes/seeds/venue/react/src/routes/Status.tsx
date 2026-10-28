import { Link } from 'react-router'
import { ApiError } from '../api'
import styles from './Status.module.css'

export function Loading({ label }: { label: string }) {
  return (
    <div className={styles.status} role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  )
}

export function LoadError({ error, retry }: { error: Error; retry: () => void }) {
  const message =
    error instanceof ApiError ? error.message : 'Something went wrong. Please try again.'
  return (
    <div className={styles.status} role="alert">
      <p className={styles.message}>{message}</p>
      <button type="button" className="button button-quiet" onClick={retry}>
        Try again
      </button>
    </div>
  )
}

export function Gone({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.status}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.message}>{children}</p>
      <Link to="/" className="button button-primary">
        See all performances
      </Link>
    </div>
  )
}
