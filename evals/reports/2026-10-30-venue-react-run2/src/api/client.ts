import type {
  Account,
  NewOrder,
  Order,
  Production,
  SeatMap,
  SessionUser,
} from "./types";

export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8351";

/** A refusal from the service. `message` is written for the person; show it as it is. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field?: string;
  readonly conflicts?: string[];

  constructor(
    status: number,
    body: { error?: string; message?: string; field?: string; conflicts?: string[] },
  ) {
    super(body.message ?? "Something went wrong. Please try again.");
    this.name = "ApiError";
    this.status = status;
    this.code = body.error ?? "unknown";
    this.field = body.field;
    this.conflicts = body.conflicts;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      // The session lives in an HttpOnly cookie; every request carries it.
      credentials: "include",
      cache: "no-store",
      headers: init.body ? { "Content-Type": "application/json", ...init.headers } : init.headers,
    });
  } catch {
    throw new ApiError(0, {
      error: "network",
      message: "We couldn't reach the box office. Check your connection and try again.",
    });
  }

  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, body);
  return body as T;
}

export const api = {
  production: () => request<Production>("/api/production"),

  seatMap: (performanceId: string) =>
    request<SeatMap>(`/api/performances/${encodeURIComponent(performanceId)}/seats`),

  /** Resolves to `null` when nobody is signed in. */
  me: async () => {
    try {
      return await request<Account>("/api/me");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },

  signIn: (email: string, password: string) =>
    request<SessionUser>("/api/session", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  signOut: () => request<void>("/api/session", { method: "DELETE" }),

  placeOrder: (order: NewOrder) =>
    request<Order>("/api/orders", { method: "POST", body: JSON.stringify(order) }),

  seatEventsUrl: (performanceId: string) =>
    `${API_BASE}/api/events?performance=${encodeURIComponent(performanceId)}`,
};
