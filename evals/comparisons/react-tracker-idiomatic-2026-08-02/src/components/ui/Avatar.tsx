import { UNASSIGNED } from "../../data/types";
import styles from "./Avatar.module.css";

/** Deterministic hue per name, so the same person is the same colour anywhere. */
function hueFor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}

export function Avatar({ name, showName = false }: { name: string | null; showName?: boolean }) {
  const label = name ?? "Unassigned";
  return (
    <span className={styles.wrap} title={label}>
      <span
        className={styles.badge}
        data-empty={name === null || undefined}
        style={name === null ? undefined : { "--hue": hueFor(name) } as React.CSSProperties}
        aria-hidden
      >
        {name === null ? "—" : name[0]}
      </span>
      {showName && <span className={styles.name}>{label}</span>}
      {!showName && <span className="visually-hidden">{label}</span>}
    </span>
  );
}

export const displayAssignee = (value: string): string => (value === UNASSIGNED ? "Unassigned" : value);
