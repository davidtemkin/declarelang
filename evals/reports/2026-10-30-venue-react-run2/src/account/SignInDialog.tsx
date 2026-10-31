import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useSignIn } from "../api/queries";
import { focusAfterSignIn } from "./focusAfterSignIn";
import styles from "./SignIn.module.css";

type Props = { open: boolean; onClose: () => void };

export function SignInDialog({ open, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const signIn = useSignIn();
  const [showPassword, setShowPassword] = useState(false);
  const errorId = useId();

  useEffect(() => {
    const element = dialog.current!;
    if (open && !element.open) {
      signIn.reset();
      setShowPassword(false);
      element.showModal();
    }
    if (!open && element.open) element.close();
  }, [open, signIn.reset]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (signIn.isPending) return;
    const data = new FormData(event.currentTarget);
    signIn.mutate(
      { email: String(data.get("email")).trim(), password: String(data.get("password")) },
      {
        onSuccess: () => {
          onClose();
          focusAfterSignIn();
        },
      },
    );
  };

  const error = signIn.error?.message;

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="sign-in-title"
      onClose={onClose}
      onClick={(event) => {
        // A press on the backdrop closes the dialog.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form method="post" action="#" className={styles.form} onSubmit={onSubmit}>
        <header className={styles.head}>
          <h2 id="sign-in-title" className={styles.title}>
            Sign in
          </h2>
          <p className={styles.lede}>Your saved cards and address, filled in for you.</p>
        </header>

        <div className="field">
          <label htmlFor="sign-in-email">Email</label>
          <input
            id="sign-in-email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            enterKeyHint="next"
            aria-describedby={error ? errorId : undefined}
          />
        </div>

        <div className="field">
          <label htmlFor="sign-in-password">Password</label>
          <div className={styles.password}>
            <input
              id="sign-in-password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              autoCapitalize="none"
              spellCheck={false}
              required
              enterKeyHint="go"
              aria-describedby={error ? errorId : undefined}
            />
            <button
              type="button"
              className={styles.reveal}
              aria-pressed={showPassword}
              aria-controls="sign-in-password"
              onClick={() => setShowPassword((shown) => !shown)}
            >
              Show<span className="visually-hidden"> password</span>
            </button>
          </div>
        </div>

        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>

        <div className={styles.actions}>
          <button type="submit" className="button button-primary" aria-disabled={signIn.isPending}>
            {signIn.isPending ? <span className="spinner" aria-hidden="true" /> : null}
            Sign in
          </button>
          <button type="button" className="button button-quiet" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
