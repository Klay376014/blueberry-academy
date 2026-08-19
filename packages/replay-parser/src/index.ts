import { tokenizeLog } from './protocol'
import { replayLog } from './replay'
import { summarize } from './summarize'

export type { ProtocolLine } from './protocol'
export type { SideId } from './replay'
export type { ParsedBattle, ParsedSide, ReplayMeta } from './summarize'

import type { ParsedBattle, ReplayMeta } from './summarize'

/**
 * Parses a Showdown replay log into a perspective-neutral `ParsedBattle`.
 *
 * Pure: no I/O, no network, no framework. Everything it knows comes from `log`
 * and `meta`, which is what lets it be tested from fixtures alone.
 */
export function parseReplay(log: string, meta: ReplayMeta): ParsedBattle {
  return summarize(replayLog(tokenizeLog(log)), meta)
}
