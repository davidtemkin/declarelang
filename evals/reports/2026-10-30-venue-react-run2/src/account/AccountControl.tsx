import { useAccount, useSignOut } from "../api/queries";
import { useSignInDialog } from "./SignInProvider";
import styles from "./SignIn.module.css";

/** Who is signed in, and the way in or out. */
export function AccountControl() {
  const account = useAccount();
  const signOut = useSignOut();
  const { openSignIn } = useSignInDialog();

  if (account.isPending) return <div className={styles.account} />;

  if (!account.data) {
    return (
      <div className={styles.account} data-account>
        <button type="button" className="button button-quiet button-small" onClick={openSignIn}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className={styles.account} data-account>
      <p className={styles.who} tabIndex={-1} data-account-status>
        <span className="visually-hidden">Signed in as </span>
        {account.data.name}
      </p>
      <button
        type="button"
        className="button button-quiet button-small"
        aria-disabled={signOut.isPending}
        onClick={() => {
          if (signOut.isPending) return;
          signOut.mutate(undefined, {
            // The button goes with the session; keep focus on its replacement.
            onSuccess: () =>
              requestAnimationFrame(() =>
                document.querySelector<HTMLElement>("[data-account] button")?.focus(),
              ),
          });
        }}
      >
        Sign out
      </button>
    </div>
  );
}
