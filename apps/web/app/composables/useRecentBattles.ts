import type { BattleDetails } from '../lib/battles'
import type { BattleResult } from '../utils/battleStats'

/**
 * The most recent games under the filters already on screen, with the little
 * the list needs that the stats layer does not read.
 *
 * The stats read deliberately leaves `details` out — it is per-row JSON and a
 * heavy account is thousands of rows. So the list takes the ids it is about to
 * show and asks for their extra columns, which is one small request whatever
 * the size of the account (design document §7, and `app/lib/battles.ts`).
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

  /** The filtered games, newest first. The stats read hands them over oldest first. */
  const newest = computed(() =>
    battles.value.toSorted((a, b) => (a.played_at < b.played_at ? 1 : -1)).slice(0, LIMIT),
  )

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

    const wanted = newest.value
      .map((row) => row.replay_id)
      .filter((replayId) => !extras.value.has(replayId))

    if (!wanted.length) return

    loading.value = true
    error.value = null

    try {
      const found = await storedBattles.detailsOf(wanted)
      // Somebody else signed in while this was in the air, and the plugin has
      // already emptied the map these would go back into.
      if (user.value?.id !== asker) return

      const filled = new Map(extras.value)
      for (const [replayId, details] of found) filled.set(replayId, details)

      extras.value = filled
    } catch (cause) {
      error.value = cause instanceof Error ? cause : new Error(String(cause))
    } finally {
      loading.value = false
    }
  }

  return { recent, loading, error, hydrate }
}
