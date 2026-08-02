import type { Status } from "../../data/types";
import { STATUS_LABEL } from "../../data/types";
import styles from "./StatusPill.module.css";

/** Status shown as dot + word; the word collapses away on narrow viewports. */
export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={styles.pill} data-status={status} title={STATUS_LABEL[status]}>
      <span className={styles.dot} aria-hidden />
      <span className={styles.text}>{STATUS_LABEL[status]}</span>
    </span>
  );
}
