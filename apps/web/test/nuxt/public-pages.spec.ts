import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { RouteLocationNormalized } from 'vue-router'
import About from '../../app/pages/about.vue'
import Privacy from '../../app/pages/privacy.vue'
import Login from '../../app/pages/login.vue'
import authMiddleware from '../../app/middleware/auth.global'
import en from '../../i18n/locales/en.json'
import zhTW from '../../i18n/locales/zh-TW.json'
import { signOut } from '../helpers'

/**
 * The two pages a reader can open without an account: what this reads and
 * counts, and what it keeps of theirs (issue #127).
 *
 * What the pages say is not asserted sentence by sentence — that is editing,
 * not testing. What is asserted is that each thing the reader has a right to
 * know is on the page at all, in both languages, and that neither page is
 * behind the login.
 */
const route = (name: string, path: string) =>
  ({ name, path, fullPath: path, matched: [{}] }) as unknown as RouteLocationNormalized

/** A block of copy reduced to its keys, so one locale cannot lag the other. */
function shape(value: unknown): unknown {
  return typeof value === 'object' && value !== null
    ? Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, shape(nested)]))
    : true
}

describe('the about page', () => {
  beforeEach(signOut)

  it('says where the numbers come from and how they are counted', async () => {
    const wrapper = await mountSuspended(About)

    // What a reader has to know before trusting a win rate: what is read, what
    // a game is, which formats are kept apart, and how teams are ordered
    // (CONTEXT.md).
    for (const section of ['source', 'counting', 'teams', 'ranking']) {
      expect(wrapper.find(`[data-testid="about-${section}"]`).exists()).toBe(true)
    }
  })

  it('says all of it in both locales', () => {
    expect(shape(zhTW.about)).toEqual(shape(en.about))
  })
})

describe('the privacy page', () => {
  beforeEach(signOut)

  it('says what is kept, who can read it, and what cannot be verified', async () => {
    const wrapper = await mountSuspended(Privacy)

    // The four the ticket names: the raw log and the row beside it, that
    // Showdown ownership cannot be checked by anyone, what unbinding a name
    // does to the battles under it, and how to have it all removed (#127).
    for (const section of ['stored', 'access', 'unverified', 'unbinding', 'deletion', 'others']) {
      expect(wrapper.find(`[data-testid="privacy-${section}"]`).exists()).toBe(true)
    }
  })

  // The page promises the account can be deleted by asking (#127), and the
  // repository it used to ask through is not open to its readers any more
  // (#137). A promise with no way to call it in is worse than none, so what is
  // asserted is that the address is there and reachable in one press.
  it('gives a reachable address to ask for a deletion at', async () => {
    const wrapper = await mountSuspended(Privacy)

    const contact = wrapper.get('[data-testid="privacy-contact"]')

    expect(contact.attributes('href')).toMatch(/^mailto:[^\s@]+@[^\s@]+$/)
    // Shown as itself: an address somebody may have to write down by hand is
    // not something to hide behind the word "email".
    expect(contact.text()).toBe(contact.attributes('href')?.replace('mailto:', ''))
  })

  it('says all of it in both locales', () => {
    expect(shape(zhTW.privacy)).toEqual(shape(en.privacy))
  })
})

describe('reaching them without an account', () => {
  beforeEach(signOut)

  it('offers the data page from the page that hands the data over', async () => {
    const wrapper = await mountSuspended(Login)

    expect(wrapper.get('[data-testid="login-privacy"]').attributes('href')).toBe('/privacy')
  })

  it('lets a stranger read both', async () => {
    for (const [name, path] of [
      ['about___en', '/about'],
      ['about___zh-TW', '/zh-TW/about'],
      ['privacy___en', '/privacy'],
      ['privacy___zh-TW', '/zh-TW/privacy'],
    ]) {
      const result = await authMiddleware(route(name!, path!), route('index___en', '/'))

      expect(result).toBeUndefined()
    }
  })
})
