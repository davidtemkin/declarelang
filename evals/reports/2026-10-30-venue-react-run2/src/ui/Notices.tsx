import { useSelection } from "../selection";
import styles from "./ui.module.css";

/**
 * What happened to the person's choice while they weren't looking. The live
 * region is always present so that each new notice is announced as it arrives.
 */
export function Notices() {
  const { notices, dismissNotice } = useSelection();
  return (
    <div className={styles.notices} aria-live="assertive" aria-atomic="false">
      {notices.map((notice) => (
        <p key={notice.id} className={styles.notice}>
          <span>{notice.text}</span>
          <button
            type="button"
            className={styles.noticeDismiss}
            onClick={() => dismissNotice(notice.id)}
          >
            OK
          </button>
        </p>
      ))}
    </div>
  );
}
