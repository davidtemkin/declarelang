import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

export const keys = {
  production: ['production'] as const,
  seats: (performanceId: string) => ['seats', performanceId] as const,
  me: ['me'] as const,
}

export function useProduction() {
  return useQuery({ queryKey: keys.production, queryFn: api.production })
}

export function usePerformance(performanceId: string | undefined) {
  const production = useProduction()
  const performance = production.data?.performances.find((p) => p.id === performanceId)
  return { ...production, performance }
}

export function useSeatMapQuery(performanceId: string) {
  return useQuery({
    queryKey: keys.seats(performanceId),
    queryFn: () => api.seatMap(performanceId),
    // Seats change under us constantly; always ask afresh when the hall is opened.
    staleTime: 0,
    refetchOnMount: 'always',
  })
}

/** The signed-in account; `data` is null when signed out. */
export function useAccount() {
  return useQuery({ queryKey: keys.me, queryFn: api.me, staleTime: 60_000 })
}

export function useSignIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      api.signIn(email, password),
    // The session response is only name and email; fetch the full account.
    onSuccess: () => queryClient.fetchQuery({ queryKey: keys.me, queryFn: api.me, staleTime: 0 }),
  })
}

export function useSignOut() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.signOut,
    onSuccess: () => queryClient.setQueryData(keys.me, null),
  })
}
