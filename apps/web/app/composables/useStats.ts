import { toID } from 'replay-parser'
import { overallTally, resultUnits, teamStats } from '../utils/battleStats'
import type { StatsRow } from '../utils/battleStats'

/**
 * The base both dashboard sections stand on: one filtered read of `battles`,
 * and the aggregates derived from it.
 *
 * **One fetch, two perspectives.** The win rate curve needs the individual
 * games anyway — a sliding window is over games, plotted against calendar
 * dates — so there is nothing a server-side `group by` would save, and doing
 * the arithmetic in the browser keeps every rule in a pure function next door
 * in `utils/battleStats.ts`.
 *
 * **Spectated battles are excluded here and cannot be filtered back in.** A
 * battle where neither player is one of the user's names has no result to
 * count; letting it through would put battles that are nobody's into a
 * personal win rate (CONTEXT.md, Spectated).
 *
 * See docs/specs/2026-08-16-replay-analytics-design.md §7.
 */

/**
 * The columns the stats layer slices on. `details` is deliberately not one.
 *
 * Typed as `string` rather than left as the literal it is: postgrest-js parses
 * a literal column list at the type level to work out the row shape, and over
 * a list this long tsc gives up with "type instantiation is excessively deep".
 * The shape is asserted below instead, as `StatsRow`.
 */
const COLUMNS: string =
  'replay_id, played_at, format_id, series_id, my_username, result, rating, rating_delta, team_signature, bring_signature, bring_complete'

/**
 * Rows per request. PostgREST caps a response at its own default of 1000, so
 * a heavy account would silently arrive truncated — and a win rate over the
 * first thousand games of an account, presented as the whole of it, is worse
 * than an error. Paged until a short page says that was the end.
 */
const PAGE = 1000

/** The suffixes that make a format a best-of series rather than a ladder Bo1. */
const BEST_OF_SUFFIXES = ['bo2', 'bo3']

export function useStats() {
  const { $supabase } = useNuxtApp()
  const user = useCurrentUser()
  const filters = useStatsFilters()

  /**
   * Every row the server-side filters admit, or `null` while nothing has been
   * read yet. In `useState` so that both sections read the one fetch.
   *
   * `null` and `[]` mean different things: "not read yet" and "this user has
   * no battles matching", and only the second is something to tell the user
   * about.
   */
  const rows = useState<StatsRow[] | null>('stats-rows', () => null)
  const loading = useState('stats-loading', () => false)
  const error = useState<Error | null>('stats-error', () => null)

  const loaded = computed(() => rows.value !== null)

  function requireUserId() {
    const id = user.value?.id
    if (!id) throw new Error('No signed-in user to read battles for.')
    return id
  }

  /**
   * A whole-day bound for a date with no time in it, so that `to` includes the
   * day the user named rather than stopping at its first instant.
   */
  function endOfDay(bound: string): string {
    return bound.includes('T') ? bound : `${bound}T23:59:59.999Z`
  }

  /**
   * The filters that the database can apply. Identity is not among them: names
   * are stored in the spelling a replay showed, and `toID()` normalisation —
   * which strips case and every non-alphanumeric character — is not something
   * PostgREST can be asked for. It is applied to the fetched rows instead, so
   * the same rule holds there as everywhere else.
   */
  function queryFor(userId: string) {
    const base = $supabase
      .from('battles')
      .select(COLUMNS)
      // Redundant under RLS, and kept anyway: it is what puts the
      // (user_id, played_at) index to work.
      .eq('user_id', userId)
      // Spectated. Not a filter the caller can turn off.
      .not('my_side', 'is', null)

    let query = base

    const { formatId, from, to, bestOf } = filters.value

    if (formatId) query = query.eq('format_id', formatId)
    if (from) query = query.gte('played_at', from)
    if (to) query = query.lte('played_at', endOfDay(to))

    if (bestOf === 'bo3') {
      query = query.or(BEST_OF_SUFFIXES.map((suffix) => `format_id.like.*${suffix}`).join(','))
    } else if (bestOf === 'bo1') {
      // Chained rather than combined: successive filters are ANDed, which is
      // what "neither suffix" means.
      for (const suffix of BEST_OF_SUFFIXES) {
        query = query.not('format_id', 'like', `%${suffix}`)
      }
    }

    // Oldest first, so a curve can be drawn straight off the rows.
    return query.order('played_at', { ascending: true })
  }

  /**
   * Reads every matching row, replacing whatever was read before.
   *
   * Throws nothing at the caller — the two sections show `error` — except the
   * one thing that is a programming error: no signed-in user.
   */
  async function load(): Promise<void> {
    const userId = requireUserId()

    loading.value = true
    error.value = null

    try {
      const collected: StatsRow[] = []

      for (let start = 0; ; start += PAGE) {
        const { data, error: failed } = await queryFor(userId).range(start, start + PAGE - 1)

        if (failed) throw failed

        const page = (data as unknown as StatsRow[] | null) ?? []
        collected.push(...page)

        if (page.length < PAGE) break
      }

      rows.value = collected
    } catch (cause) {
      // The rows are cleared, not left standing: numbers from the previous
      // filter set, sitting under the new one, would be read as an answer.
      rows.value = null
      error.value = cause instanceof Error ? cause : new Error(String(cause))
    } finally {
      loading.value = false
    }
  }

  /**
   * The rows the current filters admit — the fetched ones with the identity
   * filter applied, since that one is settled here rather than in the query.
   */
  const battles = computed<StatsRow[]>(() => {
    const fetched = rows.value ?? []
    const identity = filters.value.identity

    if (!identity) return fetched

    const wanted = toID(identity)

    return fetched.filter((row) => toID(row.my_username ?? '') === wanted)
  })

  /** Games or series, in the order they were played — the curve's x-axis. */
  const units = computed(() => resultUnits(battles.value, filters.value.aggregate))

  const overall = computed(() => overallTally(battles.value, filters.value.aggregate))

  const teams = computed(() =>
    teamStats(battles.value, {
      aggregate: filters.value.aggregate,
      includeIncompleteBrings: filters.value.includeIncompleteBrings,
    }),
  )

  return { filters, battles, units, overall, teams, loading, error, loaded, load }
}
