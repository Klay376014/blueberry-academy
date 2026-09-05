import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import App from '../../app/app.vue'
import { signIn, signOut } from '../helpers'

/**
 * The two shells the site puts around a page (issue #125). Which links each
 * one carries is `routing.spec.ts`; this is about the shells themselves —
 * that a page gets the one it asked for, and that both frame their content
 * the same way.
 */
describe('the site shells', () => {
  beforeEach(signIn)

  it('gives a page behind the login the signed-in shell', async () => {
    const wrapper = await mountSuspended(App, { route: '/' })

    expect(wrapper.find('[data-testid="sign-out"]').exists()).toBe(true)
  })

  it('gives a public page the public shell, with nothing to sign out of', async () => {
    signOut()

    const wrapper = await mountSuspended(App, { route: '/login' })

    expect(wrapper.find('[data-testid="sign-out"]').exists()).toBe(false)
  })

  it('keeps a public page in the shell of whoever is reading it', async () => {
    const inside = await mountSuspended(App, { route: '/about' })

    expect(inside.find('[data-testid="sign-out"]').exists()).toBe(true)

    signOut()
    const outside = await mountSuspended(App, { route: '/about' })

    expect(outside.find('[data-testid="sign-out"]').exists()).toBe(false)
  })

  it('frames the content of both shells identically', async () => {
    const inside = await mountSuspended(App, { route: '/' })

    signOut()
    const outside = await mountSuspended(App, { route: '/login' })

    // The container used to be a rule on `#__nuxt` in tailwind.css, which is
    // outside anything a layout can restate. Asserted as one string so the
    // two shells cannot drift apart.
    const shell = inside.get('[data-testid="site-shell"]').classes().join(' ')

    expect(shell).toContain('mx-auto')
    expect(shell).toMatch(/\bpx-/)
    expect(outside.get('[data-testid="site-shell"]').classes().join(' ')).toBe(shell)
  })
})
