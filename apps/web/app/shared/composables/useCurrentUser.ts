import type { User } from '@supabase/supabase-js'

/**
 * Who is signed in, or null. Written by the Supabase plugin at boot and on
 * every auth state change.
 *
 * `useState` rather than a module-level ref throughout this app: the value
 * lives on the Nuxt instance and so resets between tests.
 */
export function useCurrentUser() {
  return useState<User | null>('current-user', () => null)
}
