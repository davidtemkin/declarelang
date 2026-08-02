// Sidebar.jsx — live statistics, all recomputed from the data on every
// mutation or filter change (see restats in store.js): per-status counts,
// open work per assignee, and closed-per-day over the last 14 dataset days.
import {
  useStore, derived, ui, setFilter, setStatsOpen, STATUSES, STATUS_LABELS,
} from "./hooks.js";

const DAY = 86400000;

export default function Sidebar() {
  useStore();
  const { byStatus, byAssignee, closedPerDay, horizon } = derived.stats;
  const statusMax = Math.max(1, ...STATUSES.map((s) => byStatus[s] ?? 0));
  const aMax = Math.max(1, ...byAssignee.map(([, n]) => n));
  const dMax = Math.max(1, ...closedPerDay);
  const dayLabel = (i) => {
    const d = new Date(horizon - (13 - i) * DAY);
    return (d.getUTCMonth() + 1) + "/" + d.getUTCDate();
  };
  return (
    <aside className={"sidebar" + (ui.statsOpen ? " open" : "")}>
      <div className="side-head">
        <span>Statistics</span>
        <button className="btn icon closebtn" onClick={() => setStatsOpen(false)} aria-label="Close stats">×</button>
      </div>

      <section>
        <h3>By status</h3>
        {STATUSES.map((s) => (
          <button key={s} className="statrow" onClick={() => setFilter("status", ui.fStatus === s ? "" : s)}>
            <span className={"dot st-" + s} />
            <span className="statname">{STATUS_LABELS[s]}</span>
            <span className="statbar"><i style={{ width: (100 * (byStatus[s] ?? 0)) / statusMax + "%" }} className={"bg-" + s} /></span>
            <span className="statnum">{(byStatus[s] ?? 0).toLocaleString()}</span>
          </button>
        ))}
      </section>

      <section>
        <h3>Open work by assignee</h3>
        <div className="alist">
          {byAssignee.length === 0 && <div className="side-none">No open issues</div>}
          {byAssignee.map(([name, n]) => (
            <button
              key={name}
              className="statrow"
              onClick={() => setFilter("assignee", name === "Unassigned" ? (ui.fAssignee === "__none" ? "" : "__none") : (ui.fAssignee === name ? "" : name))}
            >
              <span className={"statname" + (name === "Unassigned" ? " dim" : "")}>{name}</span>
              <span className="statbar"><i style={{ width: (100 * n) / aMax + "%" }} /></span>
              <span className="statnum">{n.toLocaleString()}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>Closed per day <span className="dim">(last 14d)</span></h3>
        <div className="chart" role="img" aria-label="Issues closed per day, last 14 days">
          {closedPerDay.map((n, i) => (
            <div className="cbar" key={i} title={dayLabel(i) + ": " + n + " closed"}>
              <i style={{ height: Math.max(n > 0 ? 2 : 0, (100 * n) / dMax) + "%" }} />
            </div>
          ))}
        </div>
        <div className="chart-x">
          <span>{dayLabel(0)}</span>
          <span>{dayLabel(13)}</span>
        </div>
      </section>
    </aside>
  );
}
