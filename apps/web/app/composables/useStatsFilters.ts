import type { Aggregate } from '../utils/battleStats'

/**
 * The dashboard's global filters, shared by both sections rather than one set
 * each — see docs/specs/2026-08-16-replay-analytics-design.md §7.
 */
export interface StatsFilters {
  /** A Showdown name, compared through `toID()`, or all of them. */
  identity: string | null

  /**
   * An exact `format_id`, not a regulation: by CONTEXT.md a Bo1 ladder format
   * and its Bo3 counterpart are different formats and different teams.
   */
  formatId: string | null

  /** Inclusive ISO 8601 bounds. A date with no time covers that whole day. */
  from: string | null
  to: string | null

  /** A `bo2` format counts as best-of: it is a series whichever number it is. */
  bestOf: 'all' | 'bo1' | 'bo3'

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
    includeIncompleteBrings: false,
  }
}

/** `useState` so the value lives on the Nuxt instance and resets between tests. */
export function useStatsFilters() {
  return useState<StatsFilters>('stats-filters', defaultStatsFilters)
}
