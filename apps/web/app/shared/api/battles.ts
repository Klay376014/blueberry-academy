import type { SupabaseClient } from '@supabase/supabase-js'
import type { Attribution, BattleRow } from 'battle-row'
import { toID } from 'replay-parser'
import type { SideId } from 'replay-parser'

/**
 * Everything the app knows about reading and writing the `battles` table, as
 * one interface bound to one user.
 *
 * Nothing outside this file assembles a `battles` query. The column lists, the
 * `user_id` scope, the paging, the row shapes and the opponent-side derivation
 * live here once, so a caller cannot get any of them subtly wrong. The readers
 * above it are docs/specs/2026-08-16-replay-analytics-design.md §7 (the
 * dashboard) and docs/specs/2026-08-20-battle-timeline-design.md §4 (the
 * drawer); the move itself is issue #52.
 *
 * It sits in `shared/lib/` rather than `shared/utils/` because everything in
 * `utils/` is a pure function and this is the app's one piece of I/O over
 * `battles` — and in `shared/` rather than in a feature because the dashboard,
 * the timeline and the importer all read the same table (issue #61).
 *
 * The interface exists for a second reason as well as the first: it is the
 * seam the tests need. The in-memory adapter behind it is
 * `test/fakes/battles.ts`, which is why the row mapping below is exported.
 *
 * `scripts/reparse.ts` deliberately does not use this: it reads across users,
 * by id, with `select('*')`, and widening the interface to cover both would
 * put back the shallowness this removes.
 *
 * Two row shapes on one interface, on purpose. `battlesOf` answers in the
 * database's own snake_case (`StatsRow`) because the stats layer and its
 * fixtures are written in those names; everything else answers in camelCase.
 * Renaming the stats path would turn this into a rewrite of `battleStats.ts`
 * and every fixture under it. `attributableRows` is snake_case for a third
 * reason: its columns *are* `battle-row`'s `Attribution`, which is written in
 * the database's names because that is what it is for (#67), and renaming
 * them here and back again would be a mapping that could drift.
 *
 * Failures throw. `null` and an absent map entry mean "the read worked and
 * there is no such row" — what to show for a failure is each page's decision,
 * and the drawer, the importer and the dashboard all answer it differently.
 */

export type BattleResult = 'win' | 'loss' | 'tie'

/** A `battles` row as the stats layer reads it, in the database's own names. */
export interface StatsRow {
  replay_id: string
  played_at: string
  format_id: string
  series_id: string | null
  my_username: string | null
  result: BattleResult | null
  rating: number | null
  rating_delta: number | null
  team_signature: string | null
  bring_signature: string | null
  bring_complete: boolean
}

/**
 * The column lists, each typed as `string` rather than left as the literal it
 * is: postgrest-js parses a literal column list at the type level, and over a
 * list this long tsc gives up with "type instantiation is excessively deep".
 * The shapes are asserted below instead.
 */

/** The columns the stats layer slices on — `details` deliberately not among them. */
const STATS_COLUMNS: string =
  'replay_id, played_at, format_id, series_id, my_username, result, rating, rating_delta, team_signature, bring_signature, bring_complete'

/** Everything the drawer's header and timeline are drawn from. */
const RECORD_COLUMNS: string =
  'replay_id, played_at, format_id, series_id, result, rating, rating_delta, end_reason, my_side, my_username, opponent_username, turn_count, bring_signature, details, parse_error'

/**
 * What re-attribution works from: `details`, which is all the derivation
 * reads, and the current answers, so only a row whose answer changed is
 * written back (#67).
 */
const ATTRIBUTION_COLUMNS: string =
  'replay_id, details, my_side, my_username, opponent_username, result, team_signature, bring_signature, bring_complete, rating, rating_delta'

/** The little the recent list needs that the stats read leaves out. */
const DETAIL_COLUMNS: string = 'replay_id, opponent_username, turn_count, my_side, details'

/** Rows per request: PostgREST's own default cap. */
const PAGE = 1000

/** One page of a paged read, as PostgREST answers it. */
interface PageOf<T> {
  data: T[] | null
  error: unknown
}

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
  /**
   * Both sides as the parse left them, with no "me" in it.
   *
   * The attribution fields above are a function of the alias list and are all
   * null for a spectated battle (CONTEXT.md, Spectated); these are not, so a
   * battle nobody here played can still be read as p1 against p2 (#63).
   */
  sides: Record<SideId, BattleSide>
  /** Which side won, `tie`, or null when the log declared neither. */
  winner: SideId | 'tie' | null
  /** Why the import could not read this log, when it could not. */
  parseError: string | null
}

