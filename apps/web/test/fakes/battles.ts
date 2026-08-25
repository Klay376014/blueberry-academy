// The real paths rather than `#imports`: this file sits outside the Nuxt
// tsconfig that defines that alias.
import type { BattleRow } from 'battle-row'
import type { SideId } from 'replay-parser'
import type { Battles, BattleDetails, BattleRecord } from '../../app/lib/battles'
import type { StatsRow } from '../../app/utils/battleStats'

/**
 * The second adapter behind `Battles`: an in-memory one, so a test about what
 * the dashboard shows is written in rows rather than in PostgREST chains.
 *
 * The first adapter — the real module over a recording chain — is asserted in
 * `test/nuxt/battles.spec.ts`, which is where the column lists, the paging and
 * the `user_id` scope are pinned down. Nothing here re-implements PostgREST;
 * it only answers the questions the interface asks.
 */

/** A stored row, of which the stats columns are the only required ones. */
export interface StoredBattle extends StatsRow {
  /**
   * Absent means p1 rather than spectated: the stats fixtures carry only the
   * columns the stats layer reads, and a fixture the reads all filter out
   * would be no fixture at all. Spectated is written as an explicit `null`.
   */
  my_side?: SideId | null
  opponent_username?: string | null
  turn_count?: number | null
  end_reason?: string | null
  details?: { sides?: Partial<Record<SideId, { bringSignature?: string | null }>> } | null
  parse_error?: string | null
}

export interface FakeBattles extends Battles {
  /** The rows the fake answers from. Replaceable per test. */
  rows: StoredBattle[]
  /** The rows `putBattle` was given, in order. */
  written: BattleRow[]
  /** Set to make every read fail the way an unreachable database would. */
  error: Error | null
  /**
   * One entry per read, so "and no second read" and "the dates went to the
   * server" are both assertable.
   */
  reads: { method: string; argument: unknown }[]
}

export function fakeBattles(rows: StoredBattle[] = []): FakeBattles {
  const fake: FakeBattles = {
    rows: [...rows],
    written: [],
    error: null,
    reads: [],

    battlesOf(range) {
      const { from, to } = range
      const matching = read('battlesOf', range)
        .filter((row) => sideOf(row) !== null)
        .filter((row) => (from ? row.played_at >= from : true))
        .filter((row) => (to ? row.played_at <= endOfDay(to) : true))
        .sort((a, b) => (a.played_at < b.played_at ? -1 : 1))

      return Promise.resolve(matching.map(statsRowOf))
    },

    battleById(replayId) {
      const found = read('battleById', replayId).find((row) => row.replay_id === replayId)

      return Promise.resolve(found ? recordOf(found) : null)
    },

    gamesOfSeries(seriesId) {
      const games = read('gamesOfSeries', seriesId)
        .filter((row) => row.series_id === seriesId)
        .sort((a, b) => (a.played_at < b.played_at ? -1 : 1))

      return Promise.resolve(games.map(recordOf))
    },

    detailsOf(replayIds) {
      const wanted = new Set(replayIds)
      const found = new Map<string, BattleDetails>()

      for (const row of read('detailsOf', replayIds)) {
        if (wanted.has(row.replay_id)) found.set(row.replay_id, detailsOf(row))
      }

      return Promise.resolve(found)
    },

    knownReplayIds(ids) {
      const wanted = new Set(ids)
      const held = read('knownReplayIds', ids)
        .map((row) => row.replay_id)
        .filter((replayId) => wanted.has(replayId))

      return Promise.resolve(new Set(held))
    },

    putBattle(row) {
      fake.written.push(row)

      return Promise.resolve(row)
    },
  }

  function read(method: string, argument: unknown): StoredBattle[] {
    fake.reads.push({ method, argument })
    if (fake.error) throw fake.error

    return fake.rows
  }

  return fake
}

function endOfDay(bound: string): string {
  return bound.includes('T') ? bound : `${bound}T23:59:59.999Z`
}

function sideOf(row: StoredBattle): SideId | null {
  return row.my_side === undefined ? 'p1' : row.my_side
}

function opponentBringOf(row: StoredBattle): string | null {
  const mine = sideOf(row)
  const theirs = mine === 'p1' ? 'p2' : mine === 'p2' ? 'p1' : null

  return (theirs && row.details?.sides?.[theirs]?.bringSignature) || null
}

/** The stats columns alone, so a caller cannot read one the real query omits. */
function statsRowOf(row: StoredBattle): StatsRow {
  return {
    replay_id: row.replay_id,
    played_at: row.played_at,
    format_id: row.format_id,
    series_id: row.series_id,
    my_username: row.my_username,
    result: row.result,
    rating: row.rating,
    rating_delta: row.rating_delta,
    team_signature: row.team_signature,
    bring_signature: row.bring_signature,
    bring_complete: row.bring_complete,
  }
}

function detailsOf(row: StoredBattle): BattleDetails {
  return {
    opponentUsername: row.opponent_username ?? null,
    turnCount: row.turn_count ?? null,
    opponentBring: opponentBringOf(row),
  }
}

function recordOf(row: StoredBattle): BattleRecord {
  return {
    replayId: row.replay_id,
    playedAt: row.played_at,
    formatId: row.format_id,
    seriesId: row.series_id,
    result: row.result,
    rating: row.rating,
    ratingDelta: row.rating_delta,
    endReason: row.end_reason ?? null,
    mySide: sideOf(row),
    myUsername: row.my_username,
    opponentUsername: row.opponent_username ?? null,
    turnCount: row.turn_count ?? null,
    myBring: row.bring_signature,
    opponentBring: opponentBringOf(row),
    parseError: row.parse_error ?? null,
  }
}
