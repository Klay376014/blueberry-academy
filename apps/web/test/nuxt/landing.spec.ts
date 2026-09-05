import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import Home from '../../app/pages/index.vue'
import { fakeBattles } from '../fakes/battles'
import type { FakeBattles } from '../fakes/battles'
import en from '../../i18n/locales/en.json'
import zhTW from '../../i18n/locales/zh-TW.json'
import { signIn, signOut } from '../helpers'

/**
 * What `/` is, which depends on who asks (issue #126).
 *
 * A stranger used to be bounced to the login form and told nothing: what this
 * is, who it is for, what it reads. The same address answers both readers now
 * — landing content for a stranger, the dashboard for somebody signed in —
 * so the deep links into the dashboard keep the shape they had.
 */
const { battles, load } = vi.hoisted(() => ({
  battles: { value: null as unknown },
  load: vi.fn(() => Promise.resolve()),
}))

battles.value = fakeBattles()

mockNuxtImport('useBattles', () => () => battles.value as never)

mockNuxtImport('useProfile', () => () => {
  const stored = useShowdownAliases()

  return {
    aliases: computed(() => stored.value ?? []),
    loaded: computed(() => stored.value !== null),
    load,
    bindAlias: vi.fn(),
    unbindAlias: vi.fn(),
  }
})

const fake = () => battles.value as FakeBattles

describe('the home page, to a stranger', () => {
  beforeEach(() => {
    battles.value = fakeBattles()
    load.mockClear()
    signOut()
  })

  it('says what this is instead of asking for a password', async () => {
    const wrapper = await mountSuspended(Home)

    expect(wrapper.find('[data-testid="landing"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="stats-empty"]').exists()).toBe(false)
  })

  it('offers signing in as the way to start', async () => {
    const wrapper = await mountSuspended(Home)

    expect(wrapper.get('[data-testid="landing-cta"]').attributes('href')).toBe('/login')
  })

  it('reads nothing: there is no session to read anything with', async () => {
    await mountSuspended(Home)

    expect(fake().reads).toEqual([])
    expect(load).not.toHaveBeenCalled()
  })

  it('claims nothing it cannot show: no testimonials, no logos, no counts', () => {
    // The landing copy, read as one string. Social proof would have to be
    // invented — there are no customers to quote (issue #126).
    const copy = JSON.stringify(en.landing) + JSON.stringify(zhTW.landing)

    expect(copy).not.toMatch(/testimonial|trusted by|customers|users say|見證|愛用/i)
  })

  it('says all of it in both locales', () => {
    const shape = (value: unknown): unknown =>
      typeof value === 'object' && value !== null
        ? Object.fromEntries(
            Object.entries(value)
              .map(([key, nested]) => [key, shape(nested)])
              .sort(),
          )
        : true

    expect(shape(zhTW.landing)).toEqual(shape(en.landing))
  })
})

describe('the home page, to somebody signed in', () => {
  beforeEach(() => {
    battles.value = fakeBattles()
    signIn()
  })

  it('is the dashboard, with no landing copy in front of it', async () => {
    const wrapper = await mountSuspended(Home)

    expect(wrapper.find('[data-testid="landing"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="stats-empty"]').exists()).toBe(true)
  })

  // Which shell either reader is given is `layouts.spec.ts`: this page picks
  // it in a route middleware, which mounting a component does not run.
})
