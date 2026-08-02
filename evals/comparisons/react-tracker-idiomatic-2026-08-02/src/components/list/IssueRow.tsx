import { memo } from "react";
import { ChevronDown, MessageSquare } from "lucide-react";
import clsx from "clsx";
import type { Issue } from "../../data/types";
import { formatAge, formatTimestamp } from "../../lib/format";
import { StatusPill } from "../ui/StatusPill";
import { PriorityMark } from "../ui/PriorityMark";
import { Avatar } from "../ui/Avatar";
import { IssueEditor } from "./IssueEditor";
import styles from "./IssueRow.module.css";

interface IssueRowProps {
  index: number;
  issue: Issue;
  horizon: number;
  selected: boolean;
  editing: boolean;
  /** Supplied only while editing — the open editor is the one measured row. */
  measureRef?: (node: Element | null) => void;
  onClick: (index: number, event: React.MouseEvent) => void;
  onToggle: (id: number) => void;
  onOpen: (id: number) => void;
}

/**
 * Memoised because a scroll step re-renders the list shell but must not
 * re-render rows whose props are unchanged.
 */
export const IssueRow = memo(function IssueRow({
  index,
  issue,
  horizon,
  selected,
  editing,
  measureRef,
  onClick,
  onToggle,
  onOpen,
}: IssueRowProps) {
  return (
    <div
      ref={measureRef}
      data-index={index}
      data-issue-id={issue.id}
      data-status={issue.status}
      className={clsx(styles.row, selected && styles.selected, editing && styles.editing)}
    >
      <div
        className={styles.summary}
        onClick={(event) => onClick(index, event)}
        onDoubleClick={() => onOpen(issue.id)}
        role="row"
        aria-selected={selected}
      >
        <input
          type="checkbox"
          className={styles.check}
          checked={selected}
          aria-label={`Select issue ${issue.id}`}
          onClick={(event) => event.stopPropagation()}
          onChange={() => onToggle(issue.id)}
        />
        <PriorityMark priority={issue.priority} />
        <StatusPill status={issue.status} />
        <span className={styles.title} data-role="title" title={issue.title}>
          <span className={styles.id}>#{issue.id}</span>
          <span className={styles.titleText}>{issue.title}</span>
        </span>
        <span className={styles.labels}>
          {issue.labels.map((label) => (
            <span key={label} className={styles.label}>
              {label}
            </span>
          ))}
        </span>
        {issue.comments > 0 && (
          <span className={styles.comments} title={`${issue.comments} comments`}>
            <MessageSquare size={13} aria-hidden />
            {issue.comments}
          </span>
        )}
        <Avatar name={issue.assignee} />
        <time className={styles.updated} dateTime={new Date(issue.updated).toISOString()} title={formatTimestamp(issue.updated)}>
          {formatAge(issue.updated, horizon)}
        </time>
        <button
          type="button"
          className={styles.expand}
          aria-expanded={editing}
          aria-label={editing ? "Close editor" : "Edit issue"}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(issue.id);
          }}
        >
          <ChevronDown size={15} aria-hidden />
        </button>
      </div>

      {editing && <IssueEditor issue={issue} />}
    </div>
  );
});
