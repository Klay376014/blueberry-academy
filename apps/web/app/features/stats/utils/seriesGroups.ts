import type { RecentBattle } from '../composables/useRecentBattles'

/** What a series card's header says, for a group that is drawn as one. */
export interface SeriesHeader {
  opponentUsername: string | null
  /** The games on screen, counted. Never a claim about who took the series. */
  wins: number
  losses: number
  formatId: string
  /** The first game of the series, which is the day the series was played. */
  playedAt: string
  /** The sum of the rating changes the group has, or null when it has none. */
  ratingDelta: number | null
}

export interface RecentGroup {
  /** The series id, or the replay id of a game that belongs to no series. */
  key: string
  /** Oldest first: game 1 is the game played first, as in the drawer. */
  games: RecentBattle[]
  /** Null for a group of one, which is drawn as a plain row (design document §3). */
  series: SeriesHeader | null
}

/**
 * The recent list as the groups it should be drawn in — a Bo3's games under one
 * header, everything else on its own.
 *
 * Grouping runs over the order it is given and never reorders it: the list is
 * sorted by `played_at`, so a series' games are already adjacent, and a filter
 * that removes one of them leaves the rest adjacent too. Anything else would
 * put the card's contents at odds with the list's own ordering.
 *
 * A game with no `series_id` is always its own group. Three ladder Bo1s against
 * one player on one day are three groups, and telling them from a Bo3 is what
 * this whole thing is for (design document §2.5).
 */
export function groupIntoSeries(recent: RecentBattle[]): RecentGroup[] {
  const groups: RecentGroup[] = []

  for (const battle of recent) {
    const last = groups.at(-1)
    const joins = battle.seriesId !== null && last?.key === battle.seriesId

    if (joins) last.games.push(battle)
    else groups.push({ key: battle.seriesId ?? battle.replayId, games: [battle], series: null })
  }

  return groups.map((group) => ({
    ...group,
    games: group.games.toSorted((a, b) => a.playedAt.localeCompare(b.playedAt)),
    series: group.games.length > 1 ? headerOf(group.games) : null,
  }))
}

function headerOf(games: RecentBattle[]): SeriesHeader {
  const rated = games.filter((game) => game.ratingDelta !== null)

  return {
    opponentUsername:
      games.find((game) => game.opponentUsername !== null)?.opponentUsername ?? null,
    wins: games.filter((game) => game.result === 'win').length,
    losses: games.filter((game) => game.result === 'loss').length,
    // Every game of a series is the same format, so the first one speaks for all.
    formatId: games[0]!.formatId,
    playedAt: games.reduce((a, b) => (a.playedAt <= b.playedAt ? a : b)).playedAt,
    // Null rather than 0: an unrated series has no number, which is not the
    // same as a series whose rating did not move.
    ratingDelta: rated.length ? rated.reduce((sum, game) => sum + game.ratingDelta!, 0) : null,
  }
}

/**
 * One bordered run of the list: a series card, or the lone games between two
 * of them.
 *
 * Lone games are kept together rather than boxed one by one — an account that
 * plays no Bo3 has one list today and should keep it.
 *
 * `key` is the replay id of the block's first game rather than the group's own
 * key: a replay id appears once in the whole list, while a series id can head
 * two blocks at once when two series were played interleaved, and two blocks
 * under one key is a duplicate `v-for` key.
 */
export type RecentBlock =
  | { kind: 'series'; key: string; group: RecentGroup & { series: SeriesHeader } }
  | { kind: 'games'; key: string; games: RecentBattle[] }

export function intoBlocks(groups: RecentGroup[]): RecentBlock[] {
  const blocks: RecentBlock[] = []

  for (const group of groups) {
    const first = group.games[0]!.replayId

    if (group.series) {
      blocks.push({ kind: 'series', key: first, group: { ...group, series: group.series } })
      continue
    }

    const last = blocks.at(-1)

    if (last?.kind === 'games') last.games.push(...group.games)
    else blocks.push({ kind: 'games', key: first, games: [...group.games] })
  }

  return blocks
}
