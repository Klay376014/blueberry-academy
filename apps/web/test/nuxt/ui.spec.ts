import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import App from '../../app/app.vue'
import { signIn } from '../helpers'

describe('shadcn-vue components', () => {
  // Without this these would assert against the login page, not the home page.
  beforeEach(signIn)

  it('registers ui/button/Button.vue as <UiButton>', async () => {
    const wrapper = await mountSuspended(App, { route: '/' })
    const toggle = wrapper.get('[data-testid="theme-toggle"]')

    expect(toggle.element.tagName).toBe('BUTTON')
    expect(toggle.attributes('data-slot')).toBe('button')
  })

  it('resolves variant classes through cva and cn', async () => {
    const wrapper = await mountSuspended(App, { route: '/' })
    const locales = wrapper.get('[data-testid="locale-switcher"]')

    // `outline`/`sm` come from buttonVariants, so their presence proves the
    // cva + tailwind-merge chain in @/shared/lib/utils is wired up.
    expect(locales.classes()).toContain('border')
    expect(locales.classes()).toContain('h-8')
  })

  it('flips the theme when the toggle is pressed', async () => {
    const wrapper = await mountSuspended(App, { route: '/' })
    const colorMode = useColorMode()

    // The icon is the visible signal: sun while light, moon while dark.
    expect(wrapper.find('[data-testid="theme-toggle"] svg').exists()).toBe(true)

    await wrapper.get('[data-testid="theme-toggle"]').trigger('click')
    await vi.waitFor(() => {
      expect(colorMode.value).toBe('dark')
    })

    await wrapper.get('[data-testid="theme-toggle"]').trigger('click')
    await vi.waitFor(() => {
      expect(colorMode.value).toBe('light')
    })
  })
})
