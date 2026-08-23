import { parseTimeline } from 'replay-parser'
import type { BattleTimeline, SideId } from 'replay-parser'
import { fieldSnapshots } from '../utils/battleField'
import type { BattleResult } from '../utils/battleStats'

/**
 * Which battle the drawer is showing, and everything it shows about it.
 *
 * The open battle is `?battle=<replayId>` in the address and nowhere else, so
 * the link is shareable and the back button closes the drawer — the two things
 * a route of its own would have given, for the price of one query parameter
 * (design document §4, decision T1).
 *
 * The battle is read by id rather than taken from the list: a link that arrives
 * from somebody else's chat is for a game the current filters may exclude.
 */

const COLUMNS =
  'replay_id, played_at, format_id, series_id, result, rating, rating_delta, end_reason, my_side, my_username, opponent_username, turn_count, bring_signature, details, parse_error'

/** What the drawer's header and timeline are drawn from. */
export interface DrawerBattle {
  replayId: string
  playedAt: string
  formatId: string
  seriesId: string | null
  result: BattleResult | null
  /** My rating once the game was over, or null for a game off the ladder. */
  rating: number | null
  ratingDelta: number | null
  /** What the log said beyond who won, e.g. a forfeit. */
  endReason: string | null
  mySide: SideId | null
  myUsername: string | null
  opponentUsername: string | null
  turnCount: number | null
  myBring: string | null
  opponentBring: string | null
  /** Why the import could not read this log, when it could not. */
  parseError: string | null
}

/** Why there is no timeline to show. */
export type DrawerFailure =
  /** No such battle for this user: never imported, or somebody else's link. */
  | 'missing'
  /** The battle is there and its raw log is not readable. */
  | 'log'
  /** The battle itself could not be read. */
  | 'row'

export function useBattleDrawer() {
  const { $supabase } = useNuxtApp()
  const user = useCurrentUser()
  const route = useRoute()
  const router = useRouter()
  const { loadLog, error: logError } = useBattleLog()

  const battle = useState<DrawerBattle | null>('drawer-battle', () => null)
  /** The games of this battle's series, oldest first. Empty when it is a Bo1. */
  const series = useState<DrawerBattle[]>('drawer-series', () => [])
  const timeline = useState<BattleTimeline | null>('drawer-timeline', () => null)
  const loading = useState('drawer-loading', () => false)
  const failure = useState<DrawerFailure | null>('drawer-failure', () => null)

  /** The battle the address says is open, if it says one is. */
  const openId = computed(() => {
    const asked = route.query.battle

    return typeof asked === 'string' && asked ? asked : null
  })

  const snapshots = computed(() => (timeline.value ? fieldSnapshots(timeline.value) : []))

  function open(replayId: string): void {
    void router.push({ query: { ...route.query, battle: replayId } })
  }

  function close(): void {
    const { battle: _open, ...rest } = route.query

    void router.push({ query: rest })
  }

  /**
   * The battle currently being read. Two things need it: a second call for the
   * same battle is somebody asking twice rather than work to do, and a call for
   * a different one supersedes this one — a Bo3 reader clicking Game 1 then
   * Game 2 must not end up with game 2's header over game 1's turns.
   */
  const reading = useState<string | null>('drawer-reading', () => null)

  async function rowsOf(column: 'replay_id' | 'series_id', value: string) {
    const userId = user.value?.id
    if (!userId) throw new Error('No signed-in user to read a battle for.')

    const { data, error } = await $supabase
      .from('battles')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq(column, value)
      .order('played_at', { ascending: true })

    if (error) throw error

    return ((data as unknown as StoredRow[] | null) ?? []).map(drawerBattleOf)
  }

  /**
   * The battle, its series siblings and its timeline. Nothing throws: every
   * way this can fail is a state the drawer draws (design document §4).
   */
  async function load(replayId: string): Promise<void> {
    if (reading.value === replayId) return

    reading.value = replayId
    loading.value = true
    failure.value = null
    timeline.value = null
    series.value = []

    /** Whether this call still owns the state, or a later one has taken over. */
    const current = () => reading.value === replayId

    try {
      const [found] = await rowsOf('replay_id', replayId)
      if (!current()) return

      if (!found) {
        battle.value = null
        failure.value = 'missing'
        return
      }

      battle.value = found

      // A Bo3 drawer can move between the games of its own series, so they are
      // read alongside it rather than when the reader reaches for them. Its own
      // attempt: the switcher is a convenience, and losing it is no reason to
      // withhold a timeline that reads perfectly well.
      if (found.seriesId) {
        try {
          const games = await rowsOf('series_id', found.seriesId)
          if (!current()) return

          series.value = games
        } catch {
          series.value = []
        }
      }

      const log = await loadLog(replayId)
      if (!current()) return

      if (log === null) {
        failure.value = 'log'
        return
      }

      timeline.value = parseTimeline(log)
    } catch {
      if (!current()) return

      battle.value = null
      failure.value = 'row'
    } finally {
      // Left to whichever call owns the state, so a superseded one does not
      // report the newer one as finished.
      if (current()) {
        reading.value = null
        loading.value = false
      }
    }
  }

  /**
   * Everything the drawer shows about whatever the address says is open.
   *
   * Deliberately not a watcher in here: this is called by the list as well as
   * by the drawer, and a watcher per call would read the battle, its series and
   * its log once per caller. `BattleDrawer.vue` owns the one watcher.
   */
  function follow(replayId: string | null): void {
    if (replayId === null) {
      reading.value = null
      battle.value = null
      timeline.value = null
      series.value = []
      failure.value = null
      return
    }

    if (battle.value?.replayId !== replayId) void load(replayId)
  }

  return {
    follow,
    load,
    openId,
    battle,
    series,
    timeline,
    snapshots,
    loading,
    failure,
    /** Why the log could not be read, for the message under the failure. */
    logError,
    open,
    close,
  }
}

interface StoredRow {
  replay_id: string
  played_at: string
  format_id: string
  series_id: string | null
  result: BattleResult | null
  rating: number | null
  rating_delta: number | null
  end_reason: string | null
  my_side: SideId | null
  my_username: string | null
  opponent_username: string | null
  turn_count: number | null
  bring_signature: string | null
  details: { sides?: Partial<Record<SideId, { bringSignature?: string | null }>> } | null
  parse_error: string | null
}

function drawerBattleOf(row: StoredRow): DrawerBattle {
  const theirs = row.my_side === 'p1' ? 'p2' : row.my_side === 'p2' ? 'p1' : null

  return {
    replayId: row.replay_id,
    playedAt: row.played_at,
    formatId: row.format_id,
    seriesId: row.series_id,
    result: row.result,
    rating: row.rating,
    ratingDelta: row.rating_delta,
    endReason: row.end_reason,
    mySide: row.my_side,
    myUsername: row.my_username,
    opponentUsername: row.opponent_username,
    turnCount: row.turn_count,
    myBring: row.bring_signature,
    opponentBring: (theirs && row.details?.sides?.[theirs]?.bringSignature) || null,
    parseError: row.parse_error,
  }
}
