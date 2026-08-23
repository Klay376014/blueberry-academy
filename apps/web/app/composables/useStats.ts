import { toID } from 'replay-parser'
import { overallTally, resultUnits, teamStats } from '../utils/battleStats'
import type { StatsRow } from '../utils/battleStats'

/**
 * One filtered read of `battles`, and the aggregates both dashboard sections
 * derive from it.
 *
 * The win rate curve needs the individual games anyway, so there is one fetch
 * and the arithmetic happens in `utils/battleStats.ts`. Spectated battles are
 * excluded here and cannot be filtered back in.
 *
 * See docs/specs/2026-08-16-replay-analytics-design.md §7.
 */

/**
 * The columns the stats layer slices on — `details` deliberately not among
 * them.
 *
 * Typed as `string` rather than left as the literal it is: postgrest-js parses
 * a literal column list at the type level, and over a list this long tsc gives
 * up with "type instantiation is excessively deep". The shape is asserted as
 * `StatsRow` below instead.
 */
const COLUMNS: string =
  'replay_id, played_at, format_id, series_id, my_username, result, rating, rating_delta, team_signature, bring_signature, bring_complete'

/**
 * Rows per request. PostgREST caps a response at its own default of 1000, so
 * without paging a heavy account arrives silently truncated — and a win rate
 * over the first thousand games, presented as the whole of it, is worse than
 * an error.
 */
const PAGE = 1000

/** The suffixes that make a format a best-of series rather than a ladder Bo1. */
const BEST_OF_SUFFIXES = ['bo2', 'bo3']

export function useStats() {
  const { $supabase } = useNuxtApp()
  const user = useCurrentUser()
  const filters = useStatsFilters()

  /**
   * Every row the server-side filters admit, `null` until the first read. The
   * two states mean "no matching battles" and "nothing read yet", and only the
   * first is worth telling the user about.
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

  /** A date with no time in it covers the whole of that day. */
  function endOfDay(bound: string): string {
    return bound.includes('T') ? bound : `${bound}T23:59:59.999Z`
  }

  /**
   * The filters the database can apply.
   *
   * Two are settled in the browser instead. Identity, because `toID()` strips
   * case and every non-alphanumeric character and PostgREST cannot be asked
   * for that. And the format, because the format picker has to offer the
   * formats this account actually played — asking the database for one format
   * would leave the picker listing only the format already chosen.
   */
  function queryFor(userId: string) {
    const base = $supabase
      .from('battles')
      .select(COLUMNS)
      // Redundant under RLS, and what puts the (user_id, played_at) index to work.
      .eq('user_id', userId)
      // Spectated. Not a filter the caller can turn off.
      .not('my_side', 'is', null)

    let query = base

    const { from, to, bestOf } = filters.value

    if (from) query = query.gte('played_at', from)
    if (to) query = query.lte('played_at', endOfDay(to))

    if (bestOf === 'bo3') {
      query = query.or(BEST_OF_SUFFIXES.map((suffix) => `format_id.like.*${suffix}`).join(','))
    } else if (bestOf === 'bo1') {
      // Successive filters are ANDed, which is what "neither suffix" means.
      for (const suffix of BEST_OF_SUFFIXES) {
        query = query.not('format_id', 'like', `%${suffix}`)
      }
    }

    // Oldest first, so a curve can be drawn straight off the rows.
    return query.order('played_at', { ascending: true })
  }

  /**
   * Reads every matching row, replacing whatever was read before. Reports
   * through `error` rather than throwing, except for the one programming
   * error: no signed-in user.
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
      // Cleared, not left standing: numbers from the previous filter set,
      // sitting under the new one, would be read as an answer.
      rows.value = null
      error.value = cause instanceof Error ? cause : new Error(String(cause))
    } finally {
      loading.value = false
    }
  }

  /** The fetched rows with the two browser-side filters applied. */
  const battles = computed<StatsRow[]>(() => {
    const { identity, formatId } = filters.value
    const wanted = identity ? toID(identity) : null

    return (rows.value ?? []).filter(
      (row) =>
        (wanted === null || toID(row.my_username ?? '') === wanted) &&
        (formatId === null || row.format_id === formatId),
    )
  })

  /**
   * The formats to offer, in play order — derived from the fetched rows rather
   * than from a list of every format Showdown has, so the picker only ever
   * offers a format that would return something.
   */
  const formatOptions = computed(() => [...new Set((rows.value ?? []).map((r) => r.format_id))])

  /** Likewise the Showdown names, in the spelling the replays carried. */
  const identityOptions = computed(() => {
    const byId = new Map<string, string>()

    for (const row of rows.value ?? []) {
      const name = row.my_username
      if (name && !byId.has(toID(name))) byId.set(toID(name), name)
    }

    return [...byId.values()]
  })

  /**
   * What the pages watch to know a re-read is due. The other filters are
   * settled in the browser, so changing them must not cost a request.
   */
  const serverFilterKey = computed(() =>
    [filters.value.from, filters.value.to, filters.value.bestOf].join('|'),
  )

  /** Games or series, in the order they were played — the curve's x-axis. */
  const units = computed(() => resultUnits(battles.value, filters.value.aggregate))

  const overall = computed(() => overallTally(battles.value, filters.value.aggregate))

  const teams = computed(() =>
    teamStats(battles.value, {
      aggregate: filters.value.aggregate,
      includeIncompleteBrings: filters.value.includeIncompleteBrings,
    }),
  )

  return {
    filters,
    battles,
    units,
    overall,
    teams,
    formatOptions,
    identityOptions,
    serverFilterKey,
    loading,
    error,
    loaded,
    load,
  }
}
