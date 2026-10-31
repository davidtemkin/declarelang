import type { ReactNode } from "react";
import { Link } from "react-router";
import { AccountControl } from "../account/AccountControl";
import styles from "./ui.module.css";

/** The masthead: the house's name, an optional way back, and the account. */
export function SiteHeader({ back }: { back?: ReactNode }) {
  return (
    <header className={styles.siteHeader}>
      <div className={styles.siteHeaderStart}>
        {back ?? (
          <Link to="/" className={styles.wordmark}>
            Grand Hall
          </Link>
        )}
      </div>
      <AccountControl />
    </header>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className={styles.back}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M10 3 5 8l5 5" />
      </svg>
      {children}
    </Link>
  );
}
