import { createClient } from '@supabase/supabase-js'

/**
 * The one Supabase client, created in the browser and nowhere else: the app is
 * `ssr: false`, the browser signs in with the user's own JWT and the anon key,
 * and RLS does the rest. No service_role key ever enters this app.
 */
export default defineNuxtPlugin(async () => {
  const { supabaseUrl, supabaseAnonKey } = useRuntimeConfig().public

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Spelled out because the default, 'implicit', returns the tokens in the
      // URL fragment — into history, into anything copied out of the address
      // bar. PKCE returns a single-use code instead.
      flowType: 'pkce',
      // /auth/callback trades the code itself, so the client must not race it.
      detectSessionInUrl: false,
    },
  })

  const user = useCurrentUser()

  // Awaited: the route middleware runs straight after the plugins, and a
  // session not yet restored looks exactly like being signed out, so every
  // reload of a protected page would bounce to /login.
  const { data } = await client.auth.getSession()
  user.value = data.session?.user ?? null

  const aliases = useShowdownAliases()

  client.auth.onAuthStateChange((_event, session) => {
    const next = session?.user ?? null

    // Signing out and in again happens without a page reload, so the alias
    // list in memory would otherwise end up on the next user's screen — and
    // could be written into their profile.
    if (next?.id !== user.value?.id) aliases.value = null

    user.value = next
  })

  return { provide: { supabase: client } }
})
