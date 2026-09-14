// The real path rather than `#imports`: this file sits outside the Nuxt
// tsconfig that defines that alias.
import { useCurrentUser } from '../app/shared/composables/useCurrentUser'

/**
 * Puts a signed-in user into the state the plugin normally writes.
 *
 * The address is a parameter because the account menu is the one place that
 * shows it, and `null` is a real state: a Supabase user can carry no email
 * at all, and the menu has to hold together without one (issue #192).
 */
export function signIn(email: string | null = 'reader@example.com') {
  useCurrentUser().value = { id: 'test-user', email } as never
}

export function signOut() {
  useCurrentUser().value = null
}
