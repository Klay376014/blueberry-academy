import { createBattles } from '../lib/battles'
import type { Battles } from '../lib/battles'

/**
 * `app/lib/battles.ts` with this app's client and this session's user already
 * bound to it.
 *
 * The user is handed over as a lookup rather than a value: a composable is
 * reached in setup, which runs before the route middleware has bounced a
 * signed-out visitor, and signing in as somebody else happens without a page
 * reload. Every query therefore asks who is signed in at the moment it runs.
 */
export function useBattles(): Battles {
  const { $supabase } = useNuxtApp()
  const user = useCurrentUser()

  return createBattles($supabase, () => {
    const id = user.value?.id
    if (!id) throw new Error('No signed-in user to read battles for.')

    return id
  })
}
