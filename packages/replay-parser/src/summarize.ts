import type { BattleState, RatingUpdate, SideId, SideState } from './replay'
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
  /**
   * This side's rating going into the game, from its own `|player|` line, or
   * null when the game carried no rating.
   */
  ratingBefore: number | null
  /**
   * This side's rating once the game was over, from its own `|raw|` line. It
   * is null independently of `ratingBefore`: a Bo3 game may be laddered into
   * with a rating and still report no new one afterwards.
   */
  ratingAfter: number | null
  /** The change Showdown reported for it, rather than one derived from it. */
  ratingDelta: number | null
  /** How many Pokémon this side picked, from `|teamsize|`. */
  teamSize: number | null
  /** The registered 6, as sorted base species ids joined by `|`. */
  teamSignature: string
  /** The Pokémon that actually appeared — possibly fewer than `teamSize`. */
  bringSignature: string
  /** Whether as many Pokémon appeared as `teamSize` says were picked. */
  bringComplete: boolean
}

/** Why a battle ended, when the log says something beyond who won. */
export type EndReason = 'forfeit'

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
  /** The winning side, `tie` for a draw, or null when the log declared neither. */
  winner: SideId | 'tie' | null
  /** Why the battle ended, or null when it was simply played out. */
  endReason: EndReason | null
  /**
   * The parent battle of the Bo3 series this game belongs to, or null for a
   * game that stands alone. Games are always stored one row each; a series
   * result is derived from the games that share this id.
   */
  seriesId: string | null
  p1: ParsedSide
  p2: ParsedSide
}

/** Turns the accumulated battle state into the parser's public result. */
export function summarize(state: BattleState, meta: ReplayMeta): ParsedBattle {
  const p1 = summarizeSide(state.sides.p1, state.ratingUpdates)
  const p2 = summarizeSide(state.sides.p2, state.ratingUpdates)

  return {
    replayId: meta.replayId,
    formatId: meta.formatId,
    playedAt: new Date(meta.uploadTime * 1000).toISOString(),
    gameType: state.gameType,
    turnCount: state.turnCount,
    winner: state.tie ? 'tie' : sideOfUsername(state.winnerUsername, p1, p2),
    endReason: state.forfeited ? 'forfeit' : null,
    seriesId: state.seriesId,
    p1,
    p2,
  }
}

function summarizeSide(side: SideState, ratingUpdates: Map<string, RatingUpdate>): ParsedSide {
  const userId = toID(side.username)
  // Each side's own rating comes from its own lines. The replay metadata also
  // carries a `rating`, but it is the loser's post-battle value whichever side
  // that is, so it belongs to neither side and is never read here.
  const update = ratingUpdates.get(userId) ?? null

  return {
    username: side.username,
    userId,
    ratingBefore: side.ratingBefore,
    ratingAfter: update?.after ?? null,
    ratingDelta: update?.delta ?? null,
    teamSize: side.teamSize,
    teamSignature: signatureOf(side.team),
    bringSignature: signatureOf(side.bring),
    // teamSize is null when the log carried no |teamsize|; the bring cannot be
    // known complete then, only observed.
    bringComplete: side.teamSize !== null && side.bring.length === side.teamSize,
  }
}

/** A signature is the base species ids, sorted, joined by `|`. */
function signatureOf(speciesIds: string[]): string {
  return [...speciesIds].sort().join('|')
}

/** The side a Showdown name belongs to, compared as normalised user ids. */
function sideOfUsername(username: string | null, p1: ParsedSide, p2: ParsedSide): SideId | null {
  if (username === null) return null

  const userId = toID(username)
  if (userId === '') return null
  if (userId === p1.userId) return 'p1'
  if (userId === p2.userId) return 'p2'
  return null
}
