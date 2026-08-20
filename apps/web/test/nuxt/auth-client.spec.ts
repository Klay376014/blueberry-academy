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
      auth: { detectSessionInUrl: boolean }
    }
    // The callback page trades the code explicitly; both doing it means one of
    // them finds the code already spent.
    expect(options.auth.detectSessionInUrl).toBe(false)
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

    expect(supabaseAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  })

  it('reports a refused sign-in instead of swallowing it', async () => {
    supabaseAuth.signInWithOAuth.mockResolvedValue({ error: new Error('nope') })

    await expect(useAuth().signInWithGoogle()).rejects.toThrow('nope')
  })

  it('trades the callback URL for a session', async () => {
    supabaseAuth.exchangeCodeForSession.mockResolvedValue({ error: null })

    await useAuth().completeSignIn('http://localhost:3000/auth/callback?code=abc')

    expect(supabaseAuth.exchangeCodeForSession).toHaveBeenCalledWith(
      'http://localhost:3000/auth/callback?code=abc',
    )
  })

  it('reports a refused exchange, which is what puts the retry link on screen', async () => {
    supabaseAuth.exchangeCodeForSession.mockResolvedValue({ error: new Error('code used') })

    await expect(useAuth().completeSignIn('http://localhost:3000/auth/callback')).rejects.toThrow(
      'code used',
    )
  })

  it('signs out and lands on the login page', async () => {
    supabaseAuth.signOut.mockResolvedValue({ error: null })

    await useAuth().signOut()

    expect(supabaseAuth.signOut).toHaveBeenCalledOnce()
    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })
})