/** One side of a battle, named as the log names it rather than as mine or theirs. */
export interface BattleSide {
  username: string | null
  /** The Pokémon that appeared, as a bring signature. */
  bring: string | null
  /**
   * The registered six, as a team signature. Null on a row written before both
   * sides were kept, which is why every reader of it has a fallback.
   */
  team: string | null
}

/** One row as re-attribution reads it: its id, its `details`, its answers so far. */
export interface AttributableRow extends Attribution {
  replay_id: string
  /** jsonb, so nothing is known about it here. `attributionOf` checks it. */
  details: unknown
}

/** The per-row `details` a list wants once it knows which rows it is showing. */
export interface BattleDetails {
  opponentUsername: string | null
  turnCount: number | null
  opponentBring: string | null
  /** The opponent's registered six, for the two of them that stayed home. */
  opponentTeam: string | null
}

export interface Battles {
  /**
   * Every battle in the range, oldest first and spectated ones excluded, in as
   * many requests as it takes.
   */
  battlesOf(range: DateRange): Promise<StatsRow[]>

  /**
   * Every row of this user's, spectated ones included, with what attribution
   * is derived from and the answers it has now.
   *
   * The only read that leaves spectated battles in: they are precisely the
   * rows a newly bound name may claim (#67).
   */
  attributableRows(): Promise<AttributableRow[]>

  /**
   * How many battles are attributed to each Showdown name, keyed by the
   * name's `toID()` form.
   *
   * Counted here rather than asked of the database: identity comparison is
   * `toID()` throughout (CONTEXT.md, 身分) and PostgREST has no such
   * normalisation, so `Blue Berry` and `blueberry` would come back as two
   * names.
   */
  nameCounts(): Promise<Map<string, number>>

  /**
   * Every spectated battle, newest first, in as many requests as it takes.
   *
   * The mirror image of `battlesOf`: that read excludes them because a battle
   * nobody here played is nobody's statistic, and this one is about nothing
   * else. It takes no range, because the filters the dashboard carries are all
   * meaningless here — there is no "me" to pick an identity for, the format is
   * somebody else's, and the dates are there to bound a curve (#66).
   */
  spectatedBattles(): Promise<BattleRecord[]>

  /** One battle, or `null` if this user has no such row. */
  battleById(replayId: string): Promise<BattleRecord | null>

  /** The games of one series, oldest first. */
  gamesOfSeries(seriesId: string): Promise<BattleRecord[]>

  /** The extra columns for these battles, by replay id. Missing ids are absent. */
  detailsOf(replayIds: string[]): Promise<Map<string, BattleDetails>>

  /**
   * Which of these replays this user already has.
   *
   * Throws rather than answering "none of them": treating an unreachable
   * database as an empty one would re-fetch an entire account.
   */
  knownReplayIds(ids: string[]): Promise<Set<string>>

  /** Writes one battle and answers with the row as the database kept it. */
  putBattle(row: BattleRow): Promise<BattleRow>

  /**
   * Writes the attribution of one row, and nothing else about it.
   *
   * Narrow because it has to be: `regulation` is a generated column, so a
   * whole-row upsert of a row read back out is refused by the database. The
   * column list is this module's, as every other one is (#67).
   */
  setAttribution(replayId: string, attribution: Attribution): Promise<void>
}

/**
 * @param currentUserId Whose battles these are. A function rather than a value
 * because the shell around this is reached in setup, which runs before the
 * route middleware has bounced a signed-out visitor, and because signing in as
 * somebody else happens without a page reload. It throws when nobody is signed
 * in, which is the one thing a caller cannot supply.
 */
