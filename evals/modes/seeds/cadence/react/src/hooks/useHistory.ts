// Server state. The whole history is held in one query; every mutation writes
// its result straight back into it, so everything derived from the history is
// true the moment the service answers.

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, type Session, type SessionInput } from "../api";

const keys = {
  today: ["today"] as const,
  sessions: ["sessions"] as const,
  live: ["live"] as const,
};

export function useToday() {
  return useQuery({ queryKey: keys.today, queryFn: api.today, staleTime: Infinity });
}

export function useSessions() {
  return useQuery({ queryKey: keys.sessions, queryFn: api.sessions, staleTime: Infinity });
}

export function useLive() {
  return useQuery({ queryKey: keys.live, queryFn: api.live, refetchInterval: 5_000 });
}

const newestFirst = (a: Session, b: Session) =>
  a.date === b.date ? (a.id < b.id ? 1 : -1) : a.date < b.date ? 1 : -1;

function write(client: QueryClient, update: (sessions: Session[]) => Session[]) {
  client.setQueryData<Session[]>(keys.sessions, (old) => (old ? update(old).sort(newestFirst) : old));
}

export function useCreateSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SessionInput) => api.create(input),
    onSuccess: (created) => write(client, (all) => [...all, created]),
  });
}

export function useUpdateSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: Partial<SessionInput> }) => api.update(id, changes),
    onSuccess: (updated) => write(client, (all) => all.map((s) => (s.id === updated.id ? updated : s))),
  });
}

export function useDeleteSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: ({ deleted }) => write(client, (all) => all.filter((s) => s.id !== deleted)),
  });
}
