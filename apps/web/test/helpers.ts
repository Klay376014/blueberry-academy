// The real path rather than `#imports`: this file sits outside the Nuxt
// tsconfig that defines that alias.
import { useCurrentUser } from '../app/composables/useCurrentUser'

/**
 * Puts a signed-in user into the state the plugin normally writes. Most pages
 * are behind the login, so a test that wants to see one starts here.
 */
export function signIn() {
  useCurrentUser().value = { id: 'test-user' } as never
}

export function signOut() {
  useCurrentUser().value = null
}
