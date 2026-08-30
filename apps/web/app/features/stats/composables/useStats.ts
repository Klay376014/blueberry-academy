import { effectScope } from 'vue'
import type { EffectScope } from 'vue'
import { toID } from 'replay-parser'
import type { TeamRef } from '../utils/teamRoute'
import { aggregateFor, overallTally, resultUnits, teamStats } from '../utils/battleStats'
import type { StatsRow } from '~/shared/api/battles'

/**
 * One filtered read of `battles`, and the aggregates both dashboard sections
 * derive from it.
 *
 * The win rate curve needs the individual games anyway, so there is one fetch
 * and the arithmetic happens in `utils/battleStats.ts`. The read itself — the
 * columns, the `user_id` scope, the paging, spectated battles staying out —
 * belongs to `app/shared/api/battles.ts`.
 *
 * The interface is state plus three verbs. When to re-read is this module's
 * business, not a sequence of steps a page has to remember in the right order
 * (issue #53); what a page still knows, and this cannot, is that something
 * happened — `refresh()` — and which team the address is pointing at —
 * `focusTeam()`.
 *
 * See docs/specs/2026-08-16-replay-analytics-design.md §7.
 */

export function useStats() {
  const user = useCurrentUser()
  const storedBattles = useBattles()
  const filters = useStatsFilters()

  /**
   * Every row the server-side filters admit, `null` until the first read. The
   * two states mean "no matching battles" and "nothing read yet", and only the
   * first is worth telling the user about.
   */
  const rows = useState<StatsRow[] | null>('stats-rows', () => null)
  const loading = useState('stats-loading', () => false)
  const error = useState<Error | null>('stats-error', () => null)

  /**
   * The read in the air, so a second caller waits on the first rather than
   * asking again — the same shape `useBattleLog` uses for the same problem.
   * Cleared when it settles, which is what lets a failed read be retried.
   */
  const reading = useState<Promise<void> | null>('stats-reading', () => null)

  /**
   * What says a re-read is due. The other filters are settled in the browser,
   * so changing them must not cost a request.
   */
  const serverFilterKey = computed(() => [filters.value.from, filters.value.to].join('|'))

  /**
   * The dates the rows in memory were read under, or are being read under.
   * `null` until a read has been attempted at all.
   */
  const readKey = useState<string | null>('stats-read-key', () => null)

  /**
   * Which read owns the rows. A later one supersedes an earlier one, so two in
   * the air at once — an import's `refresh()` over a filter change's read —
   * cannot settle in the wrong order and leave the older answer on screen.
   */
  const reader = useState('stats-reader', () => 0)

  const loaded = computed(() => rows.value !== null)

  /**
   * Reads every matching row, replacing whatever was read before. Reports
   * through `error` rather than throwing: every caller of it is a page that
   * has somewhere to put a message.
   *
   * Only two of the six filters are asked of the database. Identity, because
   * `toID()` strips case and every non-alphanumeric character and PostgREST
   * cannot be asked for that. And the format, because the format picker has to
   * offer the formats this account actually played — asking the database for
   * one format would leave the picker listing only the format already chosen.
   */
  async function read(): Promise<void> {
    const mine = reader.value + 1
    reader.value = mine
    const asker = user.value?.id

    /**
     * Whether this read still owns the state. A later read supersedes it, and
     * so does somebody else signing in: rows fetched for one account must not
     * land on the next account's dashboard, however long the request took.
     */
    const current = () => reader.value === mine && user.value?.id === asker

    loading.value = true
    error.value = null
    readKey.value = serverFilterKey.value

    try {
      const { from, to } = filters.value
      const fetched = await storedBattles.battlesOf({ from, to })
      if (!current()) return

      rows.value = fetched
      // Name first: the formats on offer are the ones that name played.
      adoptIdentity()
      adoptFormat()
    } catch (cause) {
      if (!current()) return

      // Cleared, not left standing: numbers from the previous filter set,
      // sitting under the new one, would be read as an answer.
      rows.value = null
      error.value = cause instanceof Error ? cause : new Error(String(cause))
    } finally {
      // Left to whichever read owns the state, so a superseded one does not
      // report the newer one as finished.
      if (current()) loading.value = false
    }
  }

  /**
   * A read, and the promise every other caller is given until it settles.
   * Dropped once it has, so a read that failed is not what the next caller
   * gets handed back.
   */
  function startReading(): Promise<void> {
    const started = read().finally(() => {
      if (reading.value === started) reading.value = null
    })

    reading.value = started

    return started
  }

  /**
   * The battles are in, whatever it takes to get them there. Idempotent, and
   * safe to call from every page in setup.
   *
   * Resolves immediately with nobody signed in, rather than throwing: setup
   * runs before the route middleware has bounced a signed-out visitor, and the
   * watcher below reads as soon as somebody signs in.
   */
  function whenLoaded(): Promise<void> {
    if (!user.value) return Promise.resolve()

    return reading.value ?? (loaded.value ? Promise.resolve() : startReading())
  }

  /**
   * Read it all again, because something changed that this module cannot see.
   *
   * `/import` is the caller that matters: `useState` outlives a route in an
   * SPA, so 300 battles could be imported and the dashboard would still be
   * showing the numbers from before them.
   */
  function refresh(): Promise<void> {
    if (!user.value) return Promise.resolve()

    return startReading()
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
   * Private, and reached from outside only through `focusTeam()`. A page
   * writing `filters.value.formatId` itself would walk straight past the rule
   * this exists for — only ever adopt a format the options actually hold —
   * and land on one with no games under it, which draws as a blank screen
   * with nothing to say why.
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

  onceForTheSession(() => {
    watch(serverFilterKey, (key) => {
      // Nothing has ever been read, so there is nothing to re-read:
      // `whenLoaded()` will use whatever the dates say when it runs. Read at
      // all — including a read that failed — and a new date range is a reason
      // to try again.
      if (readKey.value === null) return
      // And what is in the air may be this very change already: a page can set
      // the dates and await `whenLoaded()` in the same tick, and the watcher
      // only flushes afterwards.
      if (key === readKey.value) return

      void refresh()
    })

    // The formats on offer are the ones the chosen name played, so moving the
    // name can leave the chosen format with nothing under it.
    watch(
      () => filters.value.identity,
      () => adoptFormat(),
    )

    // Signing in happens after every page's setup has already run and been
    // told there was nothing to read.
    watch(
      () => user.value?.id,
      (id) => {
        if (id) void refresh()
      },
    )
  })

  /**
   * The format the address is asking for.
   *
   * A verb rather than a writable filter, because the page knows which team it
   * is showing and this module knows which formats have games under them.
   */
  function focusTeam(team: TeamRef | null): void {
    adoptFormat(team?.formatId)
  }

  /**
   * Games or series, decided by the format rather than by the reader: a Bo3
   * format is counted per series and a ladder format per game (`aggregateFor`).
   */
  const aggregate = computed(() => aggregateFor(filters.value.formatId))

  /** Games or series, in the order they were played — the curve's x-axis. */
  const units = computed(() => resultUnits(battles.value, aggregate.value))

  const overall = computed(() => overallTally(battles.value, aggregate.value))

  const teams = computed(() =>
    teamStats(battles.value, {
      aggregate: aggregate.value,
      includeIncompleteBrings: filters.value.includeIncompleteBrings,
    }),
  )

  return {
    filters,
    battles,
    aggregate,
    units,
    overall,
    teams,
    formatOptions,
    identityOptions,
    loading,
    error,
    loaded,
    whenLoaded,
    refresh,
    focusTeam,
  }
}

/**
 * Runs `register` once per session, however many times `useStats()` is called
 * — a watcher per caller would turn one filter change into three reads, which
 * is the trap `BattleDrawer.vue` documents on its own side.
 *
 * The scope is detached because these watchers belong to the session and not
 * to whichever component happened to call first: registered in that
 * component's scope they would be disposed the moment it unmounted, and the
 * next page to mount would find the guard set and no watchers left.
 *
 * The scope is what the guard holds, rather than a boolean beside it, so the
 * two cannot come apart: both live on the Nuxt instance and a new instance
 * gets a new pair. Nothing stops the old scope — the app has no teardown to
 * hang that on and lives as long as the tab does. In a test run a torn-down
 * instance therefore leaves an inert scope behind, watching refs that nothing
 * writes to again.
 */
function onceForTheSession(register: () => void): void {
  const watchers = useState<EffectScope | null>('stats-watchers', () => null)
  if (watchers.value) return

  const scope = effectScope(true)
  scope.run(register)
  watchers.value = scope
}
