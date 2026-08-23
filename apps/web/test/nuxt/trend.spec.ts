import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import Dashboard from '../../app/pages/index.vue'
import type { StatsRow } from '../../app/utils/battleStats'
import { defaultStatsFilters } from '../../app/composables/useStatsFilters'
import { STATS_ROWS } from '../fixtures/stats-rows'
import { signIn } from '../helpers'

/**
 * The recent-form section on the dashboard, over the real query layer with
 * only Supabase faked — the same arrangement as team-performance.spec.ts.
 *
 * The charts are rendered for real rather than stubbed, so the assertion that
 * a missing rating breaks the line is made against the path Unovis actually
 * drew. See test/setup.ts for the two jsdom holes that makes necessary.
 */

const db = { rows: [] as StatsRow[] }

function builder() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    not: () => chain,
    gte: () => chain,
    lte: () => chain,
    or: () => chain,
    order: () => chain,
    range: (from: number, to: number) =>
      Promise.resolve({ data: db.rows.slice(from, to + 1), error: null }),
  }

  return chain
}

/**
 * How many separate strokes a line's `d` attribute is made of. Every stroke
 * starts with a move-to, so a curve with one gap in it has two.
 */
function strokeCount(path: string): number {
  return (path.match(/M/g) ?? []).length
}

/**
 * The line Unovis drew in the named chart, once its enter animation has run.
 *
 * The class is matched on a substring because Unovis hashes it
 * (`css-142r7hb-linePath`), and the wait is on the value because the animation
 * starts from a flat line and only the last frame carries the real geometry.
 */
async function strokesIn(
  page: {
    find: (selector: string) => { exists: () => boolean; attributes: () => Record<string, string> }
  },
  testId: string,
  expected: number,
): Promise<number> {
  let strokes = 0

  await vi.waitFor(
    () => {
      const path = page.find(`[data-testid="${testId}"] path[class*="linePath"]`)
      strokes = path.exists() ? strokeCount(path.attributes().d ?? '') : 0

      expect(strokes).toBe(expected)
    },
    { timeout: 2000, interval: 20 },
  )

  return strokes
}

function rated(replayId: string, playedAt: string, rating: number | null): StatsRow {
  return {
    replay_id: replayId,
    played_at: playedAt,
    format_id: 'gen9championsvgc2026regmb',
    series_id: null,
    my_username: 'NotLittleStar',
    result: 'win',
    rating,
    rating_delta: null,
    team_signature: null,
    bring_signature: null,
    bring_complete: true,
  }
}

beforeEach(() => {
  const nuxtApp = useNuxtApp()
  if (!nuxtApp.$supabase) nuxtApp.provide('supabase', { from: () => builder() })

  signIn()
  db.rows = STATS_ROWS
  useStatsFilters().value = defaultStatsFilters()
  useState('stats-rows').value = null
})

describe('the recent form section', () => {
  it('shows the totals and the run the last game leaves you on', async () => {
    const page = await mountSuspended(Dashboard)

    // The ladder format, which the page opens on: six decided games of the
    // seven, four of them won, and the last of them — ladder-7 — lost.
    expect(page.get('[data-testid="summary-games"]').text()).toBe('6')
    expect(page.get('[data-testid="summary-rate"]').text()).toBe('67%')
    expect(page.get('[data-testid="summary-streak"]').text()).toBe('1')
  })

  it('offers the window sizes and says which one the curve is drawn at', async () => {
    const page = await mountSuspended(Dashboard)

    expect(page.get('[data-testid="trend-window-20"]').attributes('aria-pressed')).toBe('true')
    expect(page.text()).toContain('window of 20')

    await page.get('[data-testid="trend-window-50"]').trigger('click')

    expect(page.text()).toContain('window of 50')
    expect(page.get('[data-testid="trend-window-20"]').attributes('aria-pressed')).toBe('false')
  })

  it('breaks the rating line over the days that carried no rating', async () => {
    // Two rated days, two days of battles the log gave no rating for, then
    // rated again — all in one format, because the format is now required and
    // the gap has to be an interior one.
    db.rows = [
      rated('ladder-a', '2026-08-01T10:00:00Z', 1500),
      rated('ladder-b', '2026-08-02T10:00:00Z', 1520),
      rated('ladder-c', '2026-08-03T10:00:00Z', null),
      rated('ladder-d', '2026-08-04T10:00:00Z', null),
      rated('ladder-e', '2026-08-05T10:00:00Z', 1490),
      rated('ladder-f', '2026-08-06T10:00:00Z', 1512),
    ]

    const page = await mountSuspended(Dashboard)

    // Two strokes: the line stops at the last rated game and starts again at
    // the next one. Drawing through would be a rating nobody was ever given.
    await expect(strokesIn(page, 'trend-rating', 2)).resolves.toBe(2)

    // The win rate curve has no such hole — every game has a result to count.
    await expect(strokesIn(page, 'trend-win-rate', 1)).resolves.toBe(1)
  })

  it('says so rather than drawing an empty frame when nothing has a rating', async () => {
    db.rows = STATS_ROWS.map((row) => ({ ...row, rating: null }))

    const page = await mountSuspended(Dashboard)

    expect(page.get('[data-testid="trend-empty"]').text()).toContain('no number to plot')
  })

  it('follows the global filters', async () => {
    const page = await mountSuspended(Dashboard)

    useStatsFilters().value = { ...useStatsFilters().value, identity: 'SomeAlt' }
    await nextTick()

    // ladder-7 is the only battle that name played, and it was a loss.
    expect(page.get('[data-testid="summary-games"]').text()).toBe('1')
    expect(page.get('[data-testid="summary-rate"]').text()).toBe('0%')
  })

  it('counts a run by game even when the page is counting series', async () => {
    const page = await mountSuspended(Dashboard)

    useStatsFilters().value = {
      ...useStatsFilters().value,
      formatId: 'gen9championsvgc2026regmbbo3',
      aggregate: 'series',
    }
    await nextTick()

    // Two units by series, and the last of them is a 1-1 that folds to a tie
    // — but the last game played was still a loss, and the streak is about
    // games.
    expect(page.get('[data-testid="summary-games"]').text()).toBe('2')
    expect(page.get('[data-testid="summary-streak"]').text()).toBe('1')
  })
})
