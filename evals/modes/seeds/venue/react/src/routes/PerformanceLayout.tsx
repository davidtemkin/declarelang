import { useEffect } from 'react'
import { Outlet, useParams } from 'react-router'
import { useBooking } from '../booking'
import { LiveSeatsProvider } from '../hall/LiveSeats'
import { usePerformance } from '../queries'
import { Gone, LoadError, Loading } from './Status'

/** The hall and checkout share one live seat map, so nothing is refetched or missed between them. */
export function PerformanceLayout() {
  const { performanceId } = useParams<{ performanceId: string }>()
  const { performance, isPending, error, refetch } = usePerformance(performanceId)
  const { enter } = useBooking()

  useEffect(() => {
    if (performance) enter(performance.id)
  }, [performance, enter])

  if (isPending) return <Loading label="Opening the house…" />
  if (error) return <LoadError error={error} retry={refetch} />
  if (!performance)
    return <Gone title="We can’t find that performance">It may have been moved or cancelled.</Gone>

  return (
    <LiveSeatsProvider
      key={performance.id}
      performance={performance}
      fallback={({ error, retry }) =>
        error ? <LoadError error={error} retry={retry} /> : <Loading label="Opening the house…" />
      }
    >
      <Outlet />
    </LiveSeatsProvider>
  )
}
