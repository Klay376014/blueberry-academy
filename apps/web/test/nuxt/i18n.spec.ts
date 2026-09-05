import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import App from '../../app/app.vue'
import { signIn } from '../helpers'

// `/` sits behind the login, so these mount as a signed-in user.
describe('i18n', () => {
  beforeEach(signIn)

  it('defaults to English', async () => {
    const wrapper = await mountSuspended(App, { route: '/' })

    // The footer's nav rather than the header's: it is under both shells, so
    // this does not depend on which one the mount happened to get.
    expect(wrapper.get('[data-testid="site-footer-nav"]').text()).toContain('Source code')
    expect(wrapper.get('main h1').text()).toBe('Blueberry Academy')
  })

  it('translates the interface when the locale switcher is used', async () => {
    const wrapper = await mountSuspended(App, { route: '/' })
    const switcher = wrapper.get('[data-testid="locale-switcher"]')

    expect(switcher.text()).toBe('繁體中文')

    // setLocale navigates — prefix_except_default puts zh-TW behind /zh-TW —
    // and trigger() does not await the handler's promise, so poll the DOM
    // rather than guessing at a number of ticks.
    await switcher.trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.get('[data-testid="site-footer-nav"]').text()).toContain('原始碼')
    })

    expect(wrapper.get('main p').text()).toBe('VGC 對戰紀錄分析。')
    expect(wrapper.get('[data-testid="locale-switcher"]').text()).toBe('English')
  })
})
