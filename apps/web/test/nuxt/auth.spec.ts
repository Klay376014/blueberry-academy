import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { RouteLocationNormalized } from 'vue-router'
import authMiddleware from '../../app/middleware/auth.global'
import App from '../../app/app.vue'
import { signIn, signOut as signOutState } from '../helpers'
import { forgetTeleported, pressTeleported } from '../teleported'

// vi.hoisted, because mockNuxtImport's factory is lifted above this file's
// own initialisation and would otherwise read these before they exist.
const { signInWithGoogle, signOut, completeSignIn, navigateToMock } = vi.hoisted(() => ({
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
  completeSignIn: vi.fn(),
  navigateToMock: vi.fn((to: unknown) => to),
}))

// Only the actions are faked. `user` stays the real state the plugin writes to,
// so signing in inside a test means what it means in the app.
mockNuxtImport('useAuth', () => () => ({
  user: useCurrentUser(),
  signInWithGoogle,
  signOut,
  completeSignIn,
}))

// The real one navigates; the mock only records where it was pointed, which is
// the whole of what the middleware decides.
mockNuxtImport('navigateTo', () => navigateToMock)

/** A route object with only the fields the middleware reads. */
function route(name: string, path: string) {
  return { name, path, fullPath: path, matched: [{}] } as unknown as RouteLocationNormalized
}

/** What the router hands over for an address no page answers to. */
function unmatched(path: string) {
  return {
    name: undefined,
    path,
    fullPath: path,
    matched: [],
  } as unknown as RouteLocationNormalized
}

describe('the auth middleware', () => {
  beforeEach(() => {
    signOutState()
    navigateToMock.mockClear()
  })

  it('sends a signed-out visitor to the login page', async () => {
    const result = await authMiddleware(
      route('settings___en', '/settings'),
      route('index___en', '/'),
    )

    expect(result).toMatchObject({ path: '/login' })
  })

  it('leaves `/` reachable, because it is what a stranger is shown', async () => {
    const result = await authMiddleware(route('index___en', '/'), route('index___en', '/'))

    expect(result).toBeUndefined()
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('protects a page nobody named, which is still every other one', async () => {
    const result = await authMiddleware(route('import___en', '/import'), route('index___en', '/'))

    expect(result).toMatchObject({ path: '/login' })
  })

  it('lets a signed-in user through', async () => {
    signIn()

    const result = await authMiddleware(route('index___en', '/'), route('index___en', '/'))

    expect(result).toBeUndefined()
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('leaves the login page reachable, or nobody could ever sign in', async () => {
    const result = await authMiddleware(route('login___en', '/login'), route('index___en', '/'))

    expect(result).toBeUndefined()
  })

  it('leaves the OAuth callback reachable, since it runs before the session exists', async () => {
    const result = await authMiddleware(
      route('auth-callback___en', '/auth/callback'),
      route('login___en', '/login'),
    )

    expect(result).toBeUndefined()
  })

  it('lets an address that matches no page through to the error page', async () => {
    const result = await authMiddleware(unmatched('/nope'), route('index___en', '/'))

    expect(result).toBeUndefined()
    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('redirects into the active locale rather than out of it', async () => {
    const result = await authMiddleware(
      route('settings___zh-TW', '/zh-TW/settings'),
      route('index___zh-TW', '/zh-TW'),
    )

    expect(result).toMatchObject({ path: '/zh-TW/login' })
  })
})

describe('the login page', () => {
  it('offers Google and nothing else', async () => {
    const wrapper = await mountSuspended(App, { route: '/login' })

    expect(wrapper.get('[data-testid="sign-in-google"]').text()).toContain('Google')
  })

  it('has no password entry point', async () => {
    const wrapper = await mountSuspended(App, { route: '/login' })

    // Nothing to type into, and nothing to submit: the only way in is the
    // button above. Supabase is configured to match — see [auth.email]
    // enable_signup in supabase/config.toml.
    expect(wrapper.findAll('input')).toHaveLength(0)
    expect(wrapper.findAll('form')).toHaveLength(0)
  })

  it('starts the Google flow when pressed', async () => {
    const wrapper = await mountSuspended(App, { route: '/login' })

    await wrapper.get('[data-testid="sign-in-google"]').trigger('click')

    expect(signInWithGoogle).toHaveBeenCalledOnce()
  })
})

describe('the OAuth callback page', () => {
  beforeEach(() => {
    signOutState()
    navigateToMock.mockClear()
    completeSignIn.mockReset()
  })

  it('trades the code for a session and then goes to the dashboard', async () => {
    completeSignIn.mockResolvedValue(undefined)

    await mountSuspended(App, { route: '/auth/callback?code=abc123' })

    await vi.waitFor(() => {
      // The code itself, not the URL it arrived in: that is what
      // exchangeCodeForSession takes.
      expect(completeSignIn).toHaveBeenCalledWith('abc123')
      expect(navigateToMock).toHaveBeenCalledWith('/')
    })
  })

  it('comes back into the locale the user signed in from', async () => {
    completeSignIn.mockResolvedValue(undefined)

    await mountSuspended(App, { route: '/zh-TW/auth/callback?code=abc123' })

    await vi.waitFor(() => {
      expect(navigateToMock).toHaveBeenCalledWith('/zh-TW')
    })
  })

  it('says so when Google came back with no code at all', async () => {
    await mountSuspended(App, { route: '/auth/callback' })

    await vi.waitFor(() => {
      expect(completeSignIn).not.toHaveBeenCalled()
    })
  })

  it('says so when the exchange is refused, rather than hanging', async () => {
    completeSignIn.mockRejectedValue(new Error('code already used'))

    const wrapper = await mountSuspended(App, { route: '/auth/callback?code=spent' })

    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="callback-retry"]').exists()).toBe(true)
    })
    expect(wrapper.find('[data-testid="callback-pending"]').exists()).toBe(false)
  })
})

describe('the header', () => {
  beforeEach(() => {
    forgetTeleported('sign-out')
    signOutState()
  })

  it('offers no way out while nobody is signed in', async () => {
    const wrapper = await mountSuspended(App, { route: '/login' })

    expect(wrapper.find('[data-testid="user-menu"]').exists()).toBe(false)
  })

  // Two presses rather than one, and the second one is inside the account
  // menu: signing out is not a switcher (issue #128). The item itself is
  // teleported out of the header by reka-ui, so it is found in the document.
  it('signs out when the account menu’s way out is pressed', async () => {
    signIn()

    const wrapper = await mountSuspended(App, { route: '/about' })
    await wrapper.get('[data-testid="user-menu"]').trigger('keydown', { key: 'Enter' })
    pressTeleported('sign-out')

    expect(signOut).toHaveBeenCalledOnce()
  })
})
