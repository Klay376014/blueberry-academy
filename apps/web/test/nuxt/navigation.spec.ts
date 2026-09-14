import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import App from '../../app/app.vue'
import en from '../../i18n/locales/en.json'
import zhTW from '../../i18n/locales/zh-TW.json'
import { signIn, signOut } from '../helpers'
import { forgetTeleported, teleported } from '../teleported'

let mounted: Awaited<ReturnType<typeof mountSuspended>> | null = null

/** Mounts the app at `/` and hands the tree to this file's `afterEach`. */
async function mount() {
  mounted = await mountSuspended(App, { route: '/' })
  return mounted
}

/**
 * The header and the footer, on both sides of the login (issue #128).
 *
 * Which links each shell carries is `routing.spec.ts`; this is about the
 * hierarchy — that signing out is not one press away from a theme toggle,
 * that a stranger is told what this is and where to sign in, and that the
 * legal reading is reachable from the bottom of every page.
 */
describe('the header a stranger sees', () => {
  beforeEach(signOut)

  it('names the product and points at the way in', async () => {
    const wrapper = await mountSuspended(App, { route: '/about' })

    expect(wrapper.get('[data-testid="site-brand"]').attributes('href')).toBe('/')
    expect(wrapper.get('[data-testid="sign-in"]').attributes('href')).toBe('/login')
  })

  it('carries no account menu: there is no account', async () => {
    const wrapper = await mountSuspended(App, { route: '/about' })

    expect(wrapper.find('[data-testid="user-menu"]').exists()).toBe(false)
  })
})

describe('the header behind the login', () => {
  beforeEach(signIn)

  it('keeps the nav to navigation, with nothing to do with the account in it', async () => {
    const wrapper = await mountSuspended(App, { route: '/' })

    const hrefs = wrapper.findAll('[data-testid="site-nav"] a').map((a) => a.attributes('href'))

    expect(hrefs).toEqual(['/', '/about', '/import'])
  })

  it('does not stand signing out beside the theme toggle', async () => {
    const wrapper = await mountSuspended(App, { route: '/' })

    // Closed, the menu holds it; open, reka-ui teleports it out of the header
    // entirely. Either way it is never a sibling of the switchers.
    expect(wrapper.find('[data-testid="site-header"] [data-testid="sign-out"]').exists()).toBe(
      false,
    )
    expect(wrapper.find('[data-testid="user-menu"]').exists()).toBe(true)
  })

  it('gives every target in it something a finger can hit', async () => {
    const wrapper = await mountSuspended(App, { route: '/' })

    // 44 CSS pixels, which is `min-h-11` — a minimum rather than a height, so
    // the small-sized buttons keep the size they are drawn at while the box
    // around them stays reachable.
    const targets = wrapper.findAll(
      '[data-testid="site-header"] a, [data-testid="site-header"] button',
    )

    expect(targets.length).toBeGreaterThan(0)
    for (const target of targets) {
      expect(target.classes()).toContain('min-h-11')
    }
  })

  it('wraps rather than overflowing when there is no room', async () => {
    const wrapper = await mountSuspended(App, { route: '/' })

    // jsdom lays nothing out, so what is asserted is the rule that keeps a
    // 375px screen from scrolling sideways rather than the pixels it produces.
    expect(wrapper.get('[data-testid="site-header"]').classes()).toContain('flex-wrap')
  })
})

/**
 * Every test here unmounts the tree it mounted. A tree left mounted goes on
 * reacting to the user the next test signs in or out, and the menu's identity
 * line appears and disappears with that user inside content reka-ui has
 * teleported to `document.body` — which is how a later `signOut` ends up
 * patching nodes that are no longer where Vue left them (issue #192).
 */
