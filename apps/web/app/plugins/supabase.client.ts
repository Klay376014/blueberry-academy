import { createClient } from '@supabase/supabase-js'

/**
 * The one Supabase client, created in the browser and nowhere else.
 *
 * The app is `ssr: false` and the free-plan Worker has no business holding a
 * session, so this is a `.client` plugin: the browser signs in with the user's
 * own JWT and the anon key, and RLS does the rest. No service_role key ever
 * enters this app.
 */
export default defineNuxtPlugin(async () => {
  const { supabaseUrl, supabaseAnonKey } = useRuntimeConfig().public

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Spelled out because the default is 'implicit', which returns the
      // access and refresh tokens in the URL fragment -- into browser history,
      // into anything the user copies out of the address bar. PKCE returns a
      // single-use code instead, which is what /auth/callback exchanges.
      flowType: 'pkce',
      // The callback page trades the code itself, so the client must not race
      // it by consuming the URL first.
      detectSessionInUrl: false,
    },
  })

  const user = useCurrentUser()

  // Awaited on purpose: the route middleware runs straight after the plugins,
  // and a session that has not been restored yet looks exactly like being
  // signed out — every reload of a protected page would bounce to /login.
  const { data } = await client.auth.getSession()
  user.value = data.session?.user ?? null

  client.auth.onAuthStateChange((_event, session) => {
    user.value = session?.user ?? null
  })

  return { provide: { supabase: client } }
})
