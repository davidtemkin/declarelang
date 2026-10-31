import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useOutletContext, useParams } from "react-router";
import { useProduction, useSeatEvents, useSeatMap } from "../api/queries";
import type { Performance, Production, SeatMap } from "../api/types";
import { indexSeats, listLabels } from "../hall/seats";
import { useSelection } from "../selection";
import { PageMessage } from "../ui/PageMessage";

export type PerformanceContext = {
  production: Production;
  performance: Performance;
  seatMap: SeatMap;
  /** Seats someone else took in the last moment. */
  justTaken: ReadonlySet<string>;
};

export function usePerformance() {
  return useOutletContext<PerformanceContext>();
}

/**
 * Everything under one performance — the hall and checkout — shares its seat
 * map, kept true by the live feed of other people's purchases.
 */
export function PerformanceRoute() {
  const { performanceId = "" } = useParams();
  const production = useProduction();
  const seatMap = useSeatMap(performanceId);
  const { seatIdsFor, loseSeats, paying } = useSelection();
  const seatIds = seatIdsFor(performanceId);

  const [justTaken, setJustTaken] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Set<number>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const onSeatTaken = useCallback((seatId: string) => {
    setJustTaken((seats) => new Set(seats).add(seatId));
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      setJustTaken((seats) => {
        const next = new Set(seats);
        next.delete(seatId);
        return next;
      });
    }, 1600);
    timers.current.add(timer);
  }, []);
  useSeatEvents(performanceId, onSeatTaken);

  // A seat that has sold to someone else cannot stay in this person's choice,
  // however we learned of it: the live feed, or a fresh look at the map.
  useEffect(() => {
    if (!seatMap.data || seatIds.length === 0 || paying) return;
    const index = indexSeats(seatMap.data);
    const lost = seatIds.filter((id) => index.get(id)?.seat.status === "sold");
    if (lost.length === 0) return;
    const labels = lost.map((id) => index.get(id)!.label);
    loseSeats(
      lost,
      lost.length === 1
        ? `${labels[0]} has just been taken by someone else, so it has left your choice.`
        : `${listLabels(labels)} have just been taken by someone else, so they have left your choice.`,
    );
  }, [seatMap.data, seatIds, loseSeats, paying]);

  if (production.isError || seatMap.isError) {
    return (
      <PageMessage
        title="The box office isn't answering"
        body={(production.error ?? seatMap.error)!.message}
        onRetry={() => {
          void production.refetch();
          void seatMap.refetch();
        }}
      />
    );
  }
  if (!production.data || !seatMap.data) return <PageMessage title="Opening the hall…" busy />;

  const performance = production.data.performances.find((p) => p.id === performanceId);
  if (!performance) return <Navigate to="/" replace />;

  return (
    <Outlet
      context={
        {
          production: production.data,
          performance,
          seatMap: seatMap.data,
          justTaken,
        } satisfies PerformanceContext
      }
    />
  );
}
