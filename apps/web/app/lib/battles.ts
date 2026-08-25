import type { SupabaseClient } from '@supabase/supabase-js'
import type { BattleRow } from 'battle-row'
import type { SideId } from 'replay-parser'
import type { BattleResult, StatsRow } from '../utils/battleStats'

/**
 * Everything the app knows about reading and writing the `battles` table, as
 * one interface bound to one user.
 *
 * Nothing outside this file assembles a `battles` query. The column lists, the
 * `user_id` scope, the paging, the row shapes and the opponent-side derivation
 * live here once, so a caller cannot get any of them subtly wrong — see the
 * design in issue #52.
 *
 * `scripts/reparse.ts` deliberately does not use this: it reads across users,
 * by id, with `select('*')`, and widening the interface to cover both would
 * put back the shallowness this removes.
 *
 * Two row shapes on one interface, on purpose. `battlesOf` answers in the
 * database's own snake_case (`StatsRow`) because the stats layer and its
 * fixtures are written in those names; everything else answers in camelCase.
 * Renaming the stats path would turn this into a rewrite of `battleStats.ts`
 * and every fixture under it.
 *
 * Failures throw. `null` and an absent map entry mean "the read worked and
 * there is no such row" — what to show for a failure is each page's decision,
 * and the drawer, the importer and the dashboard all answer it differently.
 */

/** The columns the stats layer slices on — `details` deliberately not among them. */
const STATS_COLUMNS: string =
  'replay_id, played_at, format_id, series_id, my_username, result, rating, rating_delta, team_signature, bring_signature, bring_complete'

/** Everything the drawer's header and timeline are drawn from. */
const RECORD_COLUMNS: string =
  'replay_id, played_at, format_id, series_id, result, rating, rating_delta, end_reason, my_side, my_username, opponent_username, turn_count, bring_signature, details, parse_error'

/** The little the recent list needs that the stats read leaves out. */
const DETAIL_COLUMNS: string = 'replay_id, opponent_username, turn_count, my_side, details'

/**
 * Rows per request. PostgREST caps a response at its own default of 1000, so
 * without paging a heavy account arrives silently truncated — and a win rate
 * over the first thousand games, presented as the whole of it, is worse than
 * an error.
 */
const PAGE = 1000

/**
 * Replay ids per `in (…)` lookup. PostgREST puts the list in the query string,
 * and a heavy account is thousands of ids.
 */
const LOOKUP_CHUNK = 200

/** Inclusive ISO 8601 bounds. A date with no time covers that whole day. */
export interface DateRange {
  from: string | null
  to: string | null
}

/** One row of `battles`, read out. */
export interface BattleRecord {
  replayId: string
  playedAt: string
  formatId: string
  seriesId: string | null
  result: BattleResult | null
  /** My rating once the game was over, or null for a game off the ladder. */
  rating: number | null
  ratingDelta: number | null
  /** What the log said beyond who won, e.g. a forfeit. */
  endReason: string | null
  mySide: SideId | null
  myUsername: string | null
  opponentUsername: string | null
  turnCount: number | null
  myBring: string | null
  opponentBring: string | null
  /** Why the import could not read this log, when it could not. */
  parseError: string | null
}

/** The per-row `details` a list wants once it knows which rows it is showing. */
export interface BattleDetails {
  opponentUsername: string | null
  turnCount: number | null
  opponentBring: string | null
}

export interface Battles {
  /**
   * Every battle in the range, oldest first and spectated ones excluded, in as
   * many requests as it takes.
   */
  battlesOf(range: DateRange): Promise<StatsRow[]>

  /** One battle, or `null` if this user has no such row. */
  battleById(replayId: string): Promise<BattleRecord | null>

  /** The games of one series, oldest first. */
  gamesOfSeries(seriesId: string): Promise<BattleRecord[]>

  /** The extra columns for these battles, by replay id. Missing ids are absent. */
  detailsOf(replayIds: string[]): Promise<Map<string, BattleDetails>>

  /** Which of these replays this user already has. */
  knownReplayIds(ids: string[]): Promise<Set<string>>

  /** Writes one battle and answers with the row as the database kept it. */
  putBattle(row: BattleRow): Promise<BattleRow>
}

