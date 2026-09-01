import { describe, expect, it } from 'vitest'
import { parseTimeline } from 'replay-parser'
import type { TimelineTurn } from 'replay-parser'
import { rowsOf, sidelinedCount } from '../utils/timelineRows'

function turnsOf(lines: string[]): TimelineTurn[] {
  return parseTimeline(
    [
      '|gametype|doubles',
      '|player|p1|Alice|benga|1444',
      '|player|p2|Bob|gentleman|1534',
      '|start',
      '|switch|p1a: Scrafty|Scrafty, L50, F|100/100',
      '|switch|p2a: Whimsicott|Whimsicott, L50, M|100/100',
      '|turn|1',
      ...lines,
    ].join('\n'),
  ).turns
}

/** The rows of the one numbered turn the test wrote. */
function rows(lines: string[], detailed = false) {
  const turn = turnsOf(lines)[1]
  if (!turn) throw new Error('No turn 1 in this log.')

  return rowsOf(turn, { detailed })
}

describe('the rows one turn becomes', () => {
  it('draws nothing for a health line Showdown itself does not show', () => {
    // The state behind the drawer takes the silent heal; the log of what was
    // played must not, or it shows a heal nobody saw (#90).
    const silent = ['|-heal|p1a: Scrafty|83/100|[from] ability: Regenerator|[silent]']

    expect(rows(silent, true)).toEqual([])
    expect(sidelinedCount(turnsOf(silent)[1]!)).toBe(0)
  })

  it('reads a move as its English name and the icons it was aimed at', () => {
    // The move name is an identifier and never passes through i18n; the
    // targets are icons, so what is carried is their species.
    expect(rows(['|move|p1a: Scrafty|Knock Off|p2a: Whimsicott'])).toEqual([
      {
        mark: 'move',
        side: 'p1',
        species: 'Scrafty',
        move: 'Knock Off',
        targets: [{ species: 'Whimsicott', notes: [] }],
        bystanders: [],
        notes: [],
        message: null,
        quiet: false,
        health: null,
        status: null,
        tone: null,
      },
    ])
  })

  it('leaves out the target of a move aimed at the Pokémon using it', () => {
    // `Protect` pointing at its own user says nothing worth an icon.
    expect(rows(['|move|p1a: Scrafty|Protect|p1a: Scrafty'])[0]).toMatchObject({
      move: 'Protect',
      targets: [],
    })
  })

  it('names every target of a spread move', () => {
    const turn = [
      '|switch|p2b: Gholdengo|Gholdengo, L50|100/100',
      '|move|p1a: Scrafty|Rock Slide|p2a: Whimsicott|[spread] p2a,p2b',
    ]

    expect(
      rows(turn)
        .at(-1)
        ?.targets.map((target) => target.species),
    ).toEqual(['Whimsicott', 'Gholdengo'])
  })

  it('carries a health change as the change itself, not as words', () => {
    expect(rows(['|-damage|p2a: Whimsicott|32/100'])[0]).toMatchObject({
      mark: 'health',
      species: 'Whimsicott',
      health: { kind: 'damage', hpBefore: 100, hpAfter: 32 },
    })
  })

  it('says who fainted and marks the row as the bad news it is', () => {
    expect(rows(['|faint|p2a: Whimsicott'])[0]).toMatchObject({
      mark: 'faint',
      species: 'Whimsicott',
      message: { key: 'fainted' },
      tone: 'bad',
    })
  })

  it('reports a terastallization with the type as a parameter', () => {
    expect(rows(['|-terastallize|p1a: Scrafty|Dark'])[0]).toMatchObject({
      mark: 'tera',
      message: { key: 'terastallized', params: { type: 'Dark' } },
      tone: 'accent',
    })
  })

  it('lets the icon be the whole of a forme change, and still says it out loud', () => {
    // Every forme change would read the same three words, and the icon has
    // already changed into the forme. Kept for a screen reader, which has no
    // icon to compare.
    expect(rows(['|detailschange|p1a: Scrafty|Scrafty-Mega, L50, F'])[0]).toMatchObject({
      mark: 'forme',
      species: 'Scrafty-Mega',
      message: { key: 'changedForme' },
      quiet: true,
    })
  })

  it('says out loud the things an icon cannot show', () => {
    expect(rows(['|faint|p2a: Whimsicott'])[0]?.quiet).toBe(false)
    expect(rows(['|-terastallize|p1a: Scrafty|Dark'])[0]?.quiet).toBe(false)
  })

  it('does not say a Mega Evolution changed forme as well', () => {
    // Showdown sends `detailschange` and then `-mega` for one thing happening.
    // Megaing is the event; the forme change is how it is implemented, and the
    // mega row already carries the new forme's icon.
    const rows = rowsOf(
      turnsOf([
        '|detailschange|p1a: Scrafty|Scrafty-Mega, L50, F',
        '|-mega|p1a: Scrafty|Scrafty|Scraftinite',
      ])[1]!,
      { detailed: true },
    )

    expect(rows.map((row) => row.message?.key)).toEqual(['megaEvolved'])
    expect(rows[0]?.species).toBe('Scrafty-Mega')
  })

  it('keeps a forme change that no Mega Evolution follows', () => {
    // Palafin, Zen Mode, Terapagos: the forme change is the event.
    const rows = rowsOf(turnsOf(['|detailschange|p1a: Scrafty|Scrafty-Mega, L50, F'])[1]!, {
      detailed: true,
    })

    expect(rows.map((row) => row.message?.key)).toEqual(['changedForme'])
  })

  it('reads a switch as the trade it is: who left, who came in', () => {
    // Two icons and an arrow say it without a word, so the sentence is left to
    // the screen reader.
    expect(rows(['|switch|p1a: Toxapex|Toxapex, L50, M|100/100'])[0]).toMatchObject({
      mark: 'switch',
      species: 'Scrafty',
      targets: [{ species: 'Toxapex', notes: [] }],
      message: { key: 'cameInFor' },
      quiet: true,
    })
  })

  it('says "came in" in words when there was nobody to come in for', () => {
    // The lead, and anyone taking an empty position: there is no trade to draw.
    expect(rows(['|switch|p1b: Garchomp|Garchomp, L50, F|100/100'])[0]).toMatchObject({
      species: 'Garchomp',
      targets: [],
      message: { key: 'cameIn' },
      quiet: false,
    })
  })

  it('leaves an Illusion reveal as the reveal, not as a substitution', () => {
    // Nobody left the field: the same body is standing there under its own name.
    expect(rows(['|replace|p2a: Zoroark|Zoroark-Hisui, L50, M'])[0]).toMatchObject({
      species: 'Zoroark-Hisui',
      targets: [],
      message: { key: 'wasAnIllusion' },
      quiet: false,
    })
  })

  it('keeps the lead switches, which are what turn 0 is', () => {
    const lead = rowsOf(turnsOf([])[0]!, { detailed: false })

    expect(lead.map((row) => row.species)).toEqual(['Scrafty', 'Whimsicott'])
    expect(lead[0]?.message).toEqual({ key: 'cameIn' })
  })

  it('keeps an ability on the main line, where it decides turns', () => {
    // Intimidate, Snow Warning, Protosynthesis: what an ability did is as much
    // of the turn as the moves are, and it is announced once.
    expect(rows(['|-ability|p1a: Scrafty|Intimidate'])).toMatchObject([
      { species: 'Scrafty', message: { key: 'ability', params: { ability: 'Intimidate' } } },
    ])
    expect(sidelinedCount(turnsOf(['|-ability|p1a: Scrafty|Intimidate'])[1]!)).toBe(0)
  })

  it('keeps the weather an ability set, and not the turns it kept blowing', () => {
    // Measured: the line that sets it carries `[from] ability: Snow Warning`,
    // and the eight after it are `[upkeep]` — the same weather, once a turn.
    const set = ['|-weather|Snowscape|[from] ability: Snow Warning|[of] p1a: Ninetales']
    const upkeep = ['|-weather|Snowscape|[upkeep]']

    expect(rows(set)).toMatchObject([
      { message: { key: 'weather', params: { weather: 'Snowscape' } } },
    ])
    expect(sidelinedCount(turnsOf(set)[1]!)).toBe(0)

    expect(rows(upkeep)).toEqual([])
    expect(rows(upkeep, true)).toHaveLength(1)
    expect(sidelinedCount(turnsOf(upkeep)[1]!)).toBe(1)
  })

  it('holds back the supporting events until they are asked for', () => {
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-supereffective|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|32/100',
      '|-boost|p1a: Scrafty|atk|1',
      '|-activate|p2a: Whimsicott|move: Protect',
    ]

    // The main line reads: it moved, it hurt. The rest is available and not in
    // the way (design decision Q3 on this issue).
    expect(rows(lines).map((row) => row.mark)).toEqual(['move', 'health'])
    expect(sidelinedCount(turnsOf(lines)[1]!)).toBe(1)
    expect(rows(lines, true)).toHaveLength(3)
  })

  it('never shows a line the parser could not read, at either level', () => {
    // Kept by the parser so that a "show the raw log" switch needs no parser
    // change, and shown by neither level until there is one.
    const lines = ['|upkeep', '|inactive|Alice has 30 seconds left.']

    expect(rows(lines, true)).toEqual([])
    expect(sidelinedCount(turnsOf(lines)[1]!)).toBe(0)
  })

  it('describes a stat change in the stats’ own terms', () => {
    expect(rows(['|-unboost|p2a: Whimsicott|atk|1'], true)[0]).toMatchObject({
      message: { key: 'statFell', params: { stat: 'atk', stages: '1' } },
    })
    expect(rows(['|-boost|p1a: Scrafty|spe|2'], true)[0]).toMatchObject({
      message: { key: 'statRose', params: { stat: 'spe', stages: '2' } },
    })
  })
})

