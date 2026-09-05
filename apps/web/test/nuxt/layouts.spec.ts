import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { RouteLocationNormalized } from 'vue-router'
import App from '../../app/app.vue'
import shellMiddleware from '../../app/middleware/shell'
import { signIn, signOut } from '../helpers'

const { setPageLayoutMock } = vi.hoisted(() => ({ setPageLayoutMock: vi.fn() }))

mockNuxtImport('setPageLayout', () => setPageLayoutMock)

/** The middleware reads neither route; both are there because it takes two. */
const anyNavigation = [{}, {}] as [RouteLocationNormalized, RouteLocationNormalized]

/**
 * The two shells the site puts around a page (issue #125). Which links each
 * one carries is `routing.spec.ts`; this is about the shells themselves —
 * that a page gets the one it asked for, and that both frame their content
 * the same way.
 */
describe('the site shells', () => {
  beforeEach(signIn)

  it('gives a page behind the login the signed-in shell', async () => {
    const wrapper = await mountSuspended(App, { route: '/import' })

    // The account menu, which is what signing out is behind now (issue #128).
    expect(wrapper.find('[data-testid="user-menu"]').exists()).toBe(true)
  })

  it('gives a public page the public shell, with no account to reach', async () => {
    signOut()

    const wrapper = await mountSuspended(App, { route: '/login' })

    expect(wrapper.find('[data-testid="user-menu"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="sign-in"]').exists()).toBe(true)
  })

  // A page on both sides of the login says which shell per reader through the
  // `shell` middleware, so that the frame is on the route before the page is
  // asked for anything (issue #126). Called directly, because a route
  // middleware is not run by mounting a component.
  it('gives a page on both sides of the login the shell of whoever is reading', () => {
    shellMiddleware(...anyNavigation)

    expect(setPageLayoutMock).toHaveBeenLastCalledWith('app')

    signOut()
    shellMiddleware(...anyNavigation)

    expect(setPageLayoutMock).toHaveBeenLastCalledWith('public')
  })

  it('frames the content of both shells identically', async () => {
    const inside = await mountSuspended(App, { route: '/import' })

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
