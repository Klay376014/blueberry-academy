import { describe, expect, it } from 'vite-plus/test'
import { parseReplay } from '../src/index'
import type { ReplayMeta } from '../src/index'
import fixture from './fixtures/gen9championsvgc2026regmb-2667169457.json'

const META: ReplayMeta = {
  replayId: 'gen9test-1',
  formatId: 'gen9championsvgc2026regmb',
  uploadTime: 1787131158,
}

interface LadderLog {
  p1Name?: string
  p2Name?: string
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
  p1TeamSize = 4,
  p2TeamSize = 4,
  p1Team = ['Scrafty, L50, F', 'Toxapex, L50, M'],
  p2Team = ['Whimsicott, L50, M', 'Gholdengo, L50'],
  lines = [],
}: LadderLog = {}): string {
  return [
    '|gametype|doubles',
    `|player|p1|${p1Name}|benga|1444`,
    `|player|p2|${p2Name}|gentleman|1534`,
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

  it('reports a tie as a tie, not as an undecided battle', () => {
    const battle = parseReplay(log({ lines: ['|tie'] }), META)

    expect(battle.winner).toBe('tie')
  })

  it('leaves the winner unknown when the log declares no result', () => {
    const battle = parseReplay(log(), META)

    expect(battle.winner).toBeNull()
  })

  it('counts the turns the battle lasted', () => {
    const battle = parseReplay(log({ lines: ['|turn|2', '|turn|3', '|win|Alice'] }), META)

    expect(battle.turnCount).toBe(3)
  })

  it('parses a real ladder Bo1 replay', () => {
    const battle = parseReplay(fixture.log, {
      replayId: fixture.id,
      formatId: fixture.formatid,
      uploadTime: fixture.uploadtime,
    })

    expect(battle).toMatchSnapshot()
  })
})
