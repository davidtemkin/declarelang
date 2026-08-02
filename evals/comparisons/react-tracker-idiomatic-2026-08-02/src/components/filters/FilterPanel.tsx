import { FilterX } from "lucide-react";
import { STATUSES, STATUS_LABEL } from "../../data/types";
import { facetsAreEmpty } from "../../domain/query";
import { useTrackerStore } from "../../store/trackerStore";
import { useViewModel } from "../../state/viewModel";
import { displayAssignee } from "../ui/Avatar";
import { FacetSection } from "./FacetSection";
import styles from "./FilterPanel.module.css";

export function FilterPanel() {
  const { facetValues } = useViewModel();
  const facets = useTrackerStore((s) => s.facets);
  const query = useTrackerStore((s) => s.query);
  const clearAllFilters = useTrackerStore((s) => s.clearAllFilters);

  const dirty = !facetsAreEmpty(facets) || query !== "";

  return (
    <section className={styles.panel} aria-label="Filters">
      <header className={styles.head}>
        <h2 className={styles.heading}>Filters</h2>
        {dirty && (
          <button type="button" className="btn btn--ghost" onClick={clearAllFilters}>
            <FilterX size={14} aria-hidden /> Clear all
          </button>
        )}
      </header>

      <FacetSection
        title="Status"
        facetKey="statuses"
        options={STATUSES.map((status) => ({ value: status, label: STATUS_LABEL[status] }))}
      />
      <FacetSection
        title="Assignee"
        facetKey="assignees"
        options={facetValues.assignees.map((value) => ({ value, label: displayAssignee(value) }))}
      />
      <FacetSection
        title="Label"
        facetKey="labels"
        options={facetValues.labels.map((value) => ({ value, label: value }))}
      />
    </section>
  );
}
