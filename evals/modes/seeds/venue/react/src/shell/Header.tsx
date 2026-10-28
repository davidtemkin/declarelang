import { useRef } from 'react'
import { Link } from 'react-router'
import { useAccount, useSignOut } from '../queries'
import { useAnnounce } from './Announcer'
import { useOpenSignIn } from './SignIn'
import styles from './Header.module.css'

export function Header() {
  const account = useAccount()
  const signOut = useSignOut()
  const openSignIn = useOpenSignIn()
  const announce = useAnnounce()
  const accountRef = useRef<HTMLSpanElement>(null)
  const signInRef = useRef<HTMLButtonElement>(null)

  const user = account.data

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.brand}>
          <svg className={styles.mark} viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="var(--ink)" />
            <path
              d="M6 12a10 6 0 0 1 20 0"
              fill="none"
              stroke="var(--paper)"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <circle cx="10" cy="19" r="2.2" fill="var(--paper)" />
            <circle cx="16" cy="20" r="2.2" fill="var(--accent-bright)" />
            <circle cx="22" cy="19" r="2.2" fill="var(--paper)" />
          </svg>
          The Venue
        </Link>

        <div className={styles.account}>
          {user ? (
            <>
              <span ref={accountRef} tabIndex={-1} className={styles.who}>
                <span className="visually-hidden">Signed in as </span>
                {user.name}
              </span>
              <button
                type="button"
                className={styles.action}
                onClick={async () => {
                  await signOut.mutateAsync()
                  announce('Signed out.')
                  requestAnimationFrame(() => signInRef.current?.focus())
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              ref={signInRef}
              type="button"
              className={styles.action}
              // Until we know, don't offer something that may be wrong.
              hidden={account.isPending}
              onClick={() => openSignIn({ onSignedIn: () => accountRef.current?.focus() })}
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
