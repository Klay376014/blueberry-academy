import type { SideId } from 'replay-parser'
import type { BattleResult } from '../utils/battleStats'

/**
 * The most recent games under the filters already on screen, with the little
 * the list needs that the stats layer does not read.
 *
 * The stats read deliberately leaves `details` out — it is per-row JSON and a
 * heavy account is thousands of rows. So the list takes the ids it is about to
 * show and asks for their extra columns, which is one small request whatever
 * the size of the account (design document §7, and `useStats` on `COLUMNS`).
 */

/** Games in the list. Twenty is a screen of scrolling, not a history. */
const LIMIT = 20

const EXTRA_COLUMNS = 'replay_id, opponent_username, turn_count, my_side, details'

/** The opponent's own side of a battle, as `details` keeps it. */
interface StoredSides {
  sides?: Partial<Record<SideId, { bringSignature?: string | null }>>
}

interface Extra {
  opponentUsername: string | null
  turnCount: number | null
  opponentBring: string | null
}

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
  const { $supabase } = useNuxtApp()
  const user = useCurrentUser()
  const { battles } = useStats()

  const extras = useState<Map<string, Extra>>('recent-battle-extras', () => new Map())
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
    const userId = user.value?.id
    if (!userId) return

    const wanted = newest.value
      .map((row) => row.replay_id)
      .filter((replayId) => !extras.value.has(replayId))

    if (!wanted.length) return

    loading.value = true
    error.value = null

    try {
      const { data, error: failed } = await $supabase
        .from('battles')
        .select(EXTRA_COLUMNS)
        // Redundant under RLS, and what puts the (user_id, played_at) index to work.
        .eq('user_id', userId)
        .in('replay_id', wanted)

      if (failed) throw failed

      const filled = new Map(extras.value)

      for (const row of (data as unknown as ExtraRow[] | null) ?? []) {
        filled.set(row.replay_id, extraOf(row))
      }

      extras.value = filled
    } catch (cause) {
      error.value = cause instanceof Error ? cause : new Error(String(cause))
    } finally {
      loading.value = false
    }
  }

  return { recent, loading, error, hydrate }
}

interface ExtraRow {
  replay_id: string
  opponent_username: string | null
  turn_count: number | null
  my_side: SideId | null
  details: StoredSides | null
}

function extraOf(row: ExtraRow): Extra {
  // Which side is the opponent's is only knowable from `my_side`; a spectated
  // battle has no side of mine and therefore no opponent either.
  const theirs = row.my_side === 'p1' ? 'p2' : row.my_side === 'p2' ? 'p1' : null

  return {
    opponentUsername: row.opponent_username,
    turnCount: row.turn_count,
    opponentBring: (theirs && row.details?.sides?.[theirs]?.bringSignature) || null,
  }
}
