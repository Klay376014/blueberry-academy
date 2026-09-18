import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import Dashboard from '../../app/pages/index.vue'
import { fakeBattles } from '../fakes/battles'
import { STATS_ROWS } from '../fixtures/stats-rows'
import { signIn } from '../helpers'

/**
 * The dashboard's half of the class contract in
 * docs/specs/2026-09-18-responsive-baseline.md. §6 of that document is what
 * says why this file asserts classes and not widths: jsdom has no layout
 * engine, so "does not scroll sideways" is read by hand at the six widths and
 * written back onto issue #214.
 *
 * The site chrome's half is `responsive.spec.ts`, which this file deliberately
 * does not touch.
 */

const { battles } = vi.hoisted(() => ({ battles: { value: null as unknown } }))

mockNuxtImport('useBattles', () => () => battles.value as never)

type Page = Awaited<ReturnType<typeof mountSuspended>>

const classesOf = (page: Page, testId: string) => page.get(`[data-testid="${testId}"]`).classes()

beforeEach(async () => {
  battles.value = fakeBattles(STATS_ROWS)

  signIn()
  useStatsFilters().value = defaultStatsFilters()
  useState('stats-rows').value = null
})

describe('the dashboard at a narrow width', () => {
  describe('the filter bar', () => {
    /** Four controls and a checkbox: a layout change, so §4 says prefixes. */
    it('lays the controls out in columns that change with the viewport', async () => {
      const bar = classesOf(await mountSuspended(Dashboard), 'filter-bar')

      expect(bar).toContain('grid')
      expect(bar).toContain('grid-cols-1')
      expect(bar).toContain('sm:grid-cols-2')
      expect(bar).toContain('lg:grid-cols-4')
    })

    it('gives every control the touch-target floor and the width of its column', async () => {
      const page = await mountSuspended(Dashboard)

      for (const testId of ['filter-identity', 'filter-format', 'filter-from', 'filter-to']) {
        const control = classesOf(page, testId)

        expect(control, testId).toContain('min-h-11')
        // Without this the date inputs keep their intrinsic width and the
        // format select grows to the longest `format_id` it holds.
        expect(control, testId).toContain('w-full')
      }
    })

    it('holds the floor for the checkbox through the label that carries it', async () => {
      const page = await mountSuspended(Dashboard)
      const box = page.get('[data-testid="filter-incomplete"]')

      // The 16px box is the graphic; the label around it is the target.
      expect(box.element.parentElement?.className).toContain('min-h-11')
    })

    it('writes the labels at the floor for a form label', async () => {
      const page = await mountSuspended(Dashboard)
      const labels = page.get('[data-testid="filter-bar"]').findAll('label[for]')

      expect(labels).toHaveLength(4)

      for (const label of labels) expect(label.classes(), label.text()).toContain('text-sm')
    })
  })

  describe('the trend section', () => {
    it('holds the touch-target floor on the window buttons', async () => {
      const page = await mountSuspended(Dashboard)

      for (const size of [10, 20, 50]) {
        expect(classesOf(page, `trend-window-${size}`), String(size)).toContain('min-h-11')
      }
    })

    /**
     * One column until `sm`, because a third of 320 cannot hold the tile's own
     * numeral — and the numeral is the tile.
     */
    it('stacks the summary tiles until three of them fit', async () => {
      const tiles = classesOf(await mountSuspended(Dashboard), 'summary-tiles')

      expect(tiles).toContain('grid-cols-1')
      expect(tiles).toContain('sm:grid-cols-3')
    })
  })

  /**
   * The card's floor is its party of six icons, so two columns wait for `sm`
   * and three for `lg`. 768 stays at two on purpose: a third of it is narrower
   * than the six.
   */
  it('turns the team grid at the widths a card of six icons fits', async () => {
    const grid = classesOf(await mountSuspended(Dashboard), 'team-grid')

    expect(grid).toContain('grid-cols-1')
    expect(grid).toContain('sm:grid-cols-2')
    expect(grid).toContain('lg:grid-cols-3')
    expect(grid).not.toContain('md:grid-cols-3')
  })

  /** §5: the hint stays a 16px circle and grows a 44px hit area behind it. */
  it('gives the hint a hit area without growing the circle', async () => {
    const hint = classesOf(await mountSuspended(Dashboard), 'info-hint')

    expect(hint).toContain('size-4')
    expect(hint).toContain('before:size-11')
  })
})
