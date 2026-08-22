import type { StatsRow } from '../../app/utils/battleStats'

/**
 * One account's battles, shaped to carry every rule the stats layer has to get
 * right, so the pure functions, the composable and the seeded database are all
 * asserted against the same numbers.
 *
 * The same rows are seeded in `supabase/tests/stats.test.sql`; change the two
 * together. A spectated battle is not here — the query never returns one, and
 * that exclusion is asserted in the pgTAP test.
 *
 * `ladder-3` is a forfeit with an incomplete bring, `ladder-5` has no result,
 * `ladder-6` is the same person under a different spelling and `ladder-7` is
 * somebody else, `series-1` is a complete Bo3 and `series-2` holds two of its
 * three games.
 */
const LADDER = 'gen9championsvgc2026regmb'
const EVENT = 'gen9championsvgc2026regmbbo3'

const TEAM_A = 'calyrexshadow|incineroar|ironhands|ragingbolt|rillaboom|urshifu'
const TEAM_B = 'amoonguss|chiyu|farigiraf|kingambit|miraidon|ogerpon'

const BRING_A1 = 'calyrexshadow|incineroar|ironhands|urshifu'
const BRING_A2 = 'calyrexshadow|ragingbolt|rillaboom|urshifu'
const BRING_A3 = 'incineroar|ironhands|ragingbolt|rillaboom'
const BRING_B1 = 'chiyu|farigiraf|miraidon|ogerpon'
const BRING_B2 = 'amoonguss|kingambit|miraidon|ogerpon'

function row(overrides: Partial<StatsRow> & Pick<StatsRow, 'replay_id' | 'played_at'>): StatsRow {
  return {
    format_id: LADDER,
    series_id: null,
    my_username: 'NotLittleStar',
    result: 'win',
    rating: null,
    rating_delta: null,
    team_signature: TEAM_A,
    bring_signature: BRING_A1,
    bring_complete: true,
    ...overrides,
  }
}

export const STATS_ROWS: StatsRow[] = [
  row({ replay_id: 'ladder-1', played_at: '2026-08-01T10:00:00Z' }),
  row({ replay_id: 'ladder-2', played_at: '2026-08-02T10:00:00Z', result: 'loss' }),
  // The forfeit: four were picked, three ever appeared.
  row({
    replay_id: 'ladder-3',
    played_at: '2026-08-03T10:00:00Z',
    bring_signature: 'calyrexshadow|incineroar|urshifu',
    bring_complete: false,
  }),
  row({
    replay_id: 'ladder-4',
    played_at: '2026-08-04T10:00:00Z',
    team_signature: TEAM_B,
    bring_signature: BRING_B1,
  }),
  // No winner declared, so no outcome to count.
  row({ replay_id: 'ladder-5', played_at: '2026-08-05T10:00:00Z', result: null }),
  // Me, spelled the other way.
  row({ replay_id: 'ladder-6', played_at: '2026-08-06T10:00:00Z', my_username: 'notlittlestar' }),
  // Not me.
  row({
    replay_id: 'ladder-7',
    played_at: '2026-08-07T10:00:00Z',
    my_username: 'SomeAlt',
    result: 'loss',
  }),

  // A Bo3 taken 2–1.
  row({
    replay_id: 'series-1-g1',
    played_at: '2026-08-08T10:00:00Z',
    format_id: EVENT,
    series_id: 'series-1',
    bring_signature: BRING_A2,
  }),
  row({
    replay_id: 'series-1-g2',
    played_at: '2026-08-08T10:30:00Z',
    format_id: EVENT,
    series_id: 'series-1',
    result: 'loss',
    bring_signature: BRING_A3,
  }),
  row({
    replay_id: 'series-1-g3',
    played_at: '2026-08-08T11:00:00Z',
    format_id: EVENT,
    series_id: 'series-1',
    bring_signature: BRING_A2,
  }),

  // A Bo3 with one game missing: 1–1 of what is held.
  row({
    replay_id: 'series-2-g1',
    played_at: '2026-08-09T10:00:00Z',
    format_id: EVENT,
    series_id: 'series-2',
    team_signature: TEAM_B,
    bring_signature: BRING_B2,
  }),
  row({
    replay_id: 'series-2-g2',
    played_at: '2026-08-09T10:30:00Z',
    format_id: EVENT,
    series_id: 'series-2',
    team_signature: TEAM_B,
    bring_signature: BRING_B2,
    result: 'loss',
  }),
]

export const SIGNATURES = { TEAM_A, TEAM_B, BRING_A1, BRING_A2, BRING_A3, BRING_B1, BRING_B2 }
export const FORMATS = { LADDER, EVENT }
