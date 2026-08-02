import type { Priority } from "../../data/types";
import { PRIORITY_LABEL } from "../../data/types";
import styles from "./PriorityMark.module.css";

/** Priority as a compact rank badge — P0 loudest, P3 quietest. */
export function PriorityMark({ priority }: { priority: Priority }) {
  return (
    <span className={styles.mark} data-priority={priority} title={PRIORITY_LABEL[priority]}>
      {priority[1]}
      <span className="visually-hidden">{PRIORITY_LABEL[priority]}</span>
    </span>
  );
}