export function createBattles(client: SupabaseClient, currentUserId: () => string): Battles {
  /**
   * Every read starts here, so `.eq('user_id', …)` cannot be left off. It is
   * redundant under RLS and is what puts the (user_id, played_at) index to
   * work.
   */
  function scoped(columns: string) {
    return client.from('battles').select(columns).eq('user_id', currentUserId())
  }

  async function recordsWhere(column: 'replay_id' | 'series_id', value: string) {
    const { data, error } = await scoped(RECORD_COLUMNS)
      .eq(column, value)
      .order('played_at', { ascending: true })

    if (error) throw error

    return ((data as unknown as StoredRecordRow[] | null) ?? []).map(battleRecordOf)
  }

  /**
   * Every row a query matches, in as many requests as it takes.
   *
   * PostgREST caps a response at its own default of 1000, so a read without
   * this arrives silently truncated — and a win rate over the first thousand
   * games of an account, presented as the whole of it, is worse than an error.
   *
   * The caller's query must carry an `order`: `range` over an unordered
   * result is not stable between requests, so pages can overlap or skip.
   */
  async function pages<T>(request: (from: number, to: number) => PromiseLike<PageOf<T>>) {
    const collected: T[] = []

    for (let start = 0; ; start += PAGE) {
      const { data, error } = await request(start, start + PAGE - 1)

      if (error) throw error

      const page = data ?? []
      collected.push(...page)

      if (page.length < PAGE) break
    }

    return collected
  }

  return {
    async battlesOf(range) {
      return await pages<StatsRow>((from, to) => {
        let query = scoped(STATS_COLUMNS)
          // Spectated. Not a filter the caller can turn off.
          .not('my_side', 'is', null)

        if (range.from) query = query.gte('played_at', range.from)
        if (range.to) query = query.lte('played_at', endOfDay(range.to))

        return (
          query
            // Oldest first, so a curve can be drawn straight off the rows.
            .order('played_at', { ascending: true })
            .range(from, to) as unknown as PromiseLike<PageOf<StatsRow>>
        )
      })
    },

    async attributableRows() {
      return await pages<AttributableRow>(
        (from, to) =>
          scoped(ATTRIBUTION_COLUMNS)
            // By id rather than by date: the order is nobody's to read
            // anything into, but a stable one keeps the pages apart.
            .order('replay_id', { ascending: true })
            .range(from, to) as unknown as PromiseLike<PageOf<AttributableRow>>,
      )
    },

    async nameCounts() {
      const counts = new Map<string, number>()

      tallyNames(
        counts,
        await pages<NamedRow>(
          (from, to) =>
            scoped('my_username')
              // A spectated battle is nobody's, so it belongs under no name.
              .not('my_side', 'is', null)
              .order('replay_id', { ascending: true })
              .range(from, to) as unknown as PromiseLike<PageOf<NamedRow>>,
        ),
      )

      return counts
    },

    async spectatedBattles() {
      const rows = await pages<StoredRecordRow>(
        (from, to) =>
          scoped(RECORD_COLUMNS)
            // `is`, not `eq`: null is not a value PostgREST compares with.
            .is('my_side', null)
            // A row the parser could not read has no side of mine either, and
            // it is not a battle between two strangers: `unparsedRowOf` stores
            // it with an empty `details`, so there are no two players in it to
            // show. Spectated is defined by the two players (CONTEXT.md).
            .is('parse_error', null)
            // Newest first — the opposite of the stats read, which is ordered
            // for a curve. This one is read as a list, from the top.
            .order('played_at', { ascending: false })
            // The tie-break `played_at` needs to page safely: a bulk import
            // shares one upload second, and rows either side of a page
            // boundary would otherwise repeat or vanish.
            .order('replay_id', { ascending: false })
            .range(from, to) as unknown as PromiseLike<PageOf<StoredRecordRow>>,
      )

      return rows.map(battleRecordOf)
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
          found.set(row.replay_id, battleDetailsOf(row))
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
        // The user is the module's to fill in on a write as much as on a read.
        .upsert({ ...row, user_id: currentUserId() }, { onConflict: 'user_id,replay_id' })
        .select()
        // Asked for back, so a write that RLS quietly matched nothing cannot
        // pass for an import.
        .single()

      if (error) throw error
      // Not softened to "assume it worked": that is the whole point of reading
      // it back. `.single()` normally errors first, so this is the last door.
      if (!data) throw new Error(`The write of ${row.replay_id} came back with no row.`)

      return data as BattleRow
    },

    async setAttribution(replayId, attribution) {
      const { data, error } = await client
        .from('battles')
        // Spelled out rather than spread: `AttributableRow` widens
        // `Attribution` with `replay_id` and `details`, and a caller handing
        // one of those over must not write `details` back as a side effect.
        .update({
          my_side: attribution.my_side,
          my_username: attribution.my_username,
          opponent_username: attribution.opponent_username,
          result: attribution.result,
          team_signature: attribution.team_signature,
          bring_signature: attribution.bring_signature,
          bring_complete: attribution.bring_complete,
          rating: attribution.rating,
          rating_delta: attribution.rating_delta,
        })
        .eq('user_id', currentUserId())
        .eq('replay_id', replayId)
        .select('replay_id')
        .single()

      if (error) throw error
      // A backfill that counted a row nobody wrote as done would report work
      // it did not do, and the user would have no way to tell.
      if (!data) throw new Error(`The attribution of ${replayId} came back with no row.`)
    },
  }
}

