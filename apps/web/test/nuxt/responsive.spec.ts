import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import App from '../../app/app.vue'
import { signIn, signOut } from '../helpers'

/**
 * The class contract of the responsive baseline, and only that much of it:
 * docs/specs/2026-09-18-responsive-baseline.md §6 says what this can and
 * cannot see.
 *
 * The frame's own classes, and that both shells state them alike, are
 * `layouts.spec.ts`.
 */
describe('the responsive baseline', () => {
  beforeEach(signIn)

  const shellOf = async (route: string) =>
    (await mountSuspended(App, { route })).get('[data-testid="site-shell"]').classes()

  it('gives the shell a horizontal padding that changes with the viewport', async () => {
    // That there is a padding at all is `layouts.spec.ts`; this is the second
    // step, which is what makes it responsive rather than a compromise.
    expect((await shellOf('/import')).some((name) => /^(sm|md|lg):px-/.test(name))).toBe(true)
  })

  it('measures the shell in dvh, which is the height a phone actually has', async () => {
    // `vh` on a mobile browser is the viewport with the address bar already
    // gone — a height the reader does not have until they scroll.
    expect(await shellOf('/import')).toContain('min-h-dvh')
  })

  it('leaves the header a way to answer a width it cannot fit', async () => {
    const header = (await mountSuspended(App, { route: '/import' }))
      .get('[data-testid="site-header"]')
      .classes()

    // Either of the two the baseline allows (§4): wrap when the content
    // decides, a prefix when the layout changes its story. A header with
    // neither has nothing left to do but overflow. Which of the two it is,
    // is issue #213's to decide.
    const answers = header.includes('flex-wrap') || header.some((name) => /^(sm|md|lg):/.test(name))

    expect(answers, header.join(' ')).toBe(true)
  })

  /**
   * 44px of height, which is `min-h-11` — see the baseline §5 for why the
   * width half is not asserted here.
   */
  describe('the touch-target floor in the site chrome', () => {
    /**
     * Every pressable thing in the header and the footer.
     *
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
     * The landmarks that must be among them, so the loop below cannot pass by
     * finding nothing at all. Named rather than counted: how many links the
     * header draws at once is the kind of thing a phone layout is allowed to
     * change, and these three are in the chrome of every page either way.
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

    it('holds for every pressable thing in the signed-in shell', async () => {
      assertFloor(pressablesIn(await mountSuspended(App, { route: '/import' })))
    })

    it('holds for every pressable thing in the public shell', async () => {
      signOut()

      assertFloor(pressablesIn(await mountSuspended(App, { route: '/login' })))
    })
  })
})
