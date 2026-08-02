import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { useTrackerStore, type FacetKey } from "../../store/trackerStore";
import styles from "./FacetSection.module.css";

interface FacetSectionProps {
  title: string;
  facetKey: FacetKey;
  options: { value: string; label: string }[];
}

/** One collapsible group of OR-ed checkboxes; groups AND with each other. */
export function FacetSection({ title, facetKey, options }: FacetSectionProps) {
  const selected = useTrackerStore((s) => s.facets[facetKey]);
  const toggleFacet = useTrackerStore((s) => s.toggleFacet);
  const clearFacet = useTrackerStore((s) => s.clearFacet);
  const [open, setOpen] = useState(true);

  return (
    <div className={styles.section}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronRight size={13} className={styles.chevron} aria-hidden />
          {title}
          {selected.size > 0 && <span className={styles.badge}>{selected.size}</span>}
        </button>
        {selected.size > 0 && (
          <button type="button" className={styles.reset} onClick={() => clearFacet(facetKey)}>
            reset
          </button>
        )}
      </div>

      {open && (
        <ul className={styles.options}>
          {options.map((option) => (
            <li key={option.value}>
              <label className={styles.option}>
                <input
                  type="checkbox"
                  checked={selected.has(option.value)}
                  onChange={() => toggleFacet(facetKey, option.value)}
                />
                <span className={styles.text}>{option.label}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
