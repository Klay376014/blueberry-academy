import type { User } from '@supabase/supabase-js'

/**
 * Who is signed in, or null. Written by the Supabase plugin at boot and on
 * every auth state change; read by everything else.
 *
 * A `useState` rather than a module-level ref so that the value lives on the
 * Nuxt instance, which is what makes it resettable between tests.
 */
export function useCurrentUser() {
  return useState<User | null>('current-user', () => null)
}
