import { describe, expect, it } from 'vite-plus/test'
import { PARSER_VERSION, parseReplay } from 'replay-parser'
import type { ParsedBattle } from 'replay-parser'
import { battleRowOf, unparsedRowOf } from '../src/index.ts'
import ladder from '../../replay-parser/test/fixtures/gen9championsvgc2026regmb-2667169457.json'
import tie from '../../replay-parser/test/fixtures/gen9ou-2667293085.json'

/** A stored replay, parsed with the metadata its own JSON carries. */
function parsed(replay: {
  log: string
  id: string
  formatid: string
  uploadtime: number
}): ParsedBattle {
  return parseReplay(replay.log, {
    replayId: replay.id,
    formatId: replay.formatid,
    uploadTime: replay.uploadtime,
  })
}

const OWNER = { userId: 'user-1', aliases: ['DavoPro1214'], logPath: 'user-1/x.json.gz' }

describe('the row one parsed battle becomes', () => {
  it('resolves which side is mine from the alias list', () => {
    const row = battleRowOf(parsed(ladder), OWNER)

    expect(row.my_side).toBe('p1')
    expect(row.my_username).toBe('DavoPro1214')
    expect(row.opponent_username).toBe('Bibas Rozkurwiator')
    expect(row.result).toBe('loss')
  })

  it('compares names normalised, because that is what "the same me" means', () => {
    // CONTEXT.md, 身分: NotLittleStar and notlittlestar are one person, so a
    // spelling difference must not file the user's battle as somebody else's.
    const row = battleRowOf(parsed(ladder), { ...OWNER, aliases: ['davo pro 1214'] })

    expect(row.my_side).toBe('p1')
  })

  it('leaves a battle nobody on the list played as spectated', () => {
    const row = battleRowOf(parsed(ladder), { ...OWNER, aliases: ['SomebodyElse'] })

    // Stored, and counting towards none of this user's statistics: the
    // signatures are mine, and there is no mine.
    expect(row.my_side).toBeNull()
    expect(row.result).toBeNull()
    expect(row.team_signature).toBeNull()
    expect(row.bring_signature).toBeNull()
    expect(row.bring_complete).toBe(false)
  })

  it('keeps both sides in details whoever was playing', () => {
    const row = battleRowOf(parsed(ladder), { ...OWNER, aliases: [] })

    expect(row.details).toMatchObject({ sides: { p1: { userId: 'davopro1214' } } })
  })

  it('takes my rating from my own side, never from the replay metadata', () => {
    // The metadata `rating` is the loser's value whichever side that is.
    const battle = parsed(ladder)
    const row = battleRowOf(battle, OWNER)

    expect(row.rating).toBe(battle.p1.ratingAfter)
    expect(row.rating_delta).toBe(battle.p1.ratingDelta)
  })

  it('calls a tie a tie for whichever side is mine', () => {
    const battle = parsed(tie)

    for (const side of ['p1', 'p2'] as const) {
      const row = battleRowOf(battle, { ...OWNER, aliases: [battle[side].username] })
      expect(row.result).toBe('tie')
    }
  })

  it('stamps the version that produced it, so a re-parse can tell', () => {
    expect(battleRowOf(parsed(ladder), OWNER).parser_version).toBe(PARSER_VERSION)
  })
})

describe('the row a replay that could not be parsed becomes', () => {
  const META = { replayId: 'gen9ou-1', formatId: 'gen9ou', uploadTime: 1787131158 }

  it('carries only what the replay metadata said, and why it failed', () => {
    const row = unparsedRowOf(META, {
      userId: 'user-1',
      logPath: 'user-1/gen9ou-1.json.gz',
      message: 'nobody has taught it that line yet',
    })

    expect(row).toMatchObject({
      replay_id: 'gen9ou-1',
      format_id: 'gen9ou',
      played_at: '2026-08-19T09:19:18.000Z',
      my_side: null,
      // Not null: the stats layer takes only `true`, and false is the honest
      // answer about a battle nothing is known about.
      bring_complete: false,
      parse_error: 'nobody has taught it that line yet',
      parser_version: PARSER_VERSION,
    })
  })
})
