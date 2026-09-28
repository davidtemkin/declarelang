// Where am I: this week, the streak, the week's shape, and the last session —
// or the one running now.

import { useEffect, useMemo, useState } from "react";
import type { LiveSession, Session } from "../api";
import { longDate, relativeDay, startOfWeek, toDay, WEEKDAYS, type Day } from "../lib/dates";
import { clock, distance, duration, heart, plural, SPORT_NAME } from "../lib/format";
import { between, dayLoads, streak, totals } from "../lib/stats";
import { Duration, Figure } from "./Figure";
import { EffortMeter, effortFill } from "./EffortMeter";
import "./Today.css";

interface TodayProps {
  sessions: Session[];
  today: Day;
  live: LiveSession | null;
  onOpen(session: Session): void;
}

export function Today({ sessions, today, live, onOpen }: TodayProps) {
  const weekStart = startOfWeek(today);
  const week = useMemo(() => totals(between(sessions, weekStart, weekStart + 6)), [sessions, weekStart]);
  const lastWeek = useMemo(() => totals(between(sessions, weekStart - 7, weekStart - 1)), [sessions, weekStart]);
  const days = useMemo(() => streak(sessions, today), [sessions, today]);
  const latest = sessions[0] ?? null;

  return (
    <section className="today" aria-label="Today">
      <header className="masthead">
        <span className="masthead__mark">Cadence</span>
        <span className="masthead__date">{longDate(today)}</span>
      </header>

      <div className="today__week">
        <h2 className="label">This week</h2>
        <p className="headline">
          <Figure className="headline__fig" value={week.count} />{" "}
          <span className="headline__word">{plural(week.count, "session")}</span>{" "}
          <span className="headline__word">·</span>{" "}
          <Duration className="headline__fig" minutes={week.minutes} />
        </p>
        <p className="today__aside">
          Last week {lastWeek.count} {plural(lastWeek.count, "session")} · {duration(lastWeek.minutes)}
        </p>
      </div>

      <div className="today__streak">
        <h2 className="label">Streak</h2>
        <p className="streak">
          {days > 0 ? (
            <>
              <Figure className="streak__fig" value={days} />{" "}
              <span className="streak__word">{plural(days, "day")}</span>
            </>
          ) : (
            <span className="streak__none">no streak</span>
          )}
        </p>
      </div>

      <WeekShape sessions={sessions} weekStart={weekStart} today={today} onOpen={onOpen} />

      <div className="today__recent">
        {live && <LiveNow live={live} />}
        {latest && <LastSession session={latest} today={today} onOpen={onOpen} />}
      </div>
    </section>
  );
}

// A fixed scale: a light week looks light, whatever the rest of the week did.
const DAY_SCALE_MINUTES = 150;

function WeekShape({
  sessions, weekStart, today, onOpen,
}: { sessions: Session[]; weekStart: Day; today: Day; onOpen(s: Session): void }) {
  const loads = useMemo(() => dayLoads(sessions, weekStart, 7), [sessions, weekStart]);
  const biggest = loads.reduce((a, b) => (b.minutes > a.minutes ? b : a));

  return (
    <div className="shape">
      <h2 className="label">The week</h2>
      <ol className="shape__days">
        {loads.map((d) => {
          const future = d.day > today;
          const hardest = d.sessions.reduce<Session | null>((a, s) => (!a || s.effort > a.effort ? s : a), null);
          const name = WEEKDAYS[d.day - weekStart];
          const summary = d.sessions.length
            ? `${name}: ${d.sessions.length} ${plural(d.sessions.length, "session")}, ${duration(d.minutes)}`
            : `${name}: ${future ? "still to come" : "rest"}`;
          return (
            <li key={d.day} className={`shape__day${d.day === today ? " is-today" : ""}${future ? " is-future" : ""}`}>
              <button
                type="button"
                className="shape__hit"
                disabled={!hardest}
                onClick={() => hardest && onOpen(hardest)}
                aria-label={summary}
              >
                <span className="shape__track">
                  {d.sessions.map((s) => (
                    <span
                      key={s.id}
                      className="shape__bar"
                      style={{
                        height: `${Math.min(100, (s.minutes / DAY_SCALE_MINUTES) * 100)}%`,
                        background: effortFill(s.effort),
                      }}
                    />
                  ))}
                  {d === biggest && d.minutes > 0 && <span className="shape__value">{duration(d.minutes)}</span>}
                </span>
                <span className="shape__name">{name.slice(0, 3)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function LiveNow({ live }: { live: LiveSession }) {
  // The service reports elapsed time when asked; between reports, keep counting.
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => setReceivedAt(Date.now()), [live.startedSecondsAgo]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = live.startedSecondsAgo + Math.max(0, now - receivedAt) / 1000;

  return (
    <article className="live" aria-live="off">
      <p className="live__status">
        <span className="live__pulse" aria-hidden="true" />
        {SPORT_NAME[live.sport]} in progress
      </p>
      <p className="live__clock" aria-label={`Elapsed ${clock(elapsed)}`}>{clock(elapsed)}</p>
      <p className="live__meta">
        {live.distanceKm !== null && <span>{distance(live.distanceKm)}</span>}
        <span>{heart(live.heartNow)} now</span>
      </p>
    </article>
  );
}

function LastSession({ session, today, onOpen }: { session: Session; today: Day; onOpen(s: Session): void }) {
  return (
    <button type="button" className="last" onClick={() => onOpen(session)}>
      <span className="label">Last session · {relativeDay(toDay(session.date), today)}</span>
      <span className="last__main">
        <span className="last__sport">{SPORT_NAME[session.sport]}</span>
        <Duration className="last__fig" minutes={session.minutes} />
        {session.distanceKm !== null && <span className="last__fig last__fig--dim">{distance(session.distanceKm)}</span>}
      </span>
      <span className="last__how">
        <EffortMeter effort={session.effort} />
        <span>Effort {session.effort}</span>
        {session.heartAvg !== null && <span>{heart(session.heartAvg)}</span>}
      </span>
    </button>
  );
}
