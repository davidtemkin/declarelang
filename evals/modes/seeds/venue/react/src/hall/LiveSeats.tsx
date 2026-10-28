import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type Performance, type SeatMap } from '../api'
import { useBooking } from '../booking'
import { listJoin, seatName } from '../format'
import { useSeatMapQuery } from '../queries'

export type SeatInfo = {
  id: string
  name: string
  sectionKey: string
  sectionName: string
  row: string
  number: number
  priceCents: number
  feeCents: number
}

type LiveSeats = {
  performance: Performance
  seatMap: SeatMap
  /** Every seat that is gone: sold when the map was fetched, or since. */
  sold: ReadonlySet<string>
  seats: ReadonlyMap<string, SeatInfo>
  refetch: () => void
}

const LiveSeatsContext = createContext<LiveSeats | null>(null)

/**
 * Holds one performance's seat map and keeps it true: it listens to the
 * service's stream of other people's purchases for as long as the person is
 * in the hall or at checkout, and takes any seat they had chosen out of their
 * choice — telling them which — the moment someone else buys it.
 */
export function LiveSeatsProvider({
  performance,
  children,
  fallback,
}: {
  performance: Performance
  children: ReactNode
  fallback: (state: { error: Error | null; retry: () => void }) => ReactNode
}) {
  const performanceId = performance.id
  const query = useSeatMapQuery(performanceId)
  const { refetch } = query
  const [liveSold, setLiveSold] = useState<ReadonlySet<string>>(() => new Set())

  // (The provider is keyed by performance, so liveSold starts empty for each.)
  useEffect(() => {
    const source = new EventSource(api.eventsUrl(performanceId))
    let dropped = false
    source.addEventListener('seatchanged', (event) => {
      const { seatId, status } = JSON.parse((event as MessageEvent<string>).data) as {
        seatId: string
        status: string
      }
      if (status !== 'available') setLiveSold((prev) => new Set(prev).add(seatId))
    })
    source.addEventListener('error', () => (dropped = true))
    source.addEventListener('open', () => {
      // Back after a dropped connection: anything could have sold meanwhile.
      if (dropped) refetch()
      dropped = false
    })
    return () => source.close()
  }, [performanceId, refetch])

  const seatMap = query.data
  const sold = useMemo(() => {
    const set = new Set(liveSold)
    for (const section of seatMap?.sections ?? [])
      for (const row of section.rows)
        for (const seat of row.seats) if (seat.status === 'sold') set.add(seat.id)
    return set
  }, [seatMap, liveSold])

  const seats = useMemo(() => {
    const index = new Map<string, SeatInfo>()
    for (const section of seatMap?.sections ?? [])
      for (const row of section.rows)
        for (const seat of row.seats)
          index.set(seat.id, {
            id: seat.id,
            name: seatName(section.name, row.name, seat.number),
            sectionKey: section.key,
            sectionName: section.name,
            row: row.name,
            number: seat.number,
            priceCents: section.priceCents,
            feeCents: section.feeCents,
          })
    return index
  }, [seatMap])

  const { performanceId: bookingFor, selected, paying, lose } = useBooking()
  useEffect(() => {
    if (!seatMap || paying || bookingFor !== performanceId) return
    const lost = selected.filter((id) => sold.has(id))
    if (!lost.length) return
    const names = lost.map((id) => seats.get(id)?.name ?? id)
    lose(
      lost,
      `${listJoin(names)} ${lost.length === 1 ? 'has' : 'have'} just been taken by someone else.`,
    )
  }, [seatMap, sold, seats, selected, paying, bookingFor, performanceId, lose])

  const value = useMemo(
    () => (seatMap ? { performance, seatMap, sold, seats, refetch: () => void refetch() } : null),
    [performance, seatMap, sold, seats, refetch],
  )

  if (!value) return fallback({ error: query.error, retry: () => void refetch() })
  return <LiveSeatsContext.Provider value={value}>{children}</LiveSeatsContext.Provider>
}

export function useLiveSeats() {
  const ctx = useContext(LiveSeatsContext)
  if (!ctx) throw new Error('useLiveSeats must be used inside <LiveSeatsProvider>')
  return ctx
}
