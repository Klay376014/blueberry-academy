import { createBattles } from '../lib/battles'
import type { Battles } from '../lib/battles'

/**
 * `app/lib/battles.ts` with this app's client and this session's user already
 * bound to it.
 *
 * The user is looked up per call rather than at construction: a composable is
 * reached in setup, which runs before the route middleware has bounced a
 * signed-out visitor, and signing in as somebody else happens without a page
 * reload.
 */
export function useBattles(): Battles {
  const { $supabase } = useNuxtApp()
  const user = useCurrentUser()

  function bound(): Battles {
    const id = user.value?.id
    if (!id) throw new Error('No signed-in user to read battles for.')

    return createBattles($supabase, id)
  }

  return {
    battlesOf: (range) => bound().battlesOf(range),
    battleById: (replayId) => bound().battleById(replayId),
    gamesOfSeries: (seriesId) => bound().gamesOfSeries(seriesId),
    detailsOf: (replayIds) => bound().detailsOf(replayIds),
    knownReplayIds: (ids) => bound().knownReplayIds(ids),
    putBattle: (row) => bound().putBattle(row),
  }
}
