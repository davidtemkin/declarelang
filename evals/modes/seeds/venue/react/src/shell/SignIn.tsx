import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { ApiError } from '../api'
import { useSignIn } from '../queries'
import { useAnnounce } from './Announcer'
import styles from './SignIn.module.css'

type OpenOptions = {
  /** Where focus goes once signed in; the control that opened the dialog may be gone by then. */
  onSignedIn?: () => void
}

const SignInContext = createContext<(options?: OpenOptions) => void>(() => {})

export function useOpenSignIn() {
  return useContext(SignInContext)
}

/**
 * Signing in is a dialog over whatever the person is doing, so nothing they
 * have chosen or typed underneath is disturbed by it.
 */
export function SignInProvider({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const options = useRef<OpenOptions>({})
  const [session, setSession] = useState(0)
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback((opts: OpenOptions = {}) => {
    options.current = opts
    setSession((n) => n + 1) // a fresh form each time
    setIsOpen(true)
    dialogRef.current?.showModal()
  }, [])

  function close() {
    dialogRef.current?.close()
  }

  return (
    <SignInContext.Provider value={open}>
      {/* The page behind a modal is out of reach; say so to assistive tech as well. */}
      <div aria-hidden={isOpen || undefined}>{children}</div>
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="sign-in-title"
        onClose={() => setIsOpen(false)}
        onClick={(e) => {
          // A click on the backdrop (the dialog element itself) dismisses it.
          if (e.target === e.currentTarget) close()
        }}
      >
        {/* Only in the page while open, so its fields are never mistaken for the page's own. */}
        {isOpen && (
          <SignInForm
            key={session}
            onCancel={close}
            onSignedIn={() => {
              close()
              // After the dialog has given focus back, move it somewhere that still exists.
              requestAnimationFrame(() => options.current.onSignedIn?.())
            }}
          />
        )}
      </dialog>
    </SignInContext.Provider>
  )
}

function SignInForm({ onCancel, onSignedIn }: { onCancel: () => void; onSignedIn: () => void }) {
  const signIn = useSignIn()
  const announce = useAnnounce()
  const [reveal, setReveal] = useState(false)
  const errorId = useId()
  const passwordRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (signIn.isPending) return
    const data = new FormData(event.currentTarget)
    try {
      const account = await signIn.mutateAsync({
        email: String(data.get('email')).trim(),
        password: String(data.get('password')),
      })
      announce(`Signed in as ${account?.name ?? 'you'}.`)
      onSignedIn()
    } catch {
      passwordRef.current?.select()
    }
  }

  const error =
    signIn.error instanceof ApiError
      ? signIn.error.message
      : signIn.error
        ? 'Something went wrong signing in. Please try again.'
        : null

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <header className={styles.head}>
        <h2 id="sign-in-title" className={styles.title}>
          Sign in
        </h2>
        <p className={styles.lede}>
          Use your saved details and cards. You don’t need an account to book.
        </p>
      </header>

      <div className={styles.field}>
        <label htmlFor="sign-in-email">Email</label>
        <input
          id="sign-in-email"
          name="email"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="next"
          required
          aria-describedby={error ? errorId : undefined}
          autoFocus
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="sign-in-password">Password</label>
        <div className={styles.password}>
          <input
            ref={passwordRef}
            id="sign-in-password"
            name="password"
            type={reveal ? 'text' : 'password'}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
          />
          <button
            type="button"
            className={styles.reveal}
            aria-controls="sign-in-password"
            aria-pressed={reveal}
            onClick={() => {
              setReveal((r) => !r)
              passwordRef.current?.focus()
            }}
          >
            {reveal ? 'Hide' : 'Show'}
            <span className="visually-hidden"> password</span>
          </button>
        </div>
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      </div>

      <div className={styles.actions}>
        <button
          type="submit"
          className="button button-primary"
          aria-disabled={signIn.isPending || undefined}
        >
          {signIn.isPending && <span className="spinner" aria-hidden="true" />}
          Sign in
        </button>
        <button type="button" className="button button-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
