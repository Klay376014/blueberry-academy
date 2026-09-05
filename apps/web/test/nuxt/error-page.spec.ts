import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import ErrorPage from '../../app/error.vue'
import en from '../../i18n/locales/en.json'
import zhTW from '../../i18n/locales/zh-TW.json'
import { signIn, signOut } from '../helpers'

/** Through `createError`, so the props are the shape Nuxt really hands over. */
const thrown = (statusCode: number) => ({ props: { error: createError({ statusCode }) } })
const notFound = thrown(404)

/**
 * What a wrong address looks like (issue #125). Before this page existed it
 * looked like Nuxt's default one: no theme, no language, no way back — which
 * reads as having fallen out of the site rather than as having mistyped it.
 */
describe('the error page', () => {
  beforeEach(signOut)

  // Spelled out rather than read off en.json: the locale files reach a test
  // through the i18n loader, which hands back compiled messages rather than
  // the strings, so `en.error.notFound.title` is an AST node here.
  it('says a wrong address is a wrong address', async () => {
    const wrapper = await mountSuspended(ErrorPage, notFound)

    expect(wrapper.text()).toContain('There is nothing at this address')
    expect(wrapper.text()).toContain('the address may have a typo in it')
  })

  it('says something else entirely when the status is not 404', async () => {
    const wrapper = await mountSuspended(ErrorPage, thrown(500))

    expect(wrapper.text()).toContain('Something went wrong here')
    expect(wrapper.text()).not.toContain('There is nothing at this address')
  })

  it('offers a way back to the site it is part of', async () => {
    const wrapper = await mountSuspended(ErrorPage, notFound)

    expect(wrapper.get('[data-testid="error-home"]').attributes('href')).toBe('/')
  })

  it('keeps the site around it rather than dropping out of it', async () => {
    const wrapper = await mountSuspended(ErrorPage, notFound)

    // The public shell's furniture: the product's name back to `/`, the
    // footer's reading, and both switchers (issue #128).
    const hrefs = wrapper
      .findAll('[data-testid="site-footer-nav"] a')
      .map((a) => a.attributes('href'))

    expect(wrapper.get('[data-testid="site-brand"]').attributes('href')).toBe('/')
    expect(hrefs).toEqual([
      '/about',
      '/privacy',
      '/privacy#terms',
      'https://github.com/Klay376014/blueberry-academy',
    ])
    expect(wrapper.find('[data-testid="theme-toggle"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="locale-switcher"]').exists()).toBe(true)
  })

  it('keeps the shell a signed-in reader already had', async () => {
    signIn()

    const wrapper = await mountSuspended(ErrorPage, notFound)

    expect(wrapper.find('[data-testid="user-menu"]').exists()).toBe(true)
  })

  it('has both sayings in both locales', () => {
    for (const locale of [en, zhTW]) {
      expect(locale.error.notFound.title).toBeTruthy()
      expect(locale.error.notFound.body).toBeTruthy()
      expect(locale.error.unexpected.title).toBeTruthy()
      expect(locale.error.unexpected.body).toBeTruthy()
      expect(locale.error.home).toBeTruthy()
    }
  })
})
