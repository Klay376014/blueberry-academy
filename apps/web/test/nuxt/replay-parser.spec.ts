import { describe, expect, it } from 'vitest'
import { PARSER_VERSION, parseReplay } from 'replay-parser'
import ladderReplay from '../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2667169457.json'
import seriesReplay from '../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmbbo3-2667582547.json'

// The parser is a workspace package with no runtime dependencies, and the app
// is what will call it during an import. This guards that wiring: that the app
// can resolve the package at all, and that a real replay comes back parsed.
describe('replay-parser', () => {
  it('parses a real ladder Bo1 replay from inside the app', () => {
    const battle = parseReplay(ladderReplay.log, {
      replayId: ladderReplay.id,
      formatId: ladderReplay.formatid,
      uploadTime: ladderReplay.uploadtime,
    })

    expect(battle.winner).toBe('p2')
    expect(battle.p2.username).toBe('Bibas Rozkurwiator')
    expect(battle.p2.ratingAfter).toBe(1549)
    expect(battle.seriesId).toBeNull()
  })

  it('parses a real tournament Bo3 game from inside the app', () => {
    const battle = parseReplay(seriesReplay.log, {
      replayId: seriesReplay.id,
      formatId: seriesReplay.formatid,
      uploadTime: seriesReplay.uploadtime,
    })

    expect(battle.winner).toBe('p1')
    expect(battle.gameType).toBe('doubles')
    expect(battle.seriesId).toBe('game-bestof3-gen9championsvgc2026regmbbo3-2667580698')
  })

  it('exposes the parser version the app stores alongside a parsed row', () => {
    // What the app needs is the symbol; the value is the parser's to bump.
    expect(PARSER_VERSION).toMatch(/^\d+$/)
  })
})
