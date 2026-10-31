import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { Account, SeatMap } from "./types";

export const queryKeys = {
  production: ["production"] as const,
  seatMap: (performanceId: string) => ["seatMap", performanceId] as const,
  me: ["me"] as const,
};

export function useProduction() {
  return useQuery({ queryKey: queryKeys.production, queryFn: api.production });
}

export function useSeatMap(performanceId: string) {
  return useQuery({
    queryKey: queryKeys.seatMap(performanceId),
    queryFn: () => api.seatMap(performanceId),
    // The room must never lie: always ask again when someone comes back to it.
    refetchOnMount: "always",
  });
}

export function useAccount() {
  return useQuery<Account | null>({ queryKey: queryKeys.me, queryFn: api.me, staleTime: Infinity });
}

export function useSignIn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      api.signIn(email, password),
    onSuccess: () => queryClient.fetchQuery({ queryKey: queryKeys.me, queryFn: api.me, staleTime: 0 }),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.signOut,
    onSuccess: () => queryClient.setQueryData(queryKeys.me, null),
  });
}

/** Marks seats as sold in the cached seat map for a performance. */
export function markSeatsSold(queryClient: QueryClient, performanceId: string, seatIds: string[]) {
  const sold = new Set(seatIds);
  queryClient.setQueryData<SeatMap>(queryKeys.seatMap(performanceId), (map) =>
    map && {
      ...map,
      sections: map.sections.map((section) => ({
        ...section,
        rows: section.rows.map((row) =>
          row.seats.some((seat) => sold.has(seat.id) && seat.status !== "sold")
            ? {
                ...row,
                seats: row.seats.map((seat) =>
                  sold.has(seat.id) ? { ...seat, status: "sold" as const } : seat,
                ),
              }
            : row,
        ),
      })),
    },
  );
}

/**
 * Follows other people's purchases in a performance, keeping the cached seat map
 * true and telling the caller about each seat as it goes.
 */
export function useSeatEvents(performanceId: string, onSeatTaken: (seatId: string) => void) {
  const queryClient = useQueryClient();
  const onSeatTakenRef = useRef(onSeatTaken);
  useEffect(() => {
    onSeatTakenRef.current = onSeatTaken;
  });

  useEffect(() => {
    const source = new EventSource(api.seatEventsUrl(performanceId));
    let dropped = false;

    source.addEventListener("seatchanged", (event) => {
      const { seatId, status } = JSON.parse((event as MessageEvent<string>).data) as {
        seatId: string;
        status: string;
      };
      if (status !== "sold") return;
      markSeatsSold(queryClient, performanceId, [seatId]);
      onSeatTakenRef.current(seatId);
    });

    // EventSource reconnects by itself; whatever sold while it was away is
    // only learned by asking for the whole map again.
    source.addEventListener("error", () => {
      dropped = true;
    });
    source.addEventListener("open", () => {
      if (!dropped) return;
      dropped = false;
      void queryClient.invalidateQueries({ queryKey: queryKeys.seatMap(performanceId) });
    });

    return () => source.close();
  }, [performanceId, queryClient]);
}
