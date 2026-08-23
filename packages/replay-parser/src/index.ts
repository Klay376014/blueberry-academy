import { tokenizeLog } from './protocol.ts'
import { replayLog } from './replay.ts'
import { summarize } from './summarize.ts'
import { buildTimeline } from './timeline.ts'

export { PARSER_VERSION } from './version.ts'
// Identity normalisation, exported because the app compares Showdown names
// too: an alias list is only "the same me" if both sides normalise the same
// way. See CONTEXT.md, "身分".
export { toID } from './species.ts'
export type { ProtocolLine } from './protocol.ts'
export type { SideId } from './replay.ts'
export type { EndReason, ParsedBattle, ParsedSide, ReplayMeta } from './summarize.ts'
export type {
  Appearance,
  BattleTimeline,
  Combatant,
  HealthChange,
  HitResult,
  TimelineEvent,
  TimelineTurn,
} from './timeline.ts'

import type { ParsedBattle, ReplayMeta } from './summarize.ts'
import type { BattleTimeline } from './timeline.ts'

/**
 * Parses a Showdown replay log into a perspective-neutral `ParsedBattle`.
 *
 * Pure: no I/O, no network, no framework. Everything it knows comes from `log`
 * and `meta`, which is what lets it be tested from fixtures alone.
 */
export function parseReplay(log: string, meta: ReplayMeta): ParsedBattle {
  return summarize(replayLog(tokenizeLog(log)), meta)
}

/**
 * Parses a Showdown replay log into a flat, per-turn event stream for display.
 *
 * Separate from `parseReplay` on purpose: that one runs once per battle at
 * import time, this one runs when somebody actually opens a battle. Neither
 * needs the other's work.
 */
export function parseTimeline(log: string): BattleTimeline {
  return buildTimeline(tokenizeLog(log))
}