/** A stored row as `nameCounts` reads it. */
export interface NamedRow {
  my_username: string | null
}

/**
 * Battles per Showdown name, keyed by the name's `toID()` form.
 *
 * Exported, like the two mappings below, for the in-memory adapter: one
 * derivation and two adapters, rather than a fake that quietly counts
 * differently from the module it stands in for.
 */
export function tallyNames(counts: Map<string, number>, rows: NamedRow[]): void {
  for (const row of rows) {
    const id = toID(row.my_username ?? '')
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
}

/**
 * A date with no time in it covers the whole of that day.
 *
 * Exported, like the two mappings below, for the in-memory adapter in
 * `test/fakes/battles.ts`: one derivation and two adapters, rather than a fake
 * that quietly answers differently from the module it stands in for.
 */
export function endOfDay(bound: string): string {
  return bound.includes('T') ? bound : `${bound}T23:59:59.999Z`
}

function* chunked(ids: string[]): Generator<string[]> {
  for (let start = 0; start < ids.length; start += LOOKUP_CHUNK) {
    yield ids.slice(start, start + LOOKUP_CHUNK)
  }
}

/**
 * The part of `details` the drawer reads: both sides, and who won.
 *
 * jsonb, so every field is optional here on purpose — a row written by an
 * older parser has fewer of them, and that is a battle to draw with what it
 * has rather than one to reject. `battle-row`'s `attributionOf` checks the
 * same column far more strictly, because what it reads is written back into
 * columns.
 */
interface StoredSides {
  winner?: unknown
  sides?: Partial<
    Record<SideId, { username?: unknown; bringSignature?: unknown; teamSignature?: unknown }>
  >
}

/** A stored row as `detailsOf` reads it. */
export interface StoredDetailRow {
  replay_id: string
  opponent_username: string | null
  turn_count: number | null
  my_side: SideId | null
  details: StoredSides | null
}

/** A stored row as `battleById` and `gamesOfSeries` read it. */
export interface StoredRecordRow extends StoredDetailRow {
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

/** A string field of a stored side, or null for anything jsonb happens to hold. */
function textOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** Both sides of a stored row, read neutrally. The one derivation of them. */
function sidesOf(row: StoredDetailRow): Record<SideId, BattleSide> {
  const sideOf = (side: SideId): BattleSide => ({
    username: textOf(row.details?.sides?.[side]?.username),
    bring: textOf(row.details?.sides?.[side]?.bringSignature),
    // Written by the ingest since both sides were first kept, and read here
    // for the first time: which two a player left at home is only visible
    // against the six they registered.
    team: textOf(row.details?.sides?.[side]?.teamSignature),
  })

  return { p1: sideOf('p1'), p2: sideOf('p2') }
}

/**
 * Which side is the opponent's is only knowable from `my_side`; a spectated
 * battle has no side of mine and therefore no opponent either.
 *
 * Given the sides rather than reading `details` again, so the opponent's bring
 * and the neutral p1/p2 view are the same derivation rather than two that
 * agree today (#63).
 */
function opponentSideOf(
  row: StoredDetailRow,
  sides: Record<SideId, BattleSide>,
): BattleSide | null {
  const theirs = row.my_side === 'p1' ? 'p2' : row.my_side === 'p2' ? 'p1' : null

  return theirs ? sides[theirs] : null
}

/** Who the log said won, or null for anything that is not one of its answers. */
function winnerOf(row: StoredRecordRow): SideId | 'tie' | null {
  const { winner } = row.details ?? {}

  return winner === 'p1' || winner === 'p2' || winner === 'tie' ? winner : null
}

export function battleDetailsOf(row: StoredDetailRow): BattleDetails {
  const opponent = opponentSideOf(row, sidesOf(row))

  return {
    opponentUsername: row.opponent_username,
    turnCount: row.turn_count,
    opponentBring: opponent?.bring ?? null,
    opponentTeam: opponent?.team ?? null,
  }
}

export function battleRecordOf(row: StoredRecordRow): BattleRecord {
  const sides = sidesOf(row)

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
    opponentBring: opponentSideOf(row, sides)?.bring ?? null,
    sides,
    winner: winnerOf(row),
    parseError: row.parse_error,
  }
}
