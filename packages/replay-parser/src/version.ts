/**
 * The version of this parser, written to `battles.parser_version`.
 *
 * Bump it whenever a change alters what `parseReplay` returns for a log it has
 * already seen; older rows are then rebuilt by `scripts/reparse.ts` from the
 * raw logs in Storage. It covers `parseReplay` and nothing else —
 * `parseTimeline` is parsed on demand and stored nowhere, so changing it makes
 * no row stale.
 */
export const PARSER_VERSION = '1'
