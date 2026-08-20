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
      // Through localePath, so a zh-TW user comes back to
      // /zh-TW/auth/callback and the page that greets them -- and the
      // dashboard it forwards to -- are still in their language.
      options: { redirectTo: `${window.location.origin}${localePath('/auth/callback')}` },
    })
    if (error) throw error
  }

  /**
   * Trades the code Google sent us back with for a session. Explicit rather
   * than through the client's `detectSessionInUrl`, so that the callback page
   * knows when it is finished instead of polling for a session to appear.
   *
   * Takes the code, not the URL it arrived in -- that is what
   * `exchangeCodeForSession` accepts, and handing it the whole URL fails at
   * the token endpoint.
   */
  async function completeSignIn(code: string) {
    const { error } = await $supabase.auth.exchangeCodeForSession(code)
    if (error) throw error
  }

  async function signOut() {
    const { error } = await $supabase.auth.signOut()
    if (error) throw error
    await navigateTo(localePath('/login'))
  }

  return { user, signInWithGoogle, completeSignIn, signOut }
}
