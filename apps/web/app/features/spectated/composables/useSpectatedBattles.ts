import { battlesMatching } from '../utils/playerSearch'
import type { BattleRecord } from '~/shared/api/battles'

/**
 * The battles nobody here played, as the home page's own section reads them.
 *
 * A read of its own rather than a slice of the dashboard's, because every rule
 * this section has is the opposite of that one's: the stats read excludes
 * spectated battles by design, the identity filter has no "me" to pick, the
 * format is somebody else's and the date range is there to bound a curve. A
 * reader narrowing the dashboard to last month is not asking for half of these
 * to disappear (#66).
 *
 * The read itself — the columns, the `user_id` scope, the paging — belongs to
 * `app/shared/api/battles.ts`, the way every other read of `battles` does.
 */

/** Rows drawn before the reader asks for more. Not a bound on what was read. */
const SCREENFUL = 20

export function useSpectatedBattles() {
  const user = useCurrentUser()
  const storedBattles = useBattles()

  /**
   * Every spectated battle, `null` until the first read. The two states mean
   * "this account watched none" and "nothing read yet", and only the first is
   * something to draw.
   */
  const rows = useState<BattleRecord[] | null>('spectated-rows', () => null)
  /** How many of them are on screen. Reset by a read, not by a filter. */
  const shown = useState<number | null>('spectated-shown', () => null)
  const loading = useState('spectated-loading', () => false)
  const error = useState<Error | null>('spectated-error', () => null)

  /**
   * The read in the air, so a second caller waits on the first rather than
   * asking again — the shape `useStats` uses for the same problem. Cleared
   * when it settles, which is what lets a failed read be retried.
   */
  const reading = useState<Promise<void> | null>('spectated-reading', () => null)

  /**
   * Which read owns the rows. A later one supersedes an earlier one, so two in
   * the air at once — two finished import batches, or a settings page whose
   * button was pressed twice — cannot settle in the wrong order and leave the
   * older answer on screen.
   */
  const reader = useState('spectated-reader', () => 0)

  /**
   * What was typed into the search box. State rather than the address, unlike
   * the open battle: a link to one battle is worth sharing and half a name is
   * not, and putting both on one URL would make "the reader opened a battle
   * from a search and pressed back" a question with no good answer (#68).
   */
  const query = useState('spectated-query', () => '')

  const loaded = computed(() => rows.value !== null)
  const battles = computed(() => rows.value ?? [])

  /**
   * The battles the search admits — all of them when nothing is typed. Over
   * every row that was read, not over the screenful being drawn: the reader is
   * looking for a battle they remember, and it is very likely an old one.
   */
  const matches = computed(() => battlesMatching(battles.value, query.value))

  const visible = computed(() => matches.value.slice(0, shown.value ?? SCREENFUL))
  const hasMore = computed(() => matches.value.length > (shown.value ?? SCREENFUL))

  /** A search that found nothing, which is not the same as having watched nothing. */
  const noMatches = computed(() => matches.value.length === 0 && battles.value.length > 0)

  /**
   * Search for a player. Back to the first screenful, because "load more" was
   * about a different list.
   */
  function search(text: string): void {
    query.value = text
    shown.value = SCREENFUL
  }

  /** One more screenful. The rows are already here; this is about DOM nodes. */
  function showMore(): void {
    shown.value = (shown.value ?? SCREENFUL) + SCREENFUL
  }

  /**
   * Reads them all, replacing whatever was read before. Reports through
   * `error` rather than throwing: the caller is a section that has somewhere
   * to put a message, and an unreachable database drawn as "none watched"
   * would be a lie the reader cannot tell from the truth.
   */
  async function read(): Promise<void> {
    const mine = reader.value + 1
    reader.value = mine
    const asker = user.value?.id

    /**
     * Whether this read still owns the state. A later read supersedes it, and
     * so does somebody else signing in: one account's battles must not land in
     * the next account's list, however long the request took.
     */
    const current = () => reader.value === mine && user.value?.id === asker

    loading.value = true
    error.value = null

    try {
      const found = await storedBattles.spectatedBattles()
      if (!current()) return

      rows.value = found
      // A re-read is a different list; scrolled-open rows of the old one are
      // not a position in it.
      shown.value = SCREENFUL
    } catch (cause) {
      if (!current()) return

      rows.value = null
      error.value = cause instanceof Error ? cause : new Error(String(cause))
    } finally {
      if (current()) loading.value = false
    }
  }

  /** A read, and the promise every other caller is given until it settles. */
  function startReading(): Promise<void> {
    const started = read().finally(() => {
      if (reading.value === started) reading.value = null
    })

    reading.value = started

    return started
  }

  /**
   * They are in, whatever it takes to get them there. Idempotent, and safe to
   * call from setup.
   *
   * Resolves immediately with nobody signed in rather than throwing: setup
   * runs before the route middleware has bounced a signed-out visitor.
   */
  function whenLoaded(): Promise<void> {
    if (!user.value) return Promise.resolve()

    return reading.value ?? (loaded.value ? Promise.resolve() : startReading())
  }

  /**
   * Read them again, because something this module cannot see has changed.
   *
   * Two things do. An import may bring in battles between two strangers, and
   * binding or unbinding a Showdown name moves battles across this line in
   * either direction — attribution is the alias list re-derived (ADR-0012).
   */
  function refresh(): Promise<void> {
    if (!user.value) return Promise.resolve()

    return startReading()
  }

  return {
    battles,
    matches,
    noMatches,
    query,
    search,
    visible,
    hasMore,
    showMore,
    loading,
    error,
    loaded,
    whenLoaded,
    refresh,
  }
}
