import { parseTimeline } from 'replay-parser'
import type { BattleTimeline } from 'replay-parser'
import { fieldSnapshots } from '../utils/battleField'
import type { BattleRecord } from '~/shared/api/battles'

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

/**
 * What the drawer's header and timeline are drawn from.
 *
 * The name the components use for a row of `battles`; the shape belongs to
 * `app/shared/api/battles.ts`, which is what reads it.
 */
export type DrawerBattle = BattleRecord

/** Why there is no timeline to show. */
export type DrawerFailure =
  /** No such battle for this user: never imported, or somebody else's link. */
  | 'missing'
  /** The battle is there and its raw log is not readable. */
  | 'log'
  /** The battle itself could not be read. */
  | 'row'

export function useBattleDrawer() {
  const storedBattles = useBattles()
  // The address is `shared/composables/useBattleRoute.ts`'s: the recent list
  // opens battles too, and it is not the timeline's to reach into.
  const { openId, open, close } = useBattleRoute()
  const { loadLog, error: logError } = useBattleLog()

  const battle = useState<DrawerBattle | null>('drawer-battle', () => null)
  /** The games of this battle's series, oldest first. Empty when it is a Bo1. */
  const series = useState<DrawerBattle[]>('drawer-series', () => [])
  const timeline = useState<BattleTimeline | null>('drawer-timeline', () => null)
  const loading = useState('drawer-loading', () => false)
  const failure = useState<DrawerFailure | null>('drawer-failure', () => null)

  const snapshots = computed(() => (timeline.value ? fieldSnapshots(timeline.value) : []))

  /**
   * The battle currently being read. Two things need it: a second call for the
   * same battle is somebody asking twice rather than work to do, and a call for
   * a different one supersedes this one — a Bo3 reader clicking Game 1 then
   * Game 2 must not end up with game 2's header over game 1's turns.
   */
  const reading = useState<string | null>('drawer-reading', () => null)

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
      const found = await storedBattles.battleById(replayId)
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
          const games = await storedBattles.gamesOfSeries(found.seriesId)
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
