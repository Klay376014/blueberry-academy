/**
 * The version of this parser, written to `battles.parser_version` by whoever
 * stores a result.
 *
 * It covers the fields written to `battles`, which is what `parseReplay`
 * returns — and nothing else. `parseTimeline` is parsed on demand and stored
 * nowhere, so changing it makes no row stale and must not bump this.
 *
 * Bump it whenever a change alters what `parseReplay` returns for a log it has
 * already seen. Rows produced by an older version are rebuilt from the raw logs
 * in Storage by `scripts/reparse.ts`; Showdown is never asked again.
 */
export const PARSER_VERSION = '1'