describe('the results an action gathers onto its own row', () => {
  it('pins how a hit landed on the Pokémon it landed on', () => {
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-supereffective|p2a: Whimsicott',
    ]

    expect(rows(lines)).toMatchObject([
      {
        move: 'Knock Off',
        targets: [{ species: 'Whimsicott', notes: [{ key: 'hit.supereffective' }] }],
      },
    ])
  })
  it('makes room on the row for a Pokémon that only turns up in the results', () => {
    // Measured: `|move|p2b: Gholdengo|Make It Rain|p1b: Garchomp|[spread] p1a`.
    // The spread list is the targets, and the Garchomp that protected is named
    // in no other place than its own result — so a row that only had targets
    // could not show who stopped the move.
    const lines = [
      '|switch|p1b: Garchomp|Garchomp, L50, F|100/100',
      '|switch|p2b: Gholdengo|Gholdengo, L50|100/100',
      '|move|p2b: Gholdengo|Make It Rain|p1b: Garchomp|[spread] p1a',
      '|-activate|p1b: Garchomp|move: Protect',
    ]

    expect(rows(lines).at(-1)).toMatchObject({
      move: 'Make It Rain',
      targets: [{ species: 'Scrafty', notes: [] }],
      bystanders: [
        { species: 'Garchomp', notes: [{ key: 'effectHeld', params: { effect: 'Protect' } }] },
      ],
    })
  })
  it('gathers a result that arrives after the damage did', () => {
    // The rows between are the action's own: nothing about a `-damage` says the
    // move is over, and measured logs put the stat drop and the Protect that
    // held on the far side of it.
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|32/100',
      '|-resisted|p2a: Whimsicott',
    ]

    expect(rows(lines)[0]?.targets[0]?.notes).toEqual([{ key: 'hit.resisted', quiet: false }])
    expect(rows(lines)).toHaveLength(2)
  })
  it('puts the Protect that went up on the Pokémon that put it up', () => {
    // `-singleturn` names the user, not a target: it is the move working, and
    // the row already says `Protect`, so the words are the screen reader's.
    const lines = ['|move|p1a: Scrafty|Protect|p1a: Scrafty', '|-singleturn|p1a: Scrafty|Protect']

    expect(rows(lines)).toMatchObject([
      {
        move: 'Protect',
        targets: [],
        notes: [{ key: 'effectStarted', params: { effect: 'Protect' }, quiet: true }],
      },
    ])
  })
  it('folds a miss and a failure onto the move that missed or failed', () => {
    const missed = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-miss|p1a: Scrafty|p2a: Whimsicott',
    ]
    const failed = ['|move|p1a: Scrafty|Protect|p1a: Scrafty', '|-fail|p1a: Scrafty']

    // On the Pokémon that used the move rather than the one it flew past: the
    // row's subject is the user, and `missed` reads as its failure.
    expect(rows(missed)).toMatchObject([{ move: 'Knock Off', notes: [{ key: 'missed' }] }])
    expect(rows(failed)).toMatchObject([{ move: 'Protect', notes: [{ key: 'failed' }] }])
  })
  it('gives each target of a spread move its own result', () => {
    const lines = [
      '|switch|p2b: Gholdengo|Gholdengo, L50|100/100',
      '|move|p1a: Scrafty|Rock Slide|p2a: Whimsicott|[spread] p2a,p2b',
      '|-supereffective|p2b: Gholdengo',
      '|-resisted|p2a: Whimsicott',
    ]

    // In the order the log listed the targets, not the order the results
    // arrived in: the icons stay where the reader last saw them.
    expect(rows(lines).at(-1)?.targets).toEqual([
      { species: 'Whimsicott', notes: [{ key: 'hit.resisted', quiet: false }] },
      { species: 'Gholdengo', notes: [{ key: 'hit.supereffective', quiet: false }] },
    ])
  })

  it('closes an action at the next move, and at a switch', () => {
    const nextMove = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|move|p2a: Whimsicott|Moonblast|p1a: Scrafty',
      '|-resisted|p1a: Scrafty',
    ]
    const afterSwitch = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|switch|p2a: Toxapex|Toxapex, L50, M|100/100',
      '|-activate|p2a: Toxapex|move: Protect',
    ]

    // The result belongs to Moonblast, whose user it names, and not to the
    // Knock Off two rows up.
    const [knockOff, moonblast] = rows(nextMove)
    expect(knockOff?.targets[0]?.notes).toEqual([])
    expect(moonblast?.targets[0]?.notes).toEqual([{ key: 'hit.resisted', quiet: false }])

    // Nothing is open across a switch, so the effect keeps its own row.
    expect(rows(afterSwitch, true).map((row) => row.message?.key)).toEqual([
      undefined,
      'cameInFor',
      'effectHeld',
    ])
    expect(rows(afterSwitch)[0]?.targets[0]?.notes).toEqual([])
  })
})
