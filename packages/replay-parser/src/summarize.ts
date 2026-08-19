import type { BattleState, SideId, SideState } from './replay'
import { toID } from './species'

/** What the caller already knows about a replay before it is parsed. */
export interface ReplayMeta {
  /** Showdown's replay id, e.g. `gen9championsvgc2026regmb-2667169457`. */
  replayId: string
  /** Showdown's `formatid`, e.g. `gen9championsvgc2026regmb`. */
  formatId: string
  /** Upload time in seconds since the epoch, from the replay JSON. */
  uploadTime: number
}

export interface ParsedSide {
  username: string
  /** `username` normalised, which is what identity comparison uses. */
  userId: string
  /** How many Pokémon this side picked, from `|teamsize|`. */
  teamSize: number | null
  /** The registered 6, as sorted base species ids joined by `|`. */
  teamSignature: string
  /** The Pokémon that actually appeared — possibly fewer than `teamSize`. */
  bringSignature: string
  /** Whether as many Pokémon appeared as `teamSize` says were picked. */
  bringComplete: boolean
}

/**
 * A parsed battle, described from neither side's point of view. Which side is
 * "me" is resolved when the battle is written to the database, so one parse
 * can be reused by any user.
 */
export interface ParsedBattle {
  replayId: string
  formatId: string
  /** ISO-8601 instant derived from the replay's upload time. */
  playedAt: string
  gameType: string
  turnCount: number
  /** The winning side, or null for a tie. */
  winner: SideId | null
  p1: ParsedSide
  p2: ParsedSide
}

/** Turns the accumulated battle state into the parser's public result. */
export function summarize(state: BattleState, meta: ReplayMeta): ParsedBattle {
  const p1 = summarizeSide(state.sides.p1)
  const p2 = summarizeSide(state.sides.p2)

  return {
    replayId: meta.replayId,
    formatId: meta.formatId,
    playedAt: new Date(meta.uploadTime * 1000).toISOString(),
    gameType: state.gameType,
    turnCount: state.turnCount,
    winner: winnerSide(state, [p1, p2]),
    p1,
    p2,
  }
}

function summarizeSide(side: SideState): ParsedSide {
  return {
    username: side.username,
    userId: toID(side.username),
    teamSize: side.teamSize,
    teamSignature: signatureOf(side.team),
    bringSignature: signatureOf(side.appeared),
    bringComplete: side.appeared.length === side.teamSize,
  }
}

/** A signature is the base species ids, sorted, joined by `|`. */
function signatureOf(speciesIds: string[]): string {
  return [...speciesIds].sort().join('|')
}

function winnerSide(state: BattleState, sides: [ParsedSide, ParsedSide]): SideId | null {
  if (state.tie || state.winnerUsername === null) return null

  const winnerId = toID(state.winnerUsername)
  const [p1, p2] = sides
  if (winnerId !== '' && winnerId === p1.userId) return 'p1'
  if (winnerId !== '' && winnerId === p2.userId) return 'p2'
  return null
}
