/**
 * Raw Showdown replays in: fetched, parsed, stored.
 *
 * The public API of `features/ingest`. See `features/stats/index.ts` for what
 * that means.
 */
export { useIngest } from './composables/useIngest'
export type {
  BatchItem,
  BatchOutcome,
  ImportOptions,
  ImportReport,
  IngestFailure,
  IngestOutcome,
  SyncOutcome,
} from './composables/useIngest'
export { ShowdownError, useShowdown } from './composables/useShowdown'
export type { ShowdownFailure } from './composables/useShowdown'
