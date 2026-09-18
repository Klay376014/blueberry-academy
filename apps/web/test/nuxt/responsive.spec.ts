import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import App from '../../app/app.vue'
import { signIn, signOut } from '../helpers'

/**
 * The invariants of the responsive baseline, as far as this suite can see them
 * (docs/specs/2026-09-18-responsive-baseline.md).
 *
 * jsdom has no layout engine, so "does not scroll sideways at 320px" is not a
 * claim any test here can make — that one is checked by eye, at the acceptance
 * widths the baseline lists. What is checkable is the class contract: whether
 * a component still carries the classes the baseline asks for. That is weaker
 * than the real thing, and the baseline says so; it is what stops the floor
 * being quietly walked back a year from now.
 *
 * The frame's own classes, and that both shells state them alike, are
 * `layouts.spec.ts`. This is about what the baseline adds on top: that the
 * frame breathes with the viewport, and that everything in it can be hit with
 * a thumb.
 */
describe('the responsive baseline', () => {
  beforeEach(signIn)

  it('gives the shell a horizontal padding that changes with the viewport', async () => {
    const wrapper = await mountSuspended(App, { route: '/import' })

    const shell = wrapper.get('[data-testid="site-shell"]').classes()

    // Two steps rather than one: a phone and a desktop do not want the same
    // gutter, and a single `px-` would be a compromise that suits neither.
    expect(shell.some((name) => /^px-/.test(name))).toBe(true)
    expect(shell.some((name) => /^(sm|md|lg):px-/.test(name))).toBe(true)
  })

  it('measures the shell in dvh, which is the height a phone actually has', async () => {
    const wrapper = await mountSuspended(App, { route: '/import' })

    const shell = wrapper.get('[data-testid="site-shell"]').classes()

    // `vh` on a mobile browser is the viewport with the address bar already
    // gone — a height the reader does not have until they scroll. `dvh` is
    // the one on screen now.
    expect(shell).toContain('min-h-dvh')
    expect(shell.some((name) => /^(min-)?h-(screen|\[100vh])$/.test(name))).toBe(false)
  })

  /**
   * 44px, which is `min-h-11`. The header and the footer already kept the
   * floor by hand; this is the test that makes it a rule rather than a
   * coincidence. Both shells, because the public one is where a first-time
   * reader arrives.
   */
  describe('the touch-target floor in the site chrome', () => {
    /**
     * Every pressable thing in the header and the footer.
     *
     * One region at a time, and one tag at a time: a grouped selector handed
     * to `findAll` matches the region element itself and then misses its
     * children.
     */
    function chrome(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
      return ['site-header', 'site-footer'].flatMap((region) => {
        const found = wrapper.get(`[data-testid="${region}"]`)

        return [...found.findAll('a'), ...found.findAll('button')]
      })
    }

    /**
     * The landmarks that must be among them, so the loop below cannot pass by
     * finding nothing at all. Named rather than counted: how many links the
     * header draws at once is the kind of thing a phone layout is allowed to
     * change, and these three are in the chrome of every page either way.
     */
    const LANDMARKS = ['site-brand', 'theme-toggle', 'locale-switcher']

    function assertFloor(controls: ReturnType<typeof chrome>) {
      const marked = controls.map((control) => control.attributes('data-testid'))

      for (const landmark of LANDMARKS) expect(marked).toContain(landmark)

      for (const control of controls) {
        const label =
          control.attributes('data-testid') ?? control.attributes('aria-label') ?? control.text()

        expect(control.classes(), label).toContain('min-h-11')
      }
    }

    it('holds for every pressable thing in the signed-in shell', async () => {
      assertFloor(chrome(await mountSuspended(App, { route: '/import' })))
    })

    it('holds for every pressable thing in the public shell', async () => {
      signOut()

      assertFloor(chrome(await mountSuspended(App, { route: '/login' })))
    })
  })
})
