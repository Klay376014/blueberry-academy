import { createClient } from '@supabase/supabase-js'

/**
 * The `useState` keys holding something that belongs to whoever was signed in
 * when it was read.
 *
 * One list in one place rather than each composable clearing its own. It is a
 * single rule — nothing of the last person survives the next one — and while
 * it lived in four files it was three-quarters missing. Anything per-user
 * added later belongs on this list, and this is where the next person will
 * think to look.
 *
 * RLS decides what the *next* query is allowed to read. It has nothing to say
 * about the answer to the last one, still sitting in memory.
 */
const PER_USER_STATE = [
  // Which side of an imported battle is yours, and a list that could be
  // written into the next person's profile.
  'showdown-aliases',

  // The dashboard's battles and everything counted from them, plus the read
  // that may still be in the air over them.
  'stats-rows',
  'stats-loading',
  'stats-error',
  'stats-reading',
  'stats-read-key',

  // The open battle, its series siblings and its timeline.
  'drawer-battle',
  'drawer-series',
  'drawer-timeline',
  'drawer-loading',
  'drawer-failure',
  'drawer-reading',

  // Opponent names and brings for the rows the recent list is showing.
  'recent-battle-extras',
  'recent-battles-loading',
  'recent-battles-error',

  // The raw logs read this session, as the promises that read them.
  'battle-logs',
  'battle-log-loading',
  'battle-log-error',
]

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

  const nuxtApp = useNuxtApp()
  const user = useCurrentUser()

  // Awaited: the route middleware runs straight after the plugins, and a
  // session not yet restored looks exactly like being signed out, so every
  // reload of a protected page would bounce to /login.
  const { data } = await client.auth.getSession()
  user.value = data.session?.user ?? null

  client.auth.onAuthStateChange((_event, session) => {
    const next = session?.user ?? null

    // Signing out, and signing in as somebody else, both happen without a page
    // reload. A token renewal for the same person is not either of those, and
    // clearing on one would cost a full re-read of the table every hour.
    if (next?.id !== user.value?.id) {
      // `runWithContext` because this fires from Supabase's own callback,
      // outside anything Nuxt is running. `reset` puts each key back to the
      // initial value its own composable declared, rather than to `undefined`
      // — "not read yet" and "read and empty" mean different things in at
      // least three of these.
      nuxtApp.runWithContext(() => clearNuxtState(PER_USER_STATE, { reset: true }))
    }

    user.value = next
  })

  return { provide: { supabase: client } }
})
