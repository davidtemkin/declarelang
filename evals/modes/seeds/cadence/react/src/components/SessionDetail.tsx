// One session: what it was, and where it sits against everything else.

import { useMemo, useState } from "react";
import type { Session } from "../api";
import { fullDate, shortDate, toDay, type Day } from "../lib/dates";
import { duration, pace, SPORT_NAME } from "../lib/format";
import { isHard, standing } from "../lib/stats";
import { EffortMeter, effortFill } from "./EffortMeter";
import { Duration } from "./Figure";
import { useDeleteSession } from "../hooks/useHistory";
import "./SessionDetail.css";

interface Props {
  session: Session;
  sessions: Session[];
  today: Day;
  onEdit(): void;
  onDeleted(): void;
}

const pct = (share: number) => `${Math.round(share * 100)}%`;

export function SessionDetail({ session, sessions, today, onEdit, onDeleted }: Props) {
  const where = useMemo(() => standing(session, sessions), [session, sessions]);
  const hard = isHard(session.effort);
  const sport = SPORT_NAME[session.sport].toLowerCase();
  const paceText = pace(session.sport, session.minutes, session.distanceKm);

  const lines = [
    `Harder than ${pct(where.harderThan)} of everything you've logged.`,
    `Longer than ${pct(where.longerThan)} of your ${sport}s.`,
  ];
  const sinceHarder = where.hardestSince ? toDay(session.date) - toDay(where.hardestSince.date) : Infinity;
  if (sinceHarder >= 14)
    lines.push(where.hardestSince
      ? `Your hardest session since ${shortDate(toDay(where.hardestSince.date), today)}.`
      : `Your hardest session on record.`);
  if (where.furthestSince === null && where.sameSport.length > 0)
    lines.push(session.distanceKm ? `Your furthest ${sport} on record.` : `Your longest ${sport} on record.`);

  return (
    <article className={`detail${hard ? " detail--hard" : ""}`}>
      <header className="detail__head">
        <p className="label">{fullDate(toDay(session.date))}</p>
        <h2 className="detail__sport">{SPORT_NAME[session.sport]}</h2>
      </header>

      <div className="detail__effort">
        <p className="detail__effortfig" style={{ color: hard ? "var(--accent)" : undefined }}>
          {session.effort}
          <span className="detail__of">/10</span>
        </p>
        <div>
          <p className="label">Effort{hard ? " · hard" : ""}</p>
          <EffortMeter effort={session.effort} className="meter--large" />
        </div>
      </div>

      <dl className="detail__facts">
        <div>
          <dt className="label">Time</dt>
          <dd><Duration minutes={session.minutes} /></dd>
        </div>
        {session.distanceKm !== null && (
          <div>
            <dt className="label">Distance</dt>
            <dd>{session.distanceKm.toFixed(1)}<span className="unit"> km</span></dd>
          </div>
        )}
        {session.heartAvg !== null && (
          <div>
            <dt className="label">Heart rate</dt>
            <dd>{session.heartAvg}<span className="unit"> bpm</span></dd>
          </div>
        )}
        {paceText && (
          <div>
            <dt className="label">Pace</dt>
            <dd className="detail__pace">{paceText}</dd>
          </div>
        )}
      </dl>

      {session.note && <blockquote className="detail__note">{session.note}</blockquote>}

      <section className="detail__where" aria-label="Where it sits">
        <h3 className="label">Where it sits</h3>
        <ul>
          {lines.map((l) => <li key={l}>{l}</li>)}
        </ul>
        <Scatter session={session} others={where.sameSport} />
        <p className="detail__caption">
          Every {sport} you've logged, by time and effort. This one is marked.
        </p>
      </section>

      <Actions session={session} onEdit={onEdit} onDeleted={onDeleted} />
    </article>
  );
}

/** Every session of the same sport, time across and effort up, with this one marked. */
function Scatter({ session, others }: { session: Session; others: Session[] }) {
  const W = 320, H = 150, pad = 8;
  const maxMin = Math.max(session.minutes, ...others.map((s) => s.minutes));
  const x = (m: number) => pad + (m / maxMin) * (W - pad * 2);
  const y = (e: number) => H - pad - ((e - 1) / 9) * (H - pad * 2);
  // Separate sessions that land on the same spot, deterministically.
  const jitter = (id: string) => ((parseInt(id.replace(/\D/g, ""), 10) * 37) % 11) - 5;
  return (
    <svg className="scatter" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`${duration(session.minutes)} at effort ${session.effort}, among ${others.length} others`}>
      <line x1={pad} x2={W - pad} y1={y(7) + 6} y2={y(7) + 6} className="scatter__rule" />
      {others.map((s) => (
        <circle key={s.id} cx={x(s.minutes)} cy={y(s.effort) + jitter(s.id) * 0.8} r={3} fill={effortFill(s.effort)} opacity={0.55} />
      ))}
      <circle cx={x(session.minutes)} cy={y(session.effort)} r={9} className="scatter__me" fill={effortFill(session.effort)} />
    </svg>
  );
}

function Actions({ session, onEdit, onDeleted }: { session: Session; onEdit(): void; onDeleted(): void }) {
  const remove = useDeleteSession();
  const [confirming, setConfirming] = useState(false);
  return (
    <footer className="detail__actions">
      <button type="button" className="button" onClick={onEdit}>Correct it</button>
      <button
        type="button"
        className={`button button--quiet${confirming ? " is-confirming" : ""}`}
        disabled={remove.isPending}
        onClick={() => {
          if (!confirming) return setConfirming(true);
          remove.mutate(session.id, { onSuccess: onDeleted });
        }}
        onBlur={() => setConfirming(false)}
      >
        {remove.isPending ? "Deleting…" : confirming ? "Tap again to delete" : "Delete"}
      </button>
      {remove.error && <p className="form__error" role="alert">{remove.error.message}</p>}
    </footer>
  );
}