export function createBattles(client: SupabaseClient, userId: string): Battles {
  /**
   * Every read starts here, so `.eq('user_id', …)` cannot be left off. It is
   * redundant under RLS and is what puts the (user_id, played_at) index to
   * work.
   */
  function scoped(columns: string) {
    return client.from('battles').select(columns).eq('user_id', userId)
  }

  async function recordsWhere(column: 'replay_id' | 'series_id', value: string) {
    const { data, error } = await scoped(RECORD_COLUMNS)
      .eq(column, value)
      .order('played_at', { ascending: true })

    if (error) throw error

    return ((data as unknown as StoredRecordRow[] | null) ?? []).map(recordOf)
  }

  return {
    async battlesOf(range) {
      const collected: StatsRow[] = []

      for (let start = 0; ; start += PAGE) {
        let query = scoped(STATS_COLUMNS)
          // Spectated. Not a filter the caller can turn off.
          .not('my_side', 'is', null)

        if (range.from) query = query.gte('played_at', range.from)
        if (range.to) query = query.lte('played_at', endOfDay(range.to))

        const { data, error } = await query
          // Oldest first, so a curve can be drawn straight off the rows.
          .order('played_at', { ascending: true })
          .range(start, start + PAGE - 1)

        if (error) throw error

        const page = (data as unknown as StatsRow[] | null) ?? []
        collected.push(...page)

        if (page.length < PAGE) break
      }

      return collected
    },

    async battleById(replayId) {
      const [found] = await recordsWhere('replay_id', replayId)

      return found ?? null
    },

    async gamesOfSeries(seriesId) {
      return await recordsWhere('series_id', seriesId)
    },

    async detailsOf(replayIds) {
      const found = new Map<string, BattleDetails>()

      // Chunked here rather than trusted to the caller: a list that happens to
      // be short today is not a bound.
      for (const chunk of chunked(replayIds)) {
        const { data, error } = await scoped(DETAIL_COLUMNS).in('replay_id', chunk)

        if (error) throw error

        for (const row of (data as unknown as StoredDetailRow[] | null) ?? []) {
          found.set(row.replay_id, detailsOf(row))
        }
      }

      return found
    },

    async knownReplayIds(ids) {
      const known = new Set<string>()

      for (const chunk of chunked(ids)) {
        const { data, error } = await scoped('replay_id').in('replay_id', chunk)

        if (error) throw error

        for (const row of (data as unknown as { replay_id: string }[] | null) ?? []) {
          known.add(row.replay_id)
        }
      }

      return known
    },

    async putBattle(row) {
      const { data, error } = await client
        .from('battles')
        .upsert(row, { onConflict: 'user_id,replay_id' })
        .select()
        // Asked for back, so a write that RLS quietly matched nothing cannot
        // pass for an import.
        .single()

      if (error) throw error

      return (data as BattleRow | null) ?? row
    },
  }
}

/** A date with no time in it covers the whole of that day. */
function endOfDay(bound: string): string {
  return bound.includes('T') ? bound : `${bound}T23:59:59.999Z`
}

function* chunked(ids: string[]): Generator<string[]> {
  for (let start = 0; start < ids.length; start += LOOKUP_CHUNK) {
    yield ids.slice(start, start + LOOKUP_CHUNK)
  }
}

/** The opponent's own side of a battle, as `details` keeps it. */
interface StoredSides {
  sides?: Partial<Record<SideId, { bringSignature?: string | null }>>
}

interface StoredDetailRow {
  replay_id: string
  opponent_username: string | null
  turn_count: number | null
  my_side: SideId | null
  details: StoredSides | null
}

interface StoredRecordRow extends StoredDetailRow {
  played_at: string
  format_id: string
  series_id: string | null
  result: BattleResult | null
  rating: number | null
  rating_delta: number | null
  end_reason: string | null
  my_username: string | null
  bring_signature: string | null
  parse_error: string | null
}

/**
 * Which side is the opponent's is only knowable from `my_side`; a spectated
 * battle has no side of mine and therefore no opponent either.
 */
function opponentBringOf(row: StoredDetailRow): string | null {
  const theirs = row.my_side === 'p1' ? 'p2' : row.my_side === 'p2' ? 'p1' : null

  return (theirs && row.details?.sides?.[theirs]?.bringSignature) || null
}

function detailsOf(row: StoredDetailRow): BattleDetails {
  return {
    opponentUsername: row.opponent_username,
    turnCount: row.turn_count,
    opponentBring: opponentBringOf(row),
  }
}

function recordOf(row: StoredRecordRow): BattleRecord {
  return {
    replayId: row.replay_id,
    playedAt: row.played_at,
    formatId: row.format_id,
    seriesId: row.series_id,
    result: row.result,
    rating: row.rating,
    ratingDelta: row.rating_delta,
    endReason: row.end_reason,
    mySide: row.my_side,
    myUsername: row.my_username,
    opponentUsername: row.opponent_username,
    turnCount: row.turn_count,
    myBring: row.bring_signature,
    opponentBring: opponentBringOf(row),
    parseError: row.parse_error,
  }
}