describe('the account menu', () => {
  beforeEach(() => {
    forgetTeleported('sign-out')
    forgetTeleported('menu-settings')
    forgetTeleported('menu-identity')
    signIn()
  })

  // Unconditional, rather than a line at the end of each test: an assertion
  // that fails before its own `unmount()` would leave the tree mounted and
  // take the describes after it down with it, hiding what actually broke.
  afterEach(() => {
    mounted?.unmount()
    mounted = null
  })

  it('opens from the keyboard and holds the account’s own pages', async () => {
    const wrapper = await mount()

    await wrapper.get('[data-testid="user-menu"]').trigger('keydown', { key: 'Enter' })

    expect(teleported('menu-settings')?.getAttribute('href')).toBe('/settings')
    expect(teleported('sign-out')).not.toBeNull()
  })

  // The address used to be printed on the trigger above `sm`, where a long one
  // was cut to `ads1029384756@g…` and pushed the nav along with it. It is not
  // navigation — it answers "which account is this?", which is a question
  // asked on the way into the menu anyway (issue #192).
  it('keeps the address off the header, where it never fitted', async () => {
    const wrapper = await mount()

    expect(wrapper.get('[data-testid="user-menu"]').text()).not.toContain('reader@example.com')
  })

  // Icon-only, the button's accessible name is all a screen reader gets from
  // the header, and the menu's first line is not announced on the way past it.
  it('names the account on the button, where only a screen reader hears it', async () => {
    const wrapper = await mount()

    expect(wrapper.get('[data-testid="user-menu"]').attributes('aria-label')).toContain(
      'reader@example.com',
    )
  })

  it('says which account this is, once it is open', async () => {
    const wrapper = await mount()

    await wrapper.get('[data-testid="user-menu"]').trigger('keydown', { key: 'Enter' })

    expect(teleported('menu-identity')?.textContent).toContain('reader@example.com')
  })

  it('closes on Escape', async () => {
    const wrapper = await mount()

    await wrapper.get('[data-testid="user-menu"]').trigger('keydown', { key: 'Enter' })
    expect(teleported('sign-out')).not.toBeNull()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(teleported('sign-out')).toBeNull()
  })
})

// A Supabase user can carry no address at all, and then the menu is the two
// items and nothing above them: "Signed in as" over a blank says less than
// leaving it out (issue #192).
describe('the account menu, for a user with no address', () => {
  beforeEach(() => {
    forgetTeleported('sign-out')
    forgetTeleported('menu-settings')
    forgetTeleported('menu-identity')
    signIn(null)
  })

  afterEach(() => {
    mounted?.unmount()
    mounted = null
  })

  it('carries no identity line', async () => {
    const wrapper = await mount()

    await wrapper.get('[data-testid="user-menu"]').trigger('keydown', { key: 'Enter' })

    expect(teleported('sign-out')).not.toBeNull()
    expect(teleported('menu-identity')).toBeNull()
  })
})

describe('the footer', () => {
  beforeEach(signOut)

  // No link to the source among them: the repository is not open to the people
  // reading this (issue #137).
  it('says where the legal reading is', async () => {
    const wrapper = await mountSuspended(App, { route: '/about' })

    const hrefs = wrapper.findAll('[data-testid="site-footer"] a').map((a) => a.attributes('href'))

    expect(hrefs).toEqual(['/about', '/privacy', '/privacy#terms'])
  })

  it('is where the language is chosen', async () => {
    const wrapper = await mountSuspended(App, { route: '/about' })

    expect(
      wrapper.find('[data-testid="site-footer"] [data-testid="locale-switcher"]').exists(),
    ).toBe(true)
  })

  it('is under the pages behind the login too', async () => {
    signIn()

    const wrapper = await mountSuspended(App, { route: '/import' })

    expect(wrapper.find('[data-testid="site-footer"]').exists()).toBe(true)
  })
})

describe('what the shell says', () => {
  it('says it in both locales', () => {
    for (const key of ['signIn', 'signOut', 'settings', 'signedIn'] as const) {
      expect(en.nav[key]).toBeTruthy()
      expect(zhTW.nav[key]).toBeTruthy()
    }
    for (const key of ['about', 'privacy', 'terms'] as const) {
      expect(en.footer[key]).toBeTruthy()
      expect(zhTW.footer[key]).toBeTruthy()
    }
    for (const key of ['mainNav', 'footerNav', 'accountMenu'] as const) {
      expect(en.a11y[key]).toBeTruthy()
      expect(zhTW.a11y[key]).toBeTruthy()
    }
  })
})
