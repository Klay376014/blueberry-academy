// PROTOTYPE — throwaway. Fake data and a Wilson helper for the three
// variants of the team performance section (issue #17). Nothing here is
// production code: no tests, no error handling, no i18n. It exists so the
// layout question can be answered before #15 provides real data.

/** One bring: the Pokémon that actually appeared, always `bring_complete`. */
export interface BringRow {
  bring: string[]
  games: number
  wins: number
}

/** One registered team, identified by format + team signature. */
export interface TeamRow {
  /** Something to key a v-for on. */
  key: string
  format: string
  /** Bo1 or Bo3, derived from the format id in the real thing. */
  series: 'bo1' | 'bo3'
  /** The registered 6, as species ids. */
  team: string[]
  /** Every game with this team, incomplete bring records included. */
  games: number
  wins: number
  /** Only complete brings, so these games sum to less than `games`. */
  brings: BringRow[]
}

/**
 * Wilson score lower bound at 95%. The ordering key: it is what makes 3-0
 * rank below 14-20 instead of above it.
 */
export function wilsonLower(wins: number, games: number): number {
  if (games === 0) return 0
  const z = 1.96
  const p = wins / games
  const denominator = 1 + (z * z) / games
  const centre = p + (z * z) / (2 * games)
  const spread = z * Math.sqrt((p * (1 - p)) / games + (z * z) / (4 * games * games))
  return (centre - spread) / denominator
}

export function winRate(wins: number, games: number): number {
  return games === 0 ? 0 : wins / games
}

/** Games with this team whose bring was never completed. */
export function incompleteGames(team: TeamRow): number {
  return team.games - team.brings.reduce((sum, b) => sum + b.games, 0)
}

const REGMB = 'gen9championsvgc2026regmb'
const REGMB_BO3 = 'gen9championsvgc2026regmbbo3'

/**
 * Shaped to put the decisions in #17 on screen:
 *
 * - `koraidon-ladder` is 3-0. Ordered by raw win rate it is first; ordered by
 *   Wilson lower bound it sits below `miraidon-ladder` at 14-20. That contrast
 *   is the whole point of the ordering rule.
 * - every team has games missing from its bring rows, so the "these do not add
 *   up" problem is visible rather than theoretical.
 * - `zamazenta-ladder` has two games and no wins: a low-sample row that must
 *   still be visible.
 */
export const TEAMS: TeamRow[] = [
  {
    key: 'miraidon-ladder',
    format: REGMB,
    series: 'bo1',
    team: ['miraidon', 'ironhands', 'fluttermane', 'amoonguss', 'ragingbolt', 'farigiraf'],
    games: 20,
    wins: 14,
    brings: [
      { bring: ['miraidon', 'ironhands', 'amoonguss', 'farigiraf'], games: 9, wins: 7 },
      { bring: ['miraidon', 'fluttermane', 'amoonguss', 'farigiraf'], games: 5, wins: 4 },
      { bring: ['miraidon', 'ironhands', 'ragingbolt', 'farigiraf'], games: 3, wins: 1 },
    ],
  },
  {
    key: 'koraidon-ladder',
    format: REGMB,
    series: 'bo1',
    team: [
      'koraidon',
      'ogerponhearthflame',
      'rillaboom',
      'ironhands',
      'whimsicott',
      'urshifurapidstrike',
    ],
    games: 3,
    wins: 3,
    brings: [
      { bring: ['koraidon', 'ogerponhearthflame', 'rillaboom', 'whimsicott'], games: 2, wins: 2 },
    ],
  },
  {
    key: 'calyrex-ladder',
    format: REGMB,
    series: 'bo1',
    team: ['calyrexice', 'incineroar', 'amoonguss', 'ursaluna', 'rillaboom', 'chienpao'],
    games: 31,
    wins: 17,
    brings: [
      { bring: ['calyrexice', 'incineroar', 'amoonguss', 'rillaboom'], games: 12, wins: 8 },
      { bring: ['calyrexice', 'incineroar', 'ursaluna', 'chienpao'], games: 8, wins: 4 },
      { bring: ['calyrexice', 'chienpao', 'amoonguss', 'rillaboom'], games: 6, wins: 2 },
    ],
  },
  {
    key: 'zamazenta-ladder',
    format: REGMB,
    series: 'bo1',
    team: ['zamazenta', 'ironvaliant', 'landorustherian', 'grimmsnarl', 'indeedeef', 'entei'],
    games: 2,
    wins: 0,
    brings: [{ bring: ['zamazenta', 'ironvaliant', 'grimmsnarl', 'indeedeef'], games: 1, wins: 0 }],
  },
  {
    key: 'miraidon-tour',
    format: REGMB_BO3,
    series: 'bo3',
    team: ['miraidon', 'ironhands', 'fluttermane', 'amoonguss', 'ragingbolt', 'farigiraf'],
    games: 12,
    wins: 8,
    brings: [
      { bring: ['miraidon', 'ironhands', 'amoonguss', 'farigiraf'], games: 6, wins: 5 },
      { bring: ['miraidon', 'fluttermane', 'ragingbolt', 'farigiraf'], games: 4, wins: 2 },
    ],
  },
  {
    key: 'terapagos-tour',
    format: REGMB_BO3,
    series: 'bo3',
    team: ['terapagos', 'incineroar', 'rillaboom', 'archaludon', 'pelipper', 'ironcrown'],
    games: 9,
    wins: 6,
    brings: [
      { bring: ['terapagos', 'archaludon', 'pelipper', 'ironcrown'], games: 5, wins: 4 },
      { bring: ['terapagos', 'incineroar', 'rillaboom', 'ironcrown'], games: 2, wins: 1 },
    ],
  },
]
