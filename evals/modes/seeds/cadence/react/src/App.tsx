import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "./api";
import { toDay, relativeDay, type Day } from "./lib/dates";
import { duration, SPORT_NAME } from "./lib/format";
import { useDeleteSession, useLive, useSessions, useToday } from "./hooks/useHistory";
import { useRoute } from "./hooks/useRoute";
import { Today } from "./components/Today";
import { Year } from "./components/Year";
import { Sheet } from "./components/Sheet";
import { SessionDetail } from "./components/SessionDetail";
import { SessionForm } from "./components/SessionForm";
import { isHard } from "./lib/stats";

export function App() {
  const today = useToday();
  const sessions = useSessions();

  if (today.error || sessions.error) {
    return (
      <main className="status" role="alert">
        <p className="status__big">No signal</p>
        <p>Couldn't reach the training log service on port 8320. Is it running?</p>
        <button type="button" className="button" onClick={() => { today.refetch(); sessions.refetch(); }}>
          Try again
        </button>
      </main>
    );
  }
  if (!today.data || !sessions.data) {
    return <main className="status" aria-busy="true"><p className="status__big">Cadence</p></main>;
  }
  return <Log today={toDay(today.data)} sessions={sessions.data} />;
}

function Log({ today, sessions }: { today: Day; sessions: Session[] }) {
  const live = useLive();
  const { route, navigate, close } = useRoute();
  const [toast, setToast] = useState<Session | null>(null);

  const open = useCallback((s: Session) => navigate({ name: "session", id: s.id }), [navigate]);
  const add = useCallback(() => navigate({ name: "add" }), [navigate]);
  const dismissToast = useCallback(() => setToast(null), []);

  // "n" starts a new session from anywhere, for someone at a keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !t.closest("input, textarea, dialog")) {
        e.preventDefault();
        add();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [add]);

  const current = route.name === "session" || route.name === "edit"
    ? sessions.find((s) => s.id === route.id) ?? null
    : null;

  return (
    <>
      <main className="app">
        <Today sessions={sessions} today={today} live={live.data ?? null} onOpen={open} />
        <Year sessions={sessions} today={today} selectedId={current?.id ?? null} onSelect={open} />
      </main>

      <div className="dock">
        <button type="button" className="dock__add" onClick={add} aria-keyshortcuts="n">
          <span aria-hidden="true" className="dock__plus">+</span> Log a session
        </button>
      </div>

      {route.name === "add" && (
        <Sheet label="Log a session" onClose={close}>
          <SessionForm
            sessions={sessions}
            today={today}
            onSaved={(s) => {
              setToast(s);
              close();
            }}
          />
        </Sheet>
      )}

      {route.name === "session" && current && (
        <Sheet label={`${SPORT_NAME[current.sport]} session`} onClose={close} tone={isHard(current.effort) ? "hard" : "plain"}>
          <SessionDetail
            session={current}
            sessions={sessions}
            today={today}
            onEdit={() => navigate({ name: "edit", id: current.id })}
            onDeleted={close}
          />
        </Sheet>
      )}

      {route.name === "edit" && current && (
        <Sheet label="Correct this session" onClose={close}>
          <SessionForm sessions={sessions} today={today} editing={current} onSaved={close} />
        </Sheet>
      )}

      {(route.name === "session" || route.name === "edit") && !current && (
        <Sheet label="Not found" onClose={close}>
          <p className="status__big">Gone</p>
          <p>That session isn't in the log any more.</p>
        </Sheet>
      )}

      {toast && <SavedToast session={toast} today={today} onDone={dismissToast} />}
    </>
  );
}

/** Confirms a new session landed, and offers to take it back. */
function SavedToast({ session, today, onDone }: { session: Session; today: Day; onDone(): void }) {
  const remove = useDeleteSession();
  const timer = useRef<number>(undefined);
  useEffect(() => {
    timer.current = window.setTimeout(onDone, 6000);
    return () => window.clearTimeout(timer.current);
  }, [session, onDone]);

  return (
    <div className="toast" role="status">
      <span>
        Logged {SPORT_NAME[session.sport].toLowerCase()}, {duration(session.minutes)}, {relativeDay(toDay(session.date), today)}
      </span>
      <button
        type="button"
        className="toast__undo"
        disabled={remove.isPending}
        onClick={() => remove.mutate(session.id, { onSuccess: onDone })}
      >
        Undo
      </button>
    </div>
  );
}
