// The real paths rather than `#imports`: this file sits outside the Nuxt
// tsconfig that defines that alias.
import type { Attribution, BattleRow } from 'battle-row'
import type { SideId } from 'replay-parser'
import { battleDetailsOf, battleRecordOf, endOfDay, tallyNames } from '../../app/shared/api/battles'
import type {
  AttributableRow,
  Battles,
  StatsRow,
  StoredRecordRow,
} from '../../app/shared/api/battles'

/**
 * The second adapter behind `Battles`: an in-memory one, so a test about what
 * the dashboard shows is written in rows rather than in PostgREST chains.
 *
 * The first adapter — the real module over a recording chain — is asserted in
 * `test/nuxt/battles.spec.ts`, which is where the column lists, the paging and
 * the `user_id` scope are pinned down. Nothing is re-derived here: the row
 * mapping is the module's own `battleRecordOf` / `battleDetailsOf`, so the two
 * adapters cannot drift into answering differently.
 */

/** A stored row, of which the stats columns are the only required ones. */
export interface StoredBattle extends StatsRow {
  my_side?: SideId | null
  opponent_username?: string | null
  turn_count?: number | null
  end_reason?: string | null
  /**
   * Whatever `details` holds: the drawer reads `bringSignature` off a side and
   * attribution reads the rest of it, and neither is the fake's to decide.
   */
  details?:
    | ({ sides?: Partial<Record<SideId, Record<string, unknown>>> } & Record<string, unknown>)
    | null
  parse_error?: string | null
}

export interface FakeBattles extends Battles {
  /** The rows the fake answers from. Replaceable per test. */
  rows: StoredBattle[]
  /** The rows `putBattle` was given, in order. */
  written: BattleRow[]
  /** The attributions `setAttribution` was given, in order. */
  attributed: { replayId: string; attribution: Attribution }[]
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
    attributed: [],
    error: null,
    reads: [],

    battlesOf(range) {
      const { from, to } = range
      const matching = read('battlesOf', range)
        // Spectated, the way the real query's `.not('my_side', 'is', null)`
        // leaves them out.
        .filter((row) => row.my_side !== null)
        .filter((row) => (from ? row.played_at >= from : true))
        .filter((row) => (to ? row.played_at <= endOfDay(to) : true))
        .sort((a, b) => (a.played_at < b.played_at ? -1 : 1))

      return Promise.resolve(matching.map(statsRowOf))
    },

    attributableRows() {
      // Spectated rows stay in, the way the real read leaves the `my_side`
      // filter off: they are the ones a newly bound name may claim.
      return Promise.resolve(read('attributableRows', undefined).map(attributableRowOf))
    },

    nameCounts() {
      const counts = new Map<string, number>()
      // Spectated rows left out, the way the real query's `.not(…)` leaves
      // them out: a battle that is nobody's belongs under no name.
      tallyNames(
        counts,
        read('nameCounts', undefined).filter((row) => row.my_side !== null),
      )

      return Promise.resolve(counts)
    },

    spectatedBattles() {
      const watched = read('spectatedBattles', undefined)
        // The way the real query's two `.is(…)` filters leave everything else
        // out: this read is about the battles nobody here played, and a row
        // the parser could not read is not one of those.
        .filter((row) => row.my_side === null && row.parse_error == null)
        .sort((a, b) => (a.played_at < b.played_at ? 1 : -1))

      return Promise.resolve(watched.map(battleRecordOf))
    },

    battleById(replayId) {
      const found = read('battleById', replayId).find((row) => row.replay_id === replayId)

      return Promise.resolve(found ? battleRecordOf(found) : null)
    },

    gamesOfSeries(seriesId) {
      const games = read('gamesOfSeries', seriesId)
        .filter((row) => row.series_id === seriesId)
        .sort((a, b) => (a.played_at < b.played_at ? -1 : 1))

      return Promise.resolve(games.map(battleRecordOf))
    },

    detailsOf(replayIds) {
      const wanted = new Set(replayIds)
      const found = new Map(
        read('detailsOf', replayIds)
          .filter((row) => wanted.has(row.replay_id))
          .map((row) => [row.replay_id, battleDetailsOf(row)] as const),
      )

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

    setAttribution(replayId, attribution) {
      fake.attributed.push({ replayId, attribution })

      const row = fake.rows.find((stored) => stored.replay_id === replayId)
      // The real module reads the row back and throws when there is none.
      if (!row) throw new Error(`The attribution of ${replayId} came back with no row.`)

      // Written into the rows themselves, so a second run over the same fake
      // sees what the first one did — which is how "and now zero writes" is
      // asserted at all.
      Object.assign(row, attribution)

      return Promise.resolve()
    },
  }

  function read(method: string, argument: unknown): (StatsRow & StoredRecordRow)[] {
    fake.reads.push({ method, argument })
    if (fake.error) throw fake.error

    return fake.rows.map(filled)
  }

  return fake
}

/**
 * A stored row with its optional columns filled in, so the module's own
 * mapping can be handed a whole row.
 *
 * An absent `my_side` means p1 rather than spectated: the stats fixtures carry
 * only the columns the stats layer reads, and a fixture every read filters out
 * would be no fixture at all. Spectated is written as an explicit `null`, and
 * this is the one place that says so.
 */
function filled(row: StoredBattle): StatsRow & StoredRecordRow {
  return {
    ...row,
    my_side: row.my_side === undefined ? 'p1' : row.my_side,
    opponent_username: row.opponent_username ?? null,
    turn_count: row.turn_count ?? null,
    end_reason: row.end_reason ?? null,
    details: row.details ?? null,
    parse_error: row.parse_error ?? null,
  }
}

/** The columns re-attribution reads, and no others. */
function attributableRowOf(row: StatsRow & StoredRecordRow): AttributableRow {
  return {
    replay_id: row.replay_id,
    details: row.details,
    my_side: row.my_side,
    my_username: row.my_username,
    opponent_username: row.opponent_username,
    result: row.result,
    team_signature: row.team_signature,
    bring_signature: row.bring_signature,
    bring_complete: row.bring_complete,
    rating: row.rating,
    rating_delta: row.rating_delta,
  }
}

/** The stats columns alone, so a caller cannot read one the real query omits. */
function statsRowOf(row: StatsRow): StatsRow {
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
