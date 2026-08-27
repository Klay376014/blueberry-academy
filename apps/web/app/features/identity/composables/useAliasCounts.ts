import { toID } from 'replay-parser'

/**
 * How many battles are filed under each bound Showdown name.
 *
 * The question the settings page is asked — "is there anything under the alt I
 * just bound?" — and the number the unbinding confirmation needs before it can
 * say what it is about to cost (#69, #70).
 *
 * `null` until a read has come back. "None yet" and "we could not read" must
 * not look alike: the first is a fact about the account and the second is a
 * fact about the network.
 */
export function useAliasCounts() {
  const storedBattles = useBattles()

  /** Counts by `toID()`, which is how identity is compared everywhere. */
  const counts = ref<Map<string, number> | null>(null)

  async function count(): Promise<void> {
    try {
      counts.value = await storedBattles.nameCounts()
    } catch {
      // Left unknown rather than shown as zero: the alias list itself is on
      // screen and usable, and a wrong number beside it is worse than none.
      counts.value = null
    }
  }

  /** Battles under one name in any spelling, or `null` if it is not known. */
  function gamesOf(alias: string): number | null {
    return counts.value?.get(toID(alias)) ?? (counts.value ? 0 : null)
  }

  return { counts, count, gamesOf }
}
