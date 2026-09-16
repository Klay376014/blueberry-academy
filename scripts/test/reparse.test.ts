import { gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vite-plus/test'
import { PARSER_VERSION } from 'replay-parser'
import type { BattleRow } from 'battle-row'
import { changedColumns, losesAccess, optionsOf, recordOf, rowFrom } from '../reparse.ts'
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

  it('rebuilds the address of a private replay from the stored JSON alone', () => {
    // The one thing a re-parse must not do to a private battle: null the
    // password and leave the drawer linking at a 404 (#197, ADR-0018).
    const stored = { ...ladder, private: 1, password: 'b1cd2ef' }
    const row = rowFrom(STORED, recordOf(gzipSync(JSON.stringify(stored))), ['DavoPro1214'])

    expect(row.replay_private).toBe(true)
    expect(row.replay_password).toBe('b1cd2ef')
  })

  it('keeps a private replay private when Showdown gave it no password', () => {
    // `private: 2` is Showdown's "private but with no password" (spike note,
    // 追加 §結果表第 8 項). Reading the absent password as "public" would file
    // the battle as something a stranger could look up.
    const stored = { ...ladder, private: 2, password: null }
    const row = rowFrom(STORED, recordOf(gzipSync(JSON.stringify(stored))), ['DavoPro1214'])

    expect(row.replay_private).toBe(true)
    expect(row.replay_password).toBeNull()
  })

  it('leaves a public replay without one', () => {
    const row = rowFrom(STORED, recordOf(gzipSync(JSON.stringify(ladder))), ['DavoPro1214'])

    expect(row.replay_private).toBe(false)
    expect(row.replay_password).toBeNull()
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

  it('watches the replay address as closely as the rest of the row', () => {
    // A column missing from the comparison is a column the script would never
    // write, which for the password is the same as losing it.
    const before = { ...rebuilt, replay_private: false, replay_password: null }
    const after = { ...rebuilt, replay_private: true, replay_password: 'b1cd2ef' }

    expect(changedColumns(before, after).sort()).toEqual(['replay_password', 'replay_private'])
  })

  it('sees a column the database has not got yet', () => {
    const before = { ...rebuilt, series_id: null }
    const after = { ...rebuilt, series_id: 'gen9ou-1' }

    expect(changedColumns(before, after)).toEqual(['series_id'])
  })
})

describe('backfilling a battle imported before the address had columns', () => {
  // The row as the migration left it: the two address columns at their
  // defaults, everything else exactly as the import wrote it.
  const beforeTheColumns = (row: BattleRow) => ({
    ...row,
    replay_private: false,
    replay_password: null,
  })

  it('gives a private battle back the address that opens it', () => {
    const stored = { ...ladder, private: 1, password: 'b1cd2ef' }
    const row = rowFrom(STORED, recordOf(gzipSync(JSON.stringify(stored))), ['DavoPro1214'])

    expect(changedColumns(beforeTheColumns(row), row).sort()).toEqual([
      'replay_password',
      'replay_private',
    ])
  })

  it('moves nothing at all for a public battle', () => {
    // Every row in the table goes through this run, so "the backfill touched
    // no ladder battle" is the difference between a quiet run and a table
    // rewritten for nothing.
    const row = rowFrom(STORED, recordOf(gzipSync(JSON.stringify(ladder))), ['DavoPro1214'])

    expect(changedColumns(beforeTheColumns(row), row)).toEqual([])
  })

  it('leaves every counted column where it was', () => {
    // What the ticket asks in as many words: this backfill is replay
    // metadata, not a re-derivation. Nothing the statistics read may move.
    const stored = { ...ladder, private: 1, password: 'b1cd2ef' }
    const row = rowFrom(STORED, recordOf(gzipSync(JSON.stringify(stored))), ['DavoPro1214'])
    const counted = [
      'team_signature',
      'bring_signature',
      'bring_complete',
      'result',
      'rating',
      'rating_delta',
    ] as const

    expect(changedColumns(beforeTheColumns(row), row)).toEqual(
      expect.not.arrayContaining([...counted]),
    )
  })
})

describe('a rebuild that would know less than the row it replaces', () => {
  // The backfill's whole point is that the password is in the stored JSON. A
  // row where it is not -- an object stored by a path that predates all this,
  // or one Showdown has since changed -- must not be quietly rewritten as a
  // public battle: the symptom is a link that 404s with nothing to say why,
  // and the row that could have explained it is gone (#198).
  const PRIVATE = { replay_private: true, replay_password: 'b1cd2ef' } as Partial<BattleRow>

  it('refuses a rebuild that would null a password the row has', () => {
    expect(losesAccess(PRIVATE, { ...PRIVATE, replay_password: null } as BattleRow)).toBe(true)
  })

  it('refuses a rebuild that would call a private battle public', () => {
    expect(
      losesAccess({ replay_private: true, replay_password: null }, {
        replay_private: false,
        replay_password: null,
      } as BattleRow),
    ).toBe(true)
  })

  it('allows the backfill itself', () => {
    // A public-looking row gaining an address is the thing this script is for.
    expect(
      losesAccess({ replay_private: false, replay_password: null }, PRIVATE as BattleRow),
    ).toBe(false)
  })

  it('allows a row whose address has not moved', () => {
    expect(losesAccess(PRIVATE, PRIVATE as BattleRow)).toBe(false)
  })

  it('allows a public battle rebuilt as public', () => {
    const publicRow = { replay_private: false, replay_password: null }

    expect(losesAccess(publicRow, publicRow as BattleRow)).toBe(false)
  })

  it('allows a row the database has no address columns for yet', () => {
    // Mid-migration, the select comes back without them. That is not a loss.
    expect(losesAccess({}, PRIVATE as BattleRow)).toBe(false)
  })
})
