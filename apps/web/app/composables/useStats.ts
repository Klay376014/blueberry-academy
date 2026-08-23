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

    const { from, to } = filters.value

    if (from) query = query.gte('played_at', from)
    if (to) query = query.lte('played_at', endOfDay(to))

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
      // Name first: the formats on offer are the ones that name played.
      adoptIdentity()
      adoptFormat()
    } catch (cause) {
      // Cleared, not left standing: numbers from the previous filter set,
      // sitting under the new one, would be read as an answer.
      rows.value = null
      error.value = cause instanceof Error ? cause : new Error(String(cause))
    } finally {
      loading.value = false
    }
  }

  /** The fetched rows under the chosen Showdown name, whatever the format. */
  const nameRows = computed(() => {
    const wanted = filters.value.identity ? toID(filters.value.identity) : null

    return (rows.value ?? []).filter(
      (row) => wanted === null || toID(row.my_username ?? '') === wanted,
    )
  })

  /**
   * The fetched rows under the chosen Showdown name and format.
   *
   * Empty until a format is chosen, which is a state the dashboard passes
   * through for one tick before `adoptFormat()` runs and never returns to.
   *
   * A null identity is left unfiltered rather than emptied: it survives only
   * on an account whose battles carry no Showdown name at all, and there is
   * then no second name for anything to be pooled with.
   */
  const battles = computed<StatsRow[]>(() => {
    const { formatId } = filters.value
    if (formatId === null) return []

    return nameRows.value.filter((row) => row.format_id === formatId)
  })

  /**
   * The formats to offer, most-played first — derived from the fetched rows
   * rather than from a list of every format Showdown has, so the picker only
   * ever offers a format that would return something.
   *
   * Scoped to the chosen name, so the two required pickers cannot be walked
   * into a combination nobody played. Ordered by count rather than
   * alphabetically because the first entry is also the default: an account
   * with two hundred ladder games and one Hackmons Cup should open on the two
   * hundred.
   */
  const formatOptions = computed(() => {
    const games = new Map<string, number>()

    for (const row of nameRows.value) games.set(row.format_id, (games.get(row.format_id) ?? 0) + 1)

    return [...games].toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id)
  })

  /**
   * Settles the required format: the one asked for, else the one already
   * chosen, else the most played.
   *
   * Called at the end of every read rather than left to the pages. A page that
   * forgot would render nothing at all, and "nothing at all" is a bad way to
   * find out about a missing call.
   */
  function adoptFormat(preferred?: string | null): void {
    const options = formatOptions.value
    if (!options.length) return

    if (preferred && options.includes(preferred)) {
      filters.value.formatId = preferred
      return
    }

    const chosen = filters.value.formatId
    // A date range can exclude every game of the chosen format, and a picker
    // showing a format with nothing under it is a dead end.
    if (chosen !== null && options.includes(chosen)) return

    filters.value.formatId = options[0]!
  }

  /**
   * Likewise the Showdown names, most-played first and in the spelling the
   * replays carried. One entry per `toID()`, so a rename in capitalisation is
   * not a second person.
   */
  const identityOptions = computed(() => {
    const byId = new Map<string, { name: string; games: number }>()

    for (const row of rows.value ?? []) {
      const name = row.my_username
      if (!name) continue

      const seen = byId.get(toID(name))
      if (seen) seen.games += 1
      else byId.set(toID(name), { name, games: 1 })
    }

    return [...byId.values()]
      .toSorted((a, b) => b.games - a.games || a.name.localeCompare(b.name))
      .map((entry) => entry.name)
  })

  /**
   * Settles the required Showdown name on the most-played one, unless the
   * chosen one is still among the battles that came back.
   */
  function adoptIdentity(): void {
    const options = identityOptions.value
    if (!options.length) return

    const chosen = filters.value.identity
    if (chosen !== null && options.some((name) => toID(name) === toID(chosen))) return

    filters.value.identity = options[0]!
  }

  /**
   * What the pages watch to know a re-read is due. The other filters are
   * settled in the browser, so changing them must not cost a request.
   */
  const serverFilterKey = computed(() => [filters.value.from, filters.value.to].join('|'))

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
    adoptFormat,
    identityOptions,
    adoptIdentity,
    serverFilterKey,
    loading,
    error,
    loaded,
    load,
  }
}
