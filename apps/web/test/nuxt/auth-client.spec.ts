import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import supabasePlugin from '../../app/plugins/supabase.client'

// The Supabase client is the one thing here that must not be real. Everything
// between it and the app -- the plugin, useAuth, the session state -- is.
const { supabaseAuth, createClient, navigateToMock } = vi.hoisted(() => {
  const supabaseAuth = {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    signInWithOAuth: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    signOut: vi.fn(),
  }
  return {
    supabaseAuth,
    createClient: vi.fn((_url: string, _key: string, _options?: unknown) => ({
      auth: supabaseAuth,
    })),
    navigateToMock: vi.fn((to: unknown) => to),
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient }))
mockNuxtImport('navigateTo', () => navigateToMock)

/** Runs the plugin the way Nuxt would, and hands back what it provided. */
async function bootPlugin() {
  const nuxtApp = useNuxtApp()
  const result = (await (
    supabasePlugin as unknown as (app: typeof nuxtApp) => Promise<{
      provide: { supabase: unknown }
    }>
  )(nuxtApp)) as { provide: { supabase: unknown } }

  if (!nuxtApp.$supabase) nuxtApp.provide('supabase', result.provide.supabase)
  return result.provide.supabase
}

describe('the Supabase plugin', () => {
  beforeEach(() => {
    useCurrentUser().value = null
    useShowdownAliases().value = null
    clearNuxtState(
      [
        'stats-rows',
        'drawer-battle',
        'drawer-series',
        'drawer-timeline',
        'recent-battle-extras',
        'battle-logs',
      ],
      { reset: true },
    )
    supabaseAuth.getSession.mockResolvedValue({ data: { session: null } })
    supabaseAuth.onAuthStateChange.mockReset()
  })

  it('restores a stored session before anything reads it', async () => {
    supabaseAuth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'stored' } } },
    })

    await bootPlugin()

    // Awaited, not fired and forgotten: the route middleware runs straight
    // after the plugins, and a session that has not landed yet is
    // indistinguishable from being signed out.
    expect(useCurrentUser().value).toMatchObject({ id: 'stored' })
  })

  /**
   * One account's worth of everything the plugin is supposed to forget, put
   * into the state the composables that own it would have put it in.
   */
  function fillStateFor(username: string) {
    useShowdownAliases().value = [username]
    useState<unknown>('stats-rows', () => null).value = [{ replay_id: `${username}-1` }]
    useState<unknown>('drawer-battle', () => null).value = { replayId: `${username}-1` }
    useState<unknown[]>('drawer-series', () => []).value = [{ replayId: `${username}-1` }]
    useState<unknown>('drawer-timeline', () => null).value = { turns: [] }
    useState<Map<string, unknown>>('recent-battle-extras', () => new Map()).value = new Map([
      [`${username}-1`, { opponentUsername: 'Somebody' }],
    ])
    useState<Map<string, unknown>>('battle-logs', () => new Map()).value = new Map([
      [`${username}-1`, Promise.resolve('|turn|1')],
    ])
  }

  /** What the plugin left behind, by the key the composable reads it under. */
  function leftBehind() {
    return {
      aliases: useShowdownAliases().value,
      rows: useState<unknown>('stats-rows', () => null).value,
      battle: useState<unknown>('drawer-battle', () => null).value,
      series: useState<unknown[]>('drawer-series', () => []).value,
      timeline: useState<unknown>('drawer-timeline', () => null).value,
      extras: useState<Map<string, unknown>>('recent-battle-extras', () => new Map()).value,
      logs: useState<Map<string, unknown>>('battle-logs', () => new Map()).value,
    }
  }

  it("drops one user's Showdown names when somebody else signs in", async () => {
    await bootPlugin()
    const aliases = useShowdownAliases()
    aliases.value = ['NotLittleStar']

    const onChange = supabaseAuth.onAuthStateChange.mock.calls[0]?.[0]
    onChange('SIGNED_IN', { user: { id: 'somebody-else' } })

    // ssr: false, so signing out and in again never reloads the page. Left
    // alone, the first user's names would be on the second user's screen --
    // and could be written into their profile.
    expect(aliases.value).toBeNull()
  })

  it("keeps none of one user's battles when somebody else signs in", async () => {
    supabaseAuth.getSession.mockResolvedValue({ data: { session: { user: { id: 'a' } } } })
    await bootPlugin()
    fillStateFor('a')

    const onChange = supabaseAuth.onAuthStateChange.mock.calls[0]?.[0]
    onChange('SIGNED_IN', { user: { id: 'b' } })

    // RLS decides what the next query may read. It has nothing to say about
    // the answer to the last one, still sitting in memory.
    const left = leftBehind()
    expect(left.aliases).toBeNull()
    expect(left.rows).toBeNull()
    expect(left.battle).toBeNull()
    expect(left.series).toEqual([])
    expect(left.timeline).toBeNull()
    expect(left.extras.size).toBe(0)
    expect(left.logs.size).toBe(0)
  })

  it('puts "nothing read yet" back, rather than nothing at all', async () => {
    // `stats-rows` distinguishes "no matching battles" from "never read", and
    // the dashboard only has something to say about the first. Cleared to
    // `undefined` it would read as loaded and empty.
    supabaseAuth.getSession.mockResolvedValue({ data: { session: { user: { id: 'a' } } } })
    await bootPlugin()
    fillStateFor('a')

    const onChange = supabaseAuth.onAuthStateChange.mock.calls[0]?.[0]
    onChange('SIGNED_OUT', null)

    expect(useState<unknown>('stats-rows', () => null).value).toBeNull()
    expect(useState<unknown>('stats-rows', () => null).value).not.toBeUndefined()
  })

  it('empties everything on the way out as well, not only on the way in', async () => {
    supabaseAuth.getSession.mockResolvedValue({ data: { session: { user: { id: 'a' } } } })
    await bootPlugin()
    fillStateFor('a')

    const onChange = supabaseAuth.onAuthStateChange.mock.calls[0]?.[0]
    onChange('SIGNED_OUT', null)

    expect(leftBehind().rows).toBeNull()
    expect(leftBehind().extras.size).toBe(0)
  })

  it('keeps the battles through a token renewal for the same person', async () => {
    // A renewal happens roughly hourly. Clearing on one would re-read the
    // whole table every time, and blank the dashboard while it did.
    supabaseAuth.getSession.mockResolvedValue({ data: { session: { user: { id: 'a' } } } })
    await bootPlugin()
    fillStateFor('a')

    const onChange = supabaseAuth.onAuthStateChange.mock.calls[0]?.[0]
    onChange('TOKEN_REFRESHED', { user: { id: 'a' } })

    const left = leftBehind()
    expect(left.rows as unknown[]).toHaveLength(1)
    expect(left.aliases).toEqual(['a'])
    expect(left.extras.size).toBe(1)
  })

  it('follows the session as it changes', async () => {
    await bootPlugin()

    const onChange = supabaseAuth.onAuthStateChange.mock.calls[0]?.[0]
    onChange('SIGNED_IN', { user: { id: 'fresh' } })
    expect(useCurrentUser().value).toMatchObject({ id: 'fresh' })

    onChange('SIGNED_OUT', null)
    expect(useCurrentUser().value).toBeNull()
  })

  it('does not let the client consume the callback URL itself', async () => {
    await bootPlugin()

    const options = createClient.mock.calls[0]?.[2] as {
      auth: { detectSessionInUrl: boolean; flowType: string }
    }
    // The callback page trades the code explicitly; both doing it means one of
    // them finds the code already spent.
    expect(options.auth.detectSessionInUrl).toBe(false)
  })

  it('asks for PKCE, so no token ever lands in the URL', async () => {
    await bootPlugin()

    const options = createClient.mock.calls[0]?.[2] as {
      auth: { flowType: string }
    }
    // auth-js defaults to 'implicit', which comes back as
    // #access_token=…&refresh_token=… in the fragment -- and leaves the
    // callback page with no code to exchange at all.
    expect(options.auth.flowType).toBe('pkce')
  })
})

