import { tokenizeLog } from './protocol'
import { replayLog } from './replay'
import { summarize } from './summarize'
import { buildTimeline } from './timeline'

export { PARSER_VERSION } from './version'
export type { ProtocolLine } from './protocol'
export type { SideId } from './replay'
export type { EndReason, ParsedBattle, ParsedSide, ReplayMeta } from './summarize'
export type { Appearance, BattleTimeline, Combatant, TimelineEvent, TimelineTurn } from './timeline'

import type { ParsedBattle, ReplayMeta } from './summarize'
import type { BattleTimeline } from './timeline'

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
