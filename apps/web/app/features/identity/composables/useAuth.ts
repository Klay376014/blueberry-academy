/**
 * Read who is signed in, send them to Google, bring them back, sign them out.
 * Pages and middleware go through here rather than touching the Supabase
 * client, which gives tests a single seam to replace.
 */
export function useAuth() {
  const { $supabase } = useNuxtApp()
  const user = useCurrentUser()
  const localePath = useLocalePath()

  /** Nothing after this call runs: the browser leaves for Google. */
  async function signInWithGoogle() {
    const { error } = await $supabase.auth.signInWithOAuth({
      provider: 'google',
      // Through localePath, so a zh-TW user comes back to /zh-TW/auth/callback
      // and the pages that greet them are still in their language.
      options: { redirectTo: `${window.location.origin}${localePath('/auth/callback')}` },
    })
    if (error) throw error
  }

  /**
   * Trades the code Google sent back for a session. Explicit rather than
   * through `detectSessionInUrl`, so the callback page knows when it is
   * finished instead of polling for a session to appear.
   *
   * Takes the code, not the URL it arrived in: handing
   * `exchangeCodeForSession` the whole URL fails at the token endpoint.
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