describe('useAuth', () => {
  beforeEach(async () => {
    supabaseAuth.getSession.mockResolvedValue({ data: { session: null } })
    await bootPlugin()
    navigateToMock.mockClear()
  })

  it('sends the browser to Google, and back to the callback page', async () => {
    supabaseAuth.signInWithOAuth.mockResolvedValue({ error: null })

    await useAuth().signInWithGoogle()

    // The path goes through localePath, so a zh-TW user comes back to
    // /zh-TW/auth/callback and stays in their language.
    expect(supabaseAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  })

  it('reports a refused sign-in instead of swallowing it', async () => {
    supabaseAuth.signInWithOAuth.mockResolvedValue({ error: new Error('nope') })

    await expect(useAuth().signInWithGoogle()).rejects.toThrow('nope')
  })

  it('trades the code for a session, and passes a code rather than a URL', async () => {
    supabaseAuth.exchangeCodeForSession.mockResolvedValue({ error: null })

    await useAuth().completeSignIn('34e770dd-9ff9-416c-87fa-43b31d7ef225')

    // exchangeCodeForSession(authCode: string) -- handing it the whole
    // callback URL fails at the token endpoint, which is what "That sign-in
    // did not go through." looked like from the outside.
    const [passed] = supabaseAuth.exchangeCodeForSession.mock.calls[0] ?? []
    expect(passed).toBe('34e770dd-9ff9-416c-87fa-43b31d7ef225')
    expect(String(passed)).not.toMatch(/^https?:/)
  })

  it('reports a refused exchange, which is what puts the retry link on screen', async () => {
    supabaseAuth.exchangeCodeForSession.mockResolvedValue({ error: new Error('code used') })

    await expect(useAuth().completeSignIn('already-spent')).rejects.toThrow('code used')
  })

  it('signs out and lands on the login page', async () => {
    supabaseAuth.signOut.mockResolvedValue({ error: null })

    await useAuth().signOut()

    expect(supabaseAuth.signOut).toHaveBeenCalledOnce()
    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })
})
