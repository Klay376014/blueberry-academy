/**
 * The whole of what the app can do with authentication: read who is signed in,
 * send them to Google, bring them back, and sign them out.
 *
 * Every page and the middleware go through here rather than touching the
 * Supabase client, which keeps the client in one place and gives tests a single
 * seam to replace.
 */
export function useAuth() {
  const { $supabase } = useNuxtApp()
  const user = useCurrentUser()
  const localePath = useLocalePath()

  /**
   * Hands off to Google. Nothing after this call runs: the browser leaves for
   * Google's consent screen and comes back at /auth/callback.
   */
  async function signInWithGoogle() {
    const { error } = await $supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) throw error
  }

  /**
   * Trades the code Google sent us back with for a session. Explicit rather
   * than through the client's `detectSessionInUrl`, so that the callback page
   * knows when it is finished instead of polling for a session to appear.
   */
  async function completeSignIn(url: string) {
    const { error } = await $supabase.auth.exchangeCodeForSession(url)
    if (error) throw error
  }

  async function signOut() {
    const { error } = await $supabase.auth.signOut()
    if (error) throw error
    await navigateTo(localePath('/login'))
  }

  return { user, signInWithGoogle, completeSignIn, signOut }
}
