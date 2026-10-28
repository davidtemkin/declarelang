// The Cadence data service. It is the whole backend; see task/api/API.md.

export const SPORTS = ["run", "ride", "lift", "swim"] as const;
export type Sport = (typeof SPORTS)[number];

export interface Session {
  id: string;
  date: string; // YYYY-MM-DD, the person's own calendar day
  sport: Sport;
  minutes: number;
  distanceKm: number | null;
  effort: number; // 1–10
  heartAvg: number | null;
  note: string | null;
}

export type SessionInput = Omit<Session, "id" | "heartAvg"> & { heartAvg?: number | null };

export interface LiveSession {
  id: "live";
  date: string;
  sport: Sport;
  startedSecondsAgo: number;
  minutes: number;
  distanceKm: number | null;
  heartNow: number;
  effort: number;
}

const BASE = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8320";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly problems: string[] = [],
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(body.message ?? body.error ?? `Request failed (${res.status})`, res.status, body.problems);
  }
  return body as T;
}

export const api = {
  today: () => request<{ today: string }>("/api/today").then((b) => b.today),
  sessions: () => request<{ sessions: Session[] }>("/api/sessions").then((b) => b.sessions),
  live: () => request<{ session: LiveSession | null }>("/api/live").then((b) => b.session),
  create: (input: SessionInput) =>
    request<Session>("/api/sessions", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, changes: Partial<SessionInput>) =>
    request<Session>(`/api/sessions/${id}`, { method: "PUT", body: JSON.stringify(changes) }),
  remove: (id: string) => request<{ deleted: string }>(`/api/sessions/${id}`, { method: "DELETE" }),
};
