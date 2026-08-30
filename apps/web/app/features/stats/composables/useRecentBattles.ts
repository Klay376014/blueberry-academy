import type { BattleDetails, BattleResult } from '~/shared/api/battles'

/**
 * The most recent games under the filters already on screen, with the little
 * the list needs that the stats layer does not read.
 *
 * The stats read deliberately leaves `details` out — it is per-row JSON and a
 * heavy account is thousands of rows. So the list takes the ids it is about to
 * show and asks for their extra columns, which is one small request whatever
 * the size of the account (design document §7, and `app/shared/api/battles.ts`).
 */

/** Games in the list. Twenty is a screen of scrolling, not a history. */
const LIMIT = 20

export interface RecentBattle {
  replayId: string
  playedAt: string
  formatId: string
  seriesId: string | null
  result: BattleResult | null
  ratingDelta: number | null
  myBring: string | null
  opponentUsername: string | null
  turnCount: number | null
  /** Null until the extra columns for this row have arrived. */
  opponentBring: string | null
}

export function useRecentBattles() {
  const user = useCurrentUser()
  const storedBattles = useBattles()
  const { battles } = useStats()

  const extras = useState<Map<string, BattleDetails>>('recent-battle-extras', () => new Map())
  const loading = useState('recent-battles-loading', () => false)
  const error = useState<Error | null>('recent-battles-error', () => null)

  /**
   * The filtered games, newest first. The stats read hands them over oldest
   * first.
   *
   * The limit never cuts a series in half. The list numbers a series' games by
   * their position in it, and so does the drawer — but the drawer reads the
   * whole series from the database, so a list holding only the last two games
   * of a Bo3 would call one of them game 1 while the drawer it opens calls the
   * same replay game 2. Finishing the series costs nothing: these rows are
   * already in memory.
   */
  const newest = computed(() => {
    const ordered = battles.value.toSorted((a, b) => (a.played_at < b.played_at ? 1 : -1))
    const shown = ordered.slice(0, LIMIT)
    const last = shown.at(-1)

    if (last?.series_id == null) return shown

    // Ordered by played_at, so the rest of that series is what comes next.
    for (const row of ordered.slice(LIMIT)) {
      if (row.series_id !== last.series_id) break
      shown.push(row)
    }

    return shown
  })

  const recent = computed<RecentBattle[]>(() =>
    newest.value.map((row) => {
      const extra = extras.value.get(row.replay_id)

      return {
        replayId: row.replay_id,
        playedAt: row.played_at,
        formatId: row.format_id,
        seriesId: row.series_id,
        result: row.result,
        ratingDelta: row.rating_delta,
        myBring: row.bring_signature,
        opponentUsername: extra?.opponentUsername ?? null,
        turnCount: extra?.turnCount ?? null,
        opponentBring: extra?.opponentBring ?? null,
      }
    }),
  )

  /**
   * The extra columns for whatever is on screen and has none yet. Kept for the
   * session: the same games come back every time a filter moves.
   */
  async function hydrate(): Promise<void> {
    const asker = user.value?.id
    if (!asker) return

    /**
     * Whether this hydrate still owns the state. Somebody else signing in
     * takes it away: columns fetched for one account must not fill in the next
     * account's list, and neither must the message about why they could not
     * be fetched.
     */
    const current = () => user.value?.id === asker

    const wanted = newest.value
      .map((row) => row.replay_id)
      .filter((replayId) => !extras.value.has(replayId))

    if (!wanted.length) return

    loading.value = true
    error.value = null

    try {
      const found = await storedBattles.detailsOf(wanted)
      if (!current()) return

      const filled = new Map(extras.value)
      for (const [replayId, details] of found) filled.set(replayId, details)

      extras.value = filled
    } catch (cause) {
      if (!current()) return

      error.value = cause instanceof Error ? cause : new Error(String(cause))
    } finally {
      if (current()) loading.value = false
    }
  }

  return { recent, loading, error, hydrate }
}
