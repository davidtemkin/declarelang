import { useEffect, useId, useRef } from "react";
import { useForm } from "react-hook-form";
import { Trash2 } from "lucide-react";
import type { Issue } from "../../data/types";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from "../../data/types";
import { useTrackerStore, type IssueDraft } from "../../store/trackerStore";
import { useDeleteWithUndo } from "../../hooks/useDeleteWithUndo";
import { formatTimestamp } from "../../lib/format";
import styles from "./IssueEditor.module.css";

/** The form's own shape: labels are edited as one comma-separated field. */
interface EditorFields {
  title: string;
  description: string;
  status: Issue["status"];
  priority: Issue["priority"];
  assignee: string;
  labels: string;
}

const toFields = (issue: Issue): EditorFields => ({
  title: issue.title,
  description: issue.description,
  status: issue.status,
  priority: issue.priority,
  assignee: issue.assignee ?? "",
  labels: issue.labels.join(", "),
});

const toDraft = (fields: EditorFields): IssueDraft => ({
  title: fields.title.trim(),
  description: fields.description.trim(),
  status: fields.status,
  priority: fields.priority,
  assignee: fields.assignee.trim() === "" ? null : fields.assignee.trim(),
  labels: [...new Set(fields.labels.split(",").map((l) => l.trim().toLowerCase()).filter(Boolean))],
});

/**
 * Draft semantics come from react-hook-form keeping every edit in its own
 * uncontrolled store: nothing reaches the tracker store until `Save` submits,
 * so `Cancel` and `Esc` discard by simply unmounting. There is no autosave.
 */
export function IssueEditor({ issue }: { issue: Issue }) {
  const saveIssue = useTrackerStore((s) => s.saveIssue);
  const closeEditor = useTrackerStore((s) => s.closeEditor);
  const deleteWithUndo = useDeleteWithUndo();
  const fieldId = useId();
  const titleRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, formState } = useForm<EditorFields>({
    defaultValues: toFields(issue),
  });

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, []);

  const { ref: registerTitleRef, ...titleField } = register("title", { required: true });

  return (
    <form
      className={styles.editor}
      onSubmit={handleSubmit((fields) => saveIssue(issue.id, toDraft(fields)))}
      onClick={(event) => event.stopPropagation()}
    >
      <div className={styles.grid}>
        <label className={styles.wide} htmlFor={`${fieldId}-title`}>
          <span className={styles.legend}>Title</span>
          <input
            id={`${fieldId}-title`}
            className="field"
            {...titleField}
            ref={(node) => {
              registerTitleRef(node);
              titleRef.current = node;
            }}
          />
        </label>

        <label htmlFor={`${fieldId}-status`}>
          <span className={styles.legend}>Status</span>
          <select id={`${fieldId}-status`} className="field" {...register("status")}>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor={`${fieldId}-priority`}>
          <span className={styles.legend}>Priority</span>
          <select id={`${fieldId}-priority`} className="field" {...register("priority")}>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABEL[priority]}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor={`${fieldId}-assignee`}>
          <span className={styles.legend}>Assignee</span>
          <input
            id={`${fieldId}-assignee`}
            className="field"
            placeholder="Unassigned"
            {...register("assignee")}
          />
        </label>

        <label className={styles.wide} htmlFor={`${fieldId}-labels`}>
          <span className={styles.legend}>Labels</span>
          <input
            id={`${fieldId}-labels`}
            className="field"
            placeholder="comma, separated"
            {...register("labels")}
          />
        </label>

        <label className={styles.full} htmlFor={`${fieldId}-description`}>
          <span className={styles.legend}>Description</span>
          <textarea
            id={`${fieldId}-description`}
            className={`field ${styles.textarea}`}
            rows={3}
            {...register("description")}
          />
        </label>
      </div>

      <div className={styles.actions}>
        <span className={styles.meta}>
          Created {formatTimestamp(issue.created)} · {issue.comments} comments
          {formState.isDirty && <em className={styles.dirty}>unsaved draft</em>}
        </span>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => deleteWithUndo([issue.id])}
        >
          <Trash2 size={14} aria-hidden /> Delete
        </button>
        <button type="button" className="btn" onClick={closeEditor}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          Save
        </button>
      </div>
    </form>
  );
}
