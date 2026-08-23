import { gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vite-plus/test'
import { PARSER_VERSION } from 'replay-parser'
import type { BattleRow } from 'battle-row'
import { changedColumns, optionsOf, recordOf, rowFrom } from '../reparse.ts'
import ladder from '../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2667169457.json'

// Real everywhere except for one sentinel log: what a parser regression looks
// like is a throw, and the parser itself is tolerant of nonsense by design.
vi.mock('replay-parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('replay-parser')>()

  return {
    ...actual,
    parseReplay: (log: string, meta: Parameters<typeof actual.parseReplay>[1]) => {
      if (log.includes('|unteachable')) throw new Error('nobody has taught it that line yet')

      return actual.parseReplay(log, meta)
    },
  }
})

const STORED = {
  user_id: 'user-1',
  replay_id: ladder.id,
  log_path: `user-1/${ladder.id}.json.gz`,
}

describe('what the command line asked for', () => {
  it('rebuilds everything by default', () => {
    expect(optionsOf([])).toEqual({ stale: false, dryRun: false, user: null })
  })

  it('takes the narrowing flags', () => {
    expect(optionsOf(['--stale', '--dry-run', '--user', 'user-1'])).toEqual({
      stale: true,
      dryRun: true,
      user: 'user-1',
    })
  })

  it('refuses a flag it does not know rather than quietly ignoring it', () => {
    // A misspelt --dry-run that ran anyway would write over a whole table.
    expect(() => optionsOf(['--dryrun'])).toThrow(/--dryrun/)
  })

  it('refuses --user without a user', () => {
    expect(() => optionsOf(['--user'])).toThrow(/--user/)
  })
})

describe('reading a stored log back', () => {
  it('gunzips the replay JSON exactly as the import stored it', () => {
    const record = recordOf(gzipSync(JSON.stringify(ladder)))

    expect(record.id).toBe(ladder.id)
    expect(record.formatid).toBe(ladder.formatid)
    expect(record.log).toBe(ladder.log)
  })

  it('says so when the object is not a replay, rather than parsing nonsense', () => {
    expect(() => recordOf(gzipSync(JSON.stringify({ id: 'x' })))).toThrow(/replay/)
  })
})

describe('rebuilding one row', () => {
  it('produces the row the importer would have written', () => {
    const record = recordOf(gzipSync(JSON.stringify(ladder)))
    const row = rowFrom(STORED, record, ['DavoPro1214'])

    expect(row).toMatchObject({
      user_id: 'user-1',
      replay_id: ladder.id,
      log_path: STORED.log_path,
      my_side: 'p1',
      result: 'loss',
      parser_version: PARSER_VERSION,
      parse_error: null,
    })
  })

  it('keeps the log and records why, when the parser cannot read it', () => {
    const record = recordOf(gzipSync(JSON.stringify({ ...ladder, log: '|unteachable' })))
    const row = rowFrom(STORED, record, ['DavoPro1214'])

    // The row is rewritten rather than left alone: a parser that used to
    // manage this log and no longer does is exactly what needs reporting.
    expect(row.parse_error).toBe('nobody has taught it that line yet')
    expect(row.log_path).toBe(STORED.log_path)
    // Enough to find it again, and nothing derived that would be a guess.
    expect(row.played_at).toBe('2026-08-19T09:19:18.000Z')
    expect(row.my_side).toBeNull()
  })
})

describe('what changed', () => {
  const record = recordOf(gzipSync(JSON.stringify(ladder)))
  const rebuilt = rowFrom(STORED, record, ['DavoPro1214'])
  const details = rebuilt.details as { winner: unknown; sides: { p1: unknown; p2: unknown } }

  it('finds nothing when the parser has not changed', () => {
    // The acceptance this script exists for: re-running an unchanged parser
    // must not move a single column.
    expect(changedColumns(rebuilt as BattleRow, rebuilt)).toEqual([])
  })

  it('names the columns that moved', () => {
    const before = { ...rebuilt, result: 'win' as const, turn_count: 3 }

    expect(changedColumns(before, rebuilt).sort()).toEqual(['result', 'turn_count'])
  })

  it('compares details by value, not by identity', () => {
    const before = { ...rebuilt, details: JSON.parse(JSON.stringify(rebuilt.details)) }

    // `details` comes back from PostgREST as a fresh object every time, so
    // reference equality would report every row as changed.
    expect(changedColumns(before, rebuilt)).toEqual([])
  })

  it('reads a timestamp as an instant, not as a spelling', () => {
    // Measured against the local Supabase: `played_at` comes back out of
    // PostgREST as 2026-08-19T09:19:18+00:00, where the parser produced
    // ...T09:19:18.000Z. The same moment, two spellings.
    const before = { ...rebuilt, played_at: '2026-08-19T09:19:18+00:00' }

    expect(rebuilt.played_at).toBe('2026-08-19T09:19:18.000Z')
    expect(changedColumns(before, rebuilt)).toEqual([])
  })

  it('reads details as a value, whatever order jsonb hands the keys back in', () => {
    // Also measured: jsonb stores keys sorted by length then bytewise, so
    // { winner, sides } comes back as { sides, winner }. Comparing the
    // serialisations as written would call every row on the table changed.
    const before = {
      ...rebuilt,
      details: {
        sides: { p2: details.sides.p2, p1: details.sides.p1 },
        winner: details.winner,
      },
    }

    expect(changedColumns(before, rebuilt)).toEqual([])
  })

  it('still sees a real change to details', () => {
    // The fixture's winner is p2 — this is the other side, so it must show.
    const before = { ...rebuilt, details: { ...details, winner: 'p1' } }

    expect(changedColumns(before, rebuilt)).toEqual(['details'])
  })

  it('sees a column the database has not got yet', () => {
    const before = { ...rebuilt, series_id: null }
    const after = { ...rebuilt, series_id: 'gen9ou-1' }

    expect(changedColumns(before, after)).toEqual(['series_id'])
  })
})
