import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { teamRouteId } from '~/features/stats'
import TeamDetailPage from '../../app/pages/teams/[id].vue'
import { fakeBattles } from '../fakes/battles'
import { FORMATS, SIGNATURES, STATS_ROWS } from '../fixtures/stats-rows'
import { signIn } from '../helpers'

/**
 * The team detail page's half of the class contract in
 * docs/specs/2026-09-18-responsive-baseline.md. §6 of that document is what
 * says why this file asserts classes and not widths: jsdom has no layout
 * engine, so "does not scroll sideways at 320" is read by hand at the six
 * widths and written back onto issue #216.
 *
 * The dashboard's half is `dashboard-responsive.spec.ts` and the site
 * chrome's is `responsive.spec.ts`; this file touches neither.
 */

const { battles } = vi.hoisted(() => ({ battles: { value: null as unknown } }))

mockNuxtImport('useBattles', () => () => battles.value as never)

const { routeParams } = vi.hoisted(() => ({ routeParams: { value: { id: '' } } }))

// `meta` because a real route always has one and the layout the page draws
// reads it (issue #126); without it `<NuxtLayout>` throws on mount.
mockNuxtImport(
  'useRoute',
  () => () => ({ params: routeParams.value, query: {}, meta: {} }) as never,
)

type Page = Awaited<ReturnType<typeof mountSuspended>>

const classesOf = (page: Page, testId: string): string[] =>
  page.get(`[data-testid="${testId}"]`).classes()

/** The detail page of one of the fixture's two ladder teams. */
const detailOf = (signature: string) => {
  routeParams.value = { id: teamRouteId({ formatId: FORMATS.LADDER, signature }) }

  return mountSuspended(TeamDetailPage)
}

beforeEach(() => {
  battles.value = fakeBattles(STATS_ROWS)

  signIn()
  useStatsFilters().value = defaultStatsFilters()
  useState('stats-rows').value = null
})

describe('the team detail page at a narrow width', () => {
  describe('the ranked rail beside the team', () => {
    /**
     * The switch point this issue reopened: a sidebar appearing is §4's
     * layout-changes-its-story half, so it is a prefix, and the prefix is
     * `md` — 768 had a rail's worth of width going spare.
     */
    it('turns two columns at md rather than holding one until lg', async () => {
      const layout = classesOf(await detailOf(SIGNATURES.TEAM_A), 'team-layout')

      expect(layout.some((name) => name.startsWith('md:grid-cols-'))).toBe(true)
      // One column is the grid's own default, so the phone's shape is the
      // absence of a `grid-cols-*` rather than a declaration of one.
      expect(layout.filter((name) => /^grid-cols-/.test(name))).toEqual([])
    })

    it('widens the rail at lg instead of introducing it there', async () => {
      const layout = classesOf(await detailOf(SIGNATURES.TEAM_A), 'team-layout')

      expect(layout.some((name) => name.startsWith('lg:grid-cols-'))).toBe(true)
    })

    it('brings the rail in at the width the two columns appear', async () => {
      const rail = classesOf(await detailOf(SIGNATURES.TEAM_A), 'team-rail')

      expect(rail).toContain('hidden')
      expect(rail).toContain('md:flex')
      expect(rail).not.toContain('lg:flex')
    })

    it('drops the stepper exactly where the rail takes over', async () => {
      // Both say the same thing, so a reader never has the list and the
      // stepper at once, and never has neither.
      const stepper = classesOf(await detailOf(SIGNATURES.TEAM_A), 'team-stepper')

      expect(stepper).toContain('md:hidden')
      expect(stepper).not.toContain('lg:hidden')
    })
  })

  describe('the stepper that walks the same ranking', () => {
    it('holds the touch-target floor on both steps', async () => {
      // Two arrows, one on each end team of the fixture's ranking.
      const steps = [
        classesOf(await detailOf(SIGNATURES.TEAM_A), 'step-next'),
        classesOf(await detailOf(SIGNATURES.TEAM_B), 'step-previous'),
      ]

      for (const step of steps) {
        expect(step).toContain('min-h-11')
        // §5: an arrow is an icon control, with no text to widen it.
        expect(step).toContain('min-w-11')
      }
    })

    it('keeps the two steps apart by the floor for adjacent targets', async () => {
      expect(classesOf(await detailOf(SIGNATURES.TEAM_A), 'team-stepper')).toContain('gap-2')
    })
  })

  describe('the two stat tiles', () => {
    it('lets the tiles fold on the width the card actually has', async () => {
      const stats = classesOf(await detailOf(SIGNATURES.TEAM_A), 'team-stats')

      expect(stats.some((name) => name.includes('auto-fit'))).toBe(true)
      expect(stats).not.toContain('grid-cols-2')
    })
  })

  describe('the bring rows', () => {
    it('draws the ranking bar as a share of its row, not a fixed width', async () => {
      const bar = classesOf(await detailOf(SIGNATURES.TEAM_A), 'bring-rank')

      expect(bar).not.toContain('w-32')
      expect(bar.some((name) => /^w-\d+\/\d+$/.test(name))).toBe(true)
    })
  })

  describe('the header party', () => {
    /**
     * Nothing here may claim the party fitted — that is the half of §6 read by
     * hand. What it does hold is the floor the number was chosen against:
     * `SpeciesIcon` smooths below the sheet's own 40, so a later squeeze of
     * this header has to find its width somewhere other than these icons.
     */
    it('asks for the party at the width the icon sheet draws sharp', async () => {
      const page = await detailOf(SIGNATURES.TEAM_A)
      const icons = page.get('[data-testid="team-header"]').findAll('[title]')

      expect(icons).toHaveLength(6)
      for (const icon of icons) expect(icon.attributes('style')).toContain('width: 40px')
    })
  })
})
