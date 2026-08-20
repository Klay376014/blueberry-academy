import { describe, expect, it } from 'vite-plus/test'
import { PARSER_VERSION, parseReplay } from '../src/index'
import type { ParsedBattle, ReplayMeta } from '../src/index'
import fixture from './fixtures/gen9championsvgc2026regmb-2667169457.json'
import forfeitFixture from './fixtures/gen9championsvgc2026regmb-2667301751.json'
import unratedSeriesFixture from './fixtures/gen9championsvgc2026regmbbo3-2667579302.json'
import seriesFixture from './fixtures/gen9championsvgc2026regmbbo3-2667582547.json'
import tieFixture from './fixtures/gen9ou-2667293085.json'
import singlesFixture from './fixtures/gen9ou-2667296078.json'
import longFixture from './fixtures/gen9ou-2667299955.json'

const META: ReplayMeta = {
  replayId: 'gen9test-1',
  formatId: 'gen9championsvgc2026regmb',
  uploadTime: 1787131158,
}

/** A stored replay, parsed with the metadata its own JSON carries. */
function parseFixture(replay: {
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

interface LadderLog {
  p1Name?: string
  p2Name?: string
  /** The 5th `|player|` column: the rating a side carried into the game. */
  p1Rating?: string
  p2Rating?: string
  p1TeamSize?: number
  p2TeamSize?: number
  p1Team?: string[]
  p2Team?: string[]
  /** Everything after turn 1, i.e. what the test is actually about. */
  lines?: string[]
}

/** A minimal ladder log, so each test can vary one thing about it. */
function log({
  p1Name = 'Alice',
  p2Name = 'Bob',
  p1Rating = '1444',
  p2Rating = '1534',
  p1TeamSize = 4,
  p2TeamSize = 4,
  p1Team = ['Scrafty, L50, F', 'Toxapex, L50, M'],
  p2Team = ['Whimsicott, L50, M', 'Gholdengo, L50'],
  lines = [],
}: LadderLog = {}): string {
  return [
    '|gametype|doubles',
    `|player|p1|${p1Name}|benga|${p1Rating}`,
    `|player|p2|${p2Name}|gentleman|${p2Rating}`,
    `|teamsize|p1|${p1TeamSize}`,
    `|teamsize|p2|${p2TeamSize}`,
    ...p1Team.map((details) => `|poke|p1|${details}|`),
    ...p2Team.map((details) => `|poke|p2|${details}|`),
    '|start',
    '|switch|p1a: Scrafty|Scrafty, L50, F|100/100',
    '|switch|p2a: Whimsicott|Whimsicott, L50, M|100/100',
    '|turn|1',
    ...lines,
  ].join('\n')
}

describe('parseReplay', () => {
  it('carries the replay metadata through, with the upload time as the played-at instant', () => {
    const battle = parseReplay(log({ lines: ['|win|Alice'] }), META)

    expect(battle.replayId).toBe('gen9test-1')
    expect(battle.formatId).toBe('gen9championsvgc2026regmb')
    expect(battle.playedAt).toBe('2026-08-19T09:19:18.000Z')
    expect(battle.gameType).toBe('doubles')
  })

  it('takes each side name from the first |player| line, not the empty one re-sent at the end', () => {
    // Showdown re-emits |player|p1| after the battle. Reading the last one
    // would leave the name empty and make every battle look spectated.
    const battle = parseReplay(log({ lines: ['|win|Alice', '|player|p1|', '|player|p2|'] }), META)

    expect(battle.p1.username).toBe('Alice')
    expect(battle.p2.username).toBe('Bob')
  })

  it('normalises each side name into a user id for identity comparison', () => {
    const battle = parseReplay(
      log({ p1Name: 'Not LittleStar', lines: ['|win|Not LittleStar'] }),
      META,
    )

    expect(battle.p1.username).toBe('Not LittleStar')
    expect(battle.p1.userId).toBe('notlittlestar')
  })

  it('collects the team of each side separately, so both sides may bring the same Pokémon', () => {
    // Species Clause is per side: two Gholdengo across the two teams is legal,
    // and collecting |poke| into one bucket would lose one of them.
    const battle = parseReplay(
      log({ p1Team: ['Scrafty, L50, F', 'Gholdengo, L50'], lines: ['|win|Alice'] }),
      META,
    )

    expect(battle.p1.teamSignature).toBe('gholdengo|scrafty')
    expect(battle.p2.teamSignature).toBe('gholdengo|whimsicott')
  })

  it('sorts the base species ids of a signature and joins them with a pipe', () => {
    const battle = parseReplay(log({ lines: ['|win|Alice'] }), META)

    expect(battle.p1.teamSignature).toBe('scrafty|toxapex')
    expect(battle.p2.teamSignature).toBe('gholdengo|whimsicott')
  })

  it('reduces a Mega forme to its base species in the bring signature', () => {
    const battle = parseReplay(
      log({
        lines: [
          '|detailschange|p1a: Scrafty|Scrafty-Mega, L50, F',
          '|-mega|p1a: Scrafty|Scrafty|Scraftinite',
          '|switch|p1b: Toxapex|Toxapex, L50, M|100/100',
          '|switch|p1a: Scrafty|Scrafty-Mega, L50, F|93/100',
          '|win|Alice',
        ],
      }),
      META,
    )

    expect(battle.p1.bringSignature).toBe('scrafty|toxapex')
  })

  it('reduces a Primal forme to its base species without a |-mega| line to lean on', () => {
    // Primal reversion changes the species and emits no |-mega|, so a parser
    // that read the base species off |-mega| would count Groudon twice.
    const battle = parseReplay(
      log({
        p1Team: ['Scrafty, L50, F', 'Toxapex, L50, M', 'Groudon, L50'],
        lines: [
          '|switch|p1b: Groudon|Groudon, L50|100/100',
          '|detailschange|p1b: Groudon|Groudon-Primal, L50',
          '|switch|p1b: Toxapex|Toxapex, L50, M|100/100',
          '|switch|p1b: Groudon|Groudon-Primal, L50|80/100',
          '|win|Alice',
        ],
      }),
      META,
    )

    expect(battle.p1.bringSignature).toBe('groudon|scrafty|toxapex')
  })

  it('reduces a Mega whose base species is another forme, not the bare species', () => {
    // Floette-Mega reverts to Floette-Eternal. Taking the suffix off would put
    // a Floette in the bring that the side never registered, next to the
    // Floette-Eternal that really was there.
    const battle = parseReplay(
      log({
        p2Team: ['Whimsicott, L50, M', 'Floette-Eternal, L50, F'],
        lines: [
          '|switch|p2b: Floette|Floette-Eternal, L50, F|100/100',
          '|detailschange|p2b: Floette|Floette-Mega, L50, F',
          '|switch|p2b: Whimsicott|Whimsicott, L50, M|100/100',
          '|switch|p2b: Floette|Floette-Mega, L50, F|71/100',
          '|win|Alice',
        ],
      }),
      META,
    )

    expect(battle.p2.bringSignature).toBe('floetteeternal|whimsicott')
  })

  it('reduces a forme a Pokémon changes into on the field to the one it came from', () => {
    const battle = parseReplay(
      log({
        p1Team: ['Scrafty, L50, F', 'Toxapex, L50, M', 'Palafin, L50'],
        lines: [
          '|switch|p1b: Palafin|Palafin, L50|100/100',
          '|detailschange|p1b: Palafin|Palafin-Hero, L50',
          '|switch|p1b: Toxapex|Toxapex, L50, M|100/100',
          '|switch|p1b: Palafin|Palafin-Hero, L50|100/100',
          '|win|Alice',
        ],
      }),
      META,
    )

    expect(battle.p1.bringSignature).toBe('palafin|scrafty|toxapex')
  })

  it('counts a Pokémon into the bring the first time it appears', () => {
    const battle = parseReplay(
      log({ lines: ['|switch|p1b: Toxapex|Toxapex, L50, M|100/100', '|win|Alice'] }),
      META,
    )

    expect(battle.p1.bringSignature).toBe('scrafty|toxapex')
    expect(battle.p2.bringSignature).toBe('whimsicott')
  })

  it('counts a Pokémon dragged out against its trainer into the bring', () => {
    // A Pokémon pulled out by Roar was still brought to the battle; only
    // counting |switch| would lose it.
    const battle = parseReplay(
      log({ lines: ['|drag|p1b: Toxapex|Toxapex, L50, M|100/100', '|win|Alice'] }),
      META,
    )

    expect(battle.p1.bringSignature).toBe('scrafty|toxapex')
  })

  it('counts a Pokémon revealed behind an Illusion into the bring', () => {
    // Zoroark switches in wearing another Pokémon's name; |replace| is the
    // line that says who it really was.
    const battle = parseReplay(
      log({
        p2Team: ['Whimsicott, L50, M', 'Zoroark-Hisui, L50, M'],
        lines: ['|replace|p2a: Zoroark|Zoroark-Hisui, L50, M', '|win|Alice'],
      }),
      META,
    )

    expect(battle.p2.bringSignature).toContain('zoroarkhisui')
  })

  it('takes the borrowed name back out of the bring when an Illusion drops', () => {
    // The opening |switch| said Whimsicott, but |replace| says that appearance
    // was Zoroark all along. Whimsicott was never on the field, so counting it
    // would inflate the bring by a Pokémon that never came out.
    const battle = parseReplay(
      log({
        p2Team: ['Whimsicott, L50, M', 'Zoroark-Hisui, L50, M'],
        lines: ['|replace|p2a: Zoroark|Zoroark-Hisui, L50, M', '|win|Alice'],
      }),
      META,
    )

    expect(battle.p2.bringSignature).toBe('zoroarkhisui')
  })

  it('keeps a borrowed name that had already appeared for real before the Illusion', () => {
    // Whimsicott opened the battle itself, so the name is in the bring on its
    // own merit; the later Illusion wearing it must not retract that.
    const battle = parseReplay(
      log({
        p2Team: ['Whimsicott, L50, M', 'Gholdengo, L50', 'Zoroark-Hisui, L50, M'],
        p2TeamSize: 3,
        lines: [
          '|switch|p2a: Gholdengo|Gholdengo, L50|100/100',
          '|switch|p2a: Whimsicott|Whimsicott, L50, M|100/100',
          '|replace|p2a: Zoroark|Zoroark-Hisui, L50, M',
          '|win|Alice',
        ],
      }),
      META,
    )

    expect(battle.p2.bringSignature).toBe('gholdengo|whimsicott|zoroarkhisui')
  })

  it('counts the borrowed name again if that Pokémon really appears after the Illusion drops', () => {
    const battle = parseReplay(
      log({
        p2Team: ['Whimsicott, L50, M', 'Zoroark-Hisui, L50, M'],
        lines: [
          '|replace|p2a: Zoroark|Zoroark-Hisui, L50, M',
          '|switch|p2a: Whimsicott|Whimsicott, L50, M|100/100',
          '|win|Alice',
        ],
      }),
      META,
    )

    expect(battle.p2.bringSignature).toBe('whimsicott|zoroarkhisui')
  })

  it('marks the bring complete only when as many Pokémon appeared as the team size says were picked', () => {
    // Battles that end early leave picked Pokémon that never appear; the
    // signature stays as observed and the flag records that it is short.
    const battle = parseReplay(
      log({
        p1TeamSize: 2,
        lines: ['|switch|p1b: Toxapex|Toxapex, L50, M|100/100', '|win|Alice'],
      }),
      META,
    )

    expect(battle.p1.teamSize).toBe(2)
    expect(battle.p1.bringComplete).toBe(true)
    expect(battle.p2.teamSize).toBe(4)
    expect(battle.p2.bringComplete).toBe(false)
  })

  it('resolves the winning side by comparing the |win| name as a user id', () => {
    const battle = parseReplay(log({ lines: ['|win|bob'] }), META)

    expect(battle.winner).toBe('p2')
  })

  it('leaves the winning side unresolved when the |win| name matches neither player', () => {
    // Every identity comparison goes through toID; a name that normalises to
    // neither side cannot be turned into a result by guessing.
    const battle = parseReplay(log({ lines: ['|win|Someone Else'] }), META)

    expect(battle.winner).toBeNull()
  })

  it('reports a tie as a tie, not as an undecided battle', () => {
    const battle = parseReplay(log({ lines: ['|tie'] }), META)

    expect(battle.winner).toBe('tie')
  })

  it('leaves the winner unknown when the log declares no result', () => {
    const battle = parseReplay(log(), META)

    expect(battle.winner).toBeNull()
  })

  it('reads a forfeit off the free-text message Showdown sends before the win', () => {
    // There is no protocol line for forfeiting; the only trace is this English
    // sentence, and |win| looks exactly like a battle that was played out.
    const battle = parseReplay(log({ lines: ['|-message|Bob forfeited.', '|win|Alice'] }), META)

    expect(battle.endReason).toBe('forfeit')
    expect(battle.winner).toBe('p1')
  })

  it('leaves the end reason unset when the battle was played out', () => {
    const battle = parseReplay(log({ lines: ['|win|Alice'] }), META)

    expect(battle.endReason).toBe(null)
  })

  it('counts the turns the battle lasted', () => {
    const battle = parseReplay(log({ lines: ['|turn|2', '|turn|3', '|win|Alice'] }), META)

    expect(battle.turnCount).toBe(3)
  })

  it('reads each side rating from its own |player| line and its own |raw| line', () => {
    // The pre-battle rating is the 5th |player| column; the post-battle rating
    // and the delta only exist in the free text Showdown sends afterwards.
    const battle = parseReplay(
      log({
        lines: [
          '|win|Alice',
          "|raw|Alice's rating: 1444 &rarr; <strong>1459</strong><br />(+15 for winning)",
          "|raw|Bob's rating: 1534 &rarr; <strong>1519</strong><br />(-15 for losing)",
        ],
      }),
      META,
    )

    expect(battle.p1).toMatchObject({ ratingBefore: 1444, ratingAfter: 1459, ratingDelta: 15 })
    expect(battle.p2).toMatchObject({ ratingBefore: 1534, ratingAfter: 1519, ratingDelta: -15 })
  })

  it('reads the rating delta from after the rating, not from anywhere in the line', () => {
    // Showdown names are free enough to contain a parenthesised number, and
    // the delta is only the one that follows the new rating.
    const battle = parseReplay(
      log({
        p1Name: 'Ann (3 for me)',
        lines: [
          '|win|Ann (3 for me)',
          "|raw|Ann (3 for me)'s rating: 1444 &rarr; <strong>1459</strong><br />(+15 for winning)",
        ],
      }),
      META,
    )

    expect(battle.p1.ratingDelta).toBe(15)
  })

  it('leaves the rating null on both sides when the game was unrated', () => {
    // Tournament Bo3 games carry no rating at all: no 5th |player| column and
    // no |raw| line afterwards. The curve is meant to break there, not guess.
    const battle = parseReplay(log({ p1Rating: '', p2Rating: '', lines: ['|win|Alice'] }), META)

    expect(battle.p1).toMatchObject({ ratingBefore: null, ratingAfter: null, ratingDelta: null })
    expect(battle.p2).toMatchObject({ ratingBefore: null, ratingAfter: null, ratingDelta: null })
  })

  it("never takes a rating from the replay metadata, which holds the loser's", () => {
    // Measured on this replay: the metadata rating is 1429, which is the
    // post-battle rating of p1 — the side that lost. Writing it to the winner
    // would draw their rating curve out of their opponent's numbers.
    const battle = parseFixture(fixture)

    expect(fixture.rating).toBe(1429)
    expect(battle.winner).toBe('p2')
    expect(battle.p2.ratingAfter).toBe(1549)
    expect(battle.p2.ratingBefore).toBe(1534)
    expect(battle.p1.ratingAfter).toBe(1429)
  })

  it('takes the series id of a Bo3 game from the |uhtml|bestof| link to its parent', () => {
    // A Bo3 replay is a single game; the only thing tying it to its siblings is
    // the room id of the parent battle in this line.
    const battle = parseReplay(
      log({
        lines: [
          '|uhtml|bestof|<h2><strong>Game 2</strong> of <a href="/game-bestof3-gen9championsvgc2026regmbbo3-2667580698">a best-of-3</a></h2>',
          '|win|Alice',
        ],
      }),
      META,
    )

    expect(battle.seriesId).toBe('game-bestof3-gen9championsvgc2026regmbbo3-2667580698')
  })

  it('leaves the series id null for a ladder Bo1, which belongs to no series', () => {
    const battle = parseReplay(log({ lines: ['|win|Alice'] }), META)

    expect(battle.seriesId).toBeNull()
  })

  it('reads a singles game and a doubles game through the same path, recording each game type', () => {
    // Nothing assumes two field positions: a side with one is not a special
    // case, so a user syncing an account never sees half their games vanish.
    const doubles = parseReplay(log({ lines: ['|win|Alice'] }), META)
    const singles = parseReplay(
      log({ lines: ['|win|Alice'] }).replace('|gametype|doubles', '|gametype|singles'),
      META,
    )

    expect(doubles.gameType).toBe('doubles')
    expect(singles.gameType).toBe('singles')
    expect({ ...singles, gameType: 'doubles' }).toEqual(doubles)
  })

  it('records a game type it has never heard of rather than dropping the game', () => {
    const battle = parseReplay(
      log({ lines: ['|win|Alice'] }).replace('|gametype|doubles', '|gametype|multi'),
      META,
    )

    expect(battle.gameType).toBe('multi')
  })

  it('carries no KO attribution, which the protocol cannot support', () => {
    // |faint| never names the culprit — the cause may be recoil, Life Orb,
    // Rough Skin, weather or status. Guessing is left out until a view needs
    // it and a re-parse can add it.
    const battle = parseReplay(log({ lines: ['|faint|p2a: Whimsicott', '|win|Alice'] }), META)

    const fields = [...Object.keys(battle), ...Object.keys(battle.p1), ...Object.keys(battle.p2)]
    expect(fields.filter((field) => /ko|kill|faint|knockout/i.test(field))).toEqual([])
  })

  it('exports the parser version that produced a result, so rows can be re-parsed', () => {
    expect(PARSER_VERSION).toMatch(/^\d+$/)
  })

  it('parses a real ladder Bo1 replay', () => {
    expect(parseFixture(fixture)).toMatchSnapshot()
  })

  it('parses a real forfeited battle, won by the side that did not give up', () => {
    const battle = parseFixture(forfeitFixture)

    expect(battle.endReason).toBe('forfeit')
    expect(battle.winner).toBe('p1')
    expect(battle.p2.username).toBe('Really Unlucky')
    expect(battle).toMatchSnapshot()
  })

  it('parses a real drawn battle as a tie rather than an undecided one', () => {
    const battle = parseFixture(tieFixture)

    expect(battle.winner).toBe('tie')
    expect(battle.endReason).toBe(null)
    expect(battle).toMatchSnapshot()
  })

  it('parses a real singles battle, where a side has one field position', () => {
    const battle = parseFixture(singlesFixture)

    expect(battle.gameType).toBe('singles')
    expect(battle.winner).toBe('p2')
    expect(battle).toMatchSnapshot()
  })

  it('parses a real battle long enough for both sides to run their team out', () => {
    // 31 turns. Of 408 public Champions doubles replays scanned, none passed 20
    // turns, so the long-game case can only come from singles.
    const battle = parseFixture(longFixture)

    expect(battle.turnCount).toBe(31)
    expect(battle.p1.bringComplete).toBe(true)
    expect(battle).toMatchSnapshot()
  })

  it('parses a real Bo3 game that carries no rating at all', () => {
    // A tournament game has no 5th |player| column and no |raw| afterwards.
    // Nothing about it may fail; the rating is simply absent.
    const battle = parseFixture(unratedSeriesFixture)

    expect(unratedSeriesFixture.rating).toBeNull()
    expect(battle.p1).toMatchObject({ ratingBefore: null, ratingAfter: null, ratingDelta: null })
    expect(battle.p2).toMatchObject({ ratingBefore: null, ratingAfter: null, ratingDelta: null })
    expect(battle.seriesId).toBe('game-bestof3-gen9championsvgc2026regmbbo3-2667579301')
    expect(battle).toMatchSnapshot()
  })

  it('parses a real Bo3 game played on open team sheets, where |showteam| reveals both teams', () => {
    // Open team sheets add |showteam| lines carrying items, abilities and
    // moves. None of that is part of a team's identity, so the signatures are
    // built from |poke| exactly as on the ladder.
    const battle = parseFixture(seriesFixture)

    expect(seriesFixture.log).toContain('|showteam|p1|')
    expect(battle.seriesId).toBe('game-bestof3-gen9championsvgc2026regmbbo3-2667580698')
    expect(battle.winner).toBe('p1')
    expect(battle).toMatchSnapshot()
  })
})
