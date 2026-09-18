import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import App from '../../app/app.vue'
import { signIn, signOut } from '../helpers'

/**
 * The class contract of docs/specs/2026-09-18-responsive-baseline.md — §6 of
 * it says what this can and cannot see. The frame's own classes are
 * `layouts.spec.ts`.
 */
describe('the responsive baseline', () => {
  beforeEach(signIn)

  const shellOf = async (route: string) =>
    (await mountSuspended(App, { route })).get('[data-testid="site-shell"]').classes()

  it('gives the shell a horizontal padding that changes with the viewport', async () => {
    // That there is a padding at all is `layouts.spec.ts`. This is the second step.
    expect((await shellOf('/import')).some((name) => /^(sm|md|lg):px-/.test(name))).toBe(true)
  })

  it('measures the shell in dvh, which is the height a phone actually has', async () => {
    // `vh` on a mobile browser is the viewport with the address bar already
    // gone — a height the reader does not have until they scroll.
    expect(await shellOf('/import')).toContain('min-h-dvh')
  })

  /**
   * §4 left the choice between wrap and a prefix to issue #213, and it is a
   * prefix: below `sm` the nav has a row of its own under the brand, from `sm`
   * up it sits between the brand and the controls. What is asserted is that
   * the row is declared rather than folded into — where it actually lands is
   * §6's other half, and is read by eye.
   */
  describe('the header at a width one row cannot hold', () => {
    const headerOf = async (route: string) =>
      (await mountSuspended(App, { route })).get('[data-testid="site-header"]')

    it('gives the nav a row of its own below sm and takes it back from sm up', async () => {
      const nav = (await headerOf('/import')).get('[data-testid="site-nav"]').classes()

      // `basis-full` is the declaration: the nav is a whole row wide until
      // `sm`, rather than whatever the overflow happened to push down.
      expect(nav).toContain('basis-full')
      expect(nav).toContain('sm:basis-auto')
    })

    it('tabs in the order it reads in from sm up, by reordering nothing there', async () => {
      const header = await headerOf('/import')

      // The nav is second in the source, which is where it is read and where
      // it is tabbed. Only the phone side moves it — `order-last` is what
      // leaves the first row to the brand and the controls — and only there.
      expect(
        [...header.element.children].map((child) => child.getAttribute('data-testid')),
      ).toEqual(['site-brand', 'site-nav', 'site-header-controls'])

      const nav = header.get('[data-testid="site-nav"]').classes()

      expect(nav).toContain('order-last')
      expect(nav).toContain('sm:order-none')

      // Nothing else is moved at all, so from `sm` up there is no order to
      // disagree with the source's.
      for (const id of ['site-brand', 'site-header-controls']) {
        const classes = header.get(`[data-testid="${id}"]`).classes()

        expect(
          classes.filter((name) => /(^|:)order-/.test(name)),
          id,
        ).toEqual([])
      }
    })

    it('keeps the brand and the controls on one row at every width', async () => {
      // The nav is the only child that claims a row, so the first one holds
      // the same two things at 320 as at 1440.
      const controls = (await headerOf('/import'))
        .get('[data-testid="site-header-controls"]')
        .classes()

      expect(controls).toContain('ml-auto')
      expect(controls).not.toContain('basis-full')
    })

    it('gives the nav no row at all in a shell whose header carries none', async () => {
      signOut()

      expect((await headerOf('/login')).find('[data-testid="site-nav"]').exists()).toBe(false)
    })
  })

  /** Height only; §5 of the baseline says why the width half is not asserted. */
  describe('the touch-target floor in the site chrome', () => {
    /**
     * One region at a time, and one tag at a time: a grouped selector handed
     * to `findAll` matches the region element itself and then misses its
     * children.
     */
    function pressablesIn(wrapper: Awaited<ReturnType<typeof mountSuspended>>) {
      return ['site-header', 'site-footer'].flatMap((id) => {
        const region = wrapper.get(`[data-testid="${id}"]`)

        return [...region.findAll('a'), ...region.findAll('button')]
      })
    }

    /**
     * So the loop below cannot pass by finding nothing. Named rather than
     * counted, because how many links the header draws at once is exactly
     * what a phone layout is allowed to change.
     */
    const LANDMARKS = ['site-brand', 'theme-toggle', 'locale-switcher']

    function assertFloor(controls: ReturnType<typeof pressablesIn>) {
      const testIds = controls.map((control) => control.attributes('data-testid'))

      for (const landmark of LANDMARKS) expect(testIds).toContain(landmark)

      for (const control of controls) {
        const label =
          control.attributes('data-testid') ?? control.attributes('aria-label') ?? control.text()

        expect(control.classes(), label).toContain('min-h-11')
      }
    }

    /**
     * §5's other half: two 44px boxes 4px apart are one target as far as a
     * thumb is concerned. Both of these rows wrap, so the gap is asserted in
     * both axes at once.
     */
    it('keeps the controls in either nav 8px apart', async () => {
      const wrapper = await mountSuspended(App, { route: '/import' })

      for (const id of ['site-nav', 'site-footer-nav']) {
        expect(wrapper.get(`[data-testid="${id}"]`).classes(), id).toContain('gap-2')
      }
    })

    it('holds for every pressable thing in the signed-in shell', async () => {
      assertFloor(pressablesIn(await mountSuspended(App, { route: '/import' })))
    })

    it('holds for every pressable thing in the public shell', async () => {
      signOut()

      assertFloor(pressablesIn(await mountSuspended(App, { route: '/login' })))
    })
  })
})
