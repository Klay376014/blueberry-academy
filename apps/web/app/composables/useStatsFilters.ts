import type { Aggregate } from '../utils/battleStats'

/**
 * The dashboard's global filters, shared by both sections.
 *
 * One set rather than one per section: "how am I doing lately" and "because of
 * which team" are two faces of the same question, so splitting the filters
 * would make a user set the same format and the same date range twice
 * (design document §7).
 */
export interface StatsFilters {
  /**
   * Which Showdown name's battles, or all of them. Compared through `toID()`
   * like every other identity comparison, so `NotLittleStar` and
   * `notlittlestar` are one name.
   */
  identity: string | null

  /**
   * An exact `format_id`, not a regulation. `gen9championsvgc2026regmb` and
   * `...regmbbo3` are different formats and, by CONTEXT.md, different teams —
   * averaging ladder Bo1 together with event Bo3 says nothing about either.
   */
  formatId: string | null

  /**
   * Inclusive bounds, as ISO 8601. A date with no time is taken as the whole
   * of that day in UTC, which is also how `played_at` is stored.
   */
  from: string | null
  to: string | null

  /**
   * Ladder Bo1, best-of series, or both. A `bo2` format counts as best-of: it
   * is a series whichever number is in the name.
   */
  bestOf: 'all' | 'bo1' | 'bo3'

  /** Count each game, or fold each series into one result. */
  aggregate: Aggregate

  /** Whether bring groupings admit games where a pick never appeared. */
  includeIncompleteBrings: boolean
}

export function defaultStatsFilters(): StatsFilters {
  return {
    identity: null,
    formatId: null,
    from: null,
    to: null,
    bestOf: 'all',
    aggregate: 'game',
    // The floor the design asks for. See TeamStatsOptions.
    includeIncompleteBrings: false,
  }
}

/**
 * A `useState` rather than a module-level ref, for the same reason as
 * useCurrentUser: the value lives on the Nuxt instance and is resettable
 * between tests.
 */
export function useStatsFilters() {
  return useState<StatsFilters>('stats-filters', defaultStatsFilters)
}
