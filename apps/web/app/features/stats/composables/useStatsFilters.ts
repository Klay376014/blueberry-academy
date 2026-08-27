import type { Aggregate } from '../utils/battleStats'

/**
 * The dashboard's global filters, shared by both sections rather than one set
 * each — see docs/specs/2026-08-16-replay-analytics-design.md §7.
 */
export interface StatsFilters {
  /**
   * A Showdown name, compared through `toID()`.
   *
   * Required for the same reason the format is: a ladder rating belongs to an
   * account, so two names' ratings are two different numbers and must not be
   * drawn as one line. `null` only means "not chosen yet" — the read settles
   * it on the most-played name.
   *
   * The cost, accepted: a rename splits its own history in two, and the win
   * rate across both cannot be seen at once. What this does not touch is what
   * the alias list is actually for — deciding which side of an imported battle
   * is yours — nor `toID()` merging the spellings of one name.
   */
  identity: string | null

  /**
   * An exact `format_id`, not a regulation: by CONTEXT.md a Bo1 ladder format
   * and its Bo3 counterpart are different formats and different teams.
   *
   * Required, not "all formats": a win rate pooled across regulations answers
   * no question anybody has, and two formats' ladder ratings are two different
   * numbers that must not be drawn as one line. `null` only means "not chosen
   * yet" — the dashboard picks the most-played format as soon as the battles
   * are in.
   */
  formatId: string | null

  /** Inclusive ISO 8601 bounds. A date with no time covers that whole day. */
  from: string | null
  to: string | null

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
    aggregate: 'game',
    includeIncompleteBrings: false,
  }
}

/** `useState` so the value lives on the Nuxt instance and resets between tests. */
export function useStatsFilters() {
  return useState<StatsFilters>('stats-filters', defaultStatsFilters)
}
