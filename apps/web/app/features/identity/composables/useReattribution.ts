import { attributionOf } from 'battle-row'
import type { Attribution } from 'battle-row'
import type { AttributableRow } from '~/shared/api/battles'

/**
 * Re-attributing every row this user has, against the alias list as it stands.
 *
 * `battles` is always what re-running the derivation over the current alias
 * list says it is: binding a name claims the battles it played. The derivation
 * is `battle-row`'s `attributionOf`, the same one the importer runs, so a
 * re-attributed row and a freshly imported one cannot disagree.
 *
 * Nothing here reads Storage or re-parses — both sides and the winner are
 * already in `details` — and nothing here touches the alias list. See issue
 * #67; the state is per-caller because the settings page is the one screen
 * that runs this and it runs one at a time.
 */

/**
 * Rows per batch. The write is one request per row whatever this is — no
 * PostgREST call sets a different value on each of many rows — so this is how
 * many are in the air at once, and how far apart the progress ticks are.
 */
const BATCH = 25

export interface ReattributionReport {
  /** Rows that had no attribution and have one now. */
  attributed: number
  /** Rows that were attributed before, and differently now. */
  reattributed: number
  /** Rows whose `details` nothing could be derived from; left untouched. */
  unattributable: number
  /** Rows worked through before it stopped, written or not. */
  processed: number
  total: number
}

export type ReattributionOutcome =
  | { status: 'done'; report: ReattributionReport }
  /**
   * A batch failed. What was written stays written: re-running is idempotent,
   * so an unfinished run leaves a state that is consistent, just incomplete.
   */
  | { status: 'stopped'; report: ReattributionReport; message: string }

export function useReattribution() {
  const storedBattles = useBattles()
  const stored = useShowdownAliases()

  const running = ref(false)
  /** How far the run in progress got, or `null` before the first one. */
  const progress = ref<{ processed: number; total: number } | null>(null)

  async function reattribute(): Promise<ReattributionOutcome> {
    // An empty list and a list that was never read look alike here and mean
    // opposite things: the second would hand every battle back to nobody.
    if (stored.value === null) {
      throw new Error('The alias list has not been read yet, so nothing may be attributed to it.')
    }

    const aliases = stored.value
    running.value = true

    try {
      const rows = await storedBattles.attributableRows()
      const report: ReattributionReport = {
        attributed: 0,
        reattributed: 0,
        unattributable: 0,
        processed: 0,
        total: rows.length,
      }
      progress.value = { processed: 0, total: rows.length }

      for (const batch of batched(rows)) {
        const plans = batch.map((row) => ({ row, next: attributionOf(row.details, aliases) }))
        const writes = plans.filter((plan) => plan.next && changed(plan.row, plan.next))

        try {
          await Promise.all(
            writes.map((plan) => storedBattles.setAttribution(plan.row.replay_id, plan.next!)),
          )
        } catch (error) {
          // Stopped rather than retried: a backfill fails on the network or on
          // permissions, and both give the same answer three times.
          return { status: 'stopped', report, message: messageOf(error) }
        }

        for (const plan of plans) {
          if (!plan.next) report.unattributable += 1
        }
        for (const plan of writes) {
          if (plan.row.my_side === null) report.attributed += 1
          else report.reattributed += 1
        }

        report.processed += batch.length
        progress.value = { processed: report.processed, total: report.total }
      }

      return { status: 'done', report }
    } finally {
      running.value = false
    }
  }

  return { running, progress, reattribute }
}

function* batched(rows: AttributableRow[]): Generator<AttributableRow[]> {
  for (let start = 0; start < rows.length; start += BATCH) {
    yield rows.slice(start, start + BATCH)
  }
}

/** Whether the derivation says anything different from what the row holds. */
function changed(row: AttributableRow, next: Attribution): boolean {
  return (Object.keys(next) as (keyof Attribution)[]).some((column) => row[column] !== next[column])
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
