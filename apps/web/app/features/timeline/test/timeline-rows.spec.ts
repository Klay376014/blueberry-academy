import { describe, expect, it } from 'vitest'
import { parseTimeline } from 'replay-parser'
import type { TimelineTurn } from 'replay-parser'
import { rowsOf, sidelinedCount } from '../utils/timelineRows'
import ladder from '../../../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2667301751.json'
import lifeOrb from '../../../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2667169457.json'
import recoil from '../../../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2674380893.json'
import recoilToo from '../../../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2674448634.json'

/** One out on each side, which is what turn 0's own tests read. */
const TWO_UP = [
  '|switch|p1a: Scrafty|Scrafty, L50, F|100/100',
  '|switch|p2a: Whimsicott|Whimsicott, L50, M|100/100',
]

/** Both positions filled, which a spread move needs to have two of anything. */
const FOUR_UP = [
  '|switch|p1a: Scrafty|Scrafty, L50, F|100/100',
  '|switch|p1b: Torkoal|Torkoal, L50, M|100/100',
  '|switch|p2a: Whimsicott|Whimsicott, L50, M|100/100',
  '|switch|p2b: Garchomp|Garchomp, L50, F|100/100',
]

function turnsOf(lines: string[], leads = TWO_UP): TimelineTurn[] {
  return parseTimeline(
    [
      '|gametype|doubles',
      '|player|p1|Alice|benga|1444',
      '|player|p2|Bob|gentleman|1534',
      '|start',
      ...leads,
      '|turn|1',
      ...lines,
    ].join('\n'),
  ).turns
}

/** The rows of the one numbered turn the test wrote. */
function rows(lines: string[], detailed = false, leads = TWO_UP) {
  const turn = turnsOf(lines, leads)[1]
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
        targets: [{ species: 'Whimsicott', notes: [], health: [] }],
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

  it('draws a field effect going up and coming down, on the main line', () => {
    // Trick Room decides every turn it is up, and its end has no move of its
    // own to be read from — holding either back behind "the rest of this turn"
    // is how the timeline came to show neither at all (#104).
    const set = ['|-fieldstart|move: Trick Room|[of] p1a: Scrafty']
    const lifted = ['|-fieldend|move: Trick Room']

    expect(rows(set)).toMatchObject([
      {
        side: null,
        // Whoever the log said set it, so the row has a face. Nothing is
        // inferred: a terrain a move set names nobody and shows nobody.
        species: 'Scrafty',
        message: { key: 'fieldEffectStarted', params: { effect: 'Trick Room' } },
      },
    ])
    expect(sidelinedCount(turnsOf(set)[1]!)).toBe(0)

    expect(rows(lifted)).toMatchObject([
      {
        species: null,
        message: { key: 'fieldEffectEnded', params: { effect: 'Trick Room' } },
      },
    ])
    expect(sidelinedCount(turnsOf(lifted)[1]!)).toBe(0)
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

    // The whole turn reads on one row: it moved, it was super effective, it
    // took 68%. The stat stage is available and not in the way.
    expect(rows(lines).map((row) => row.mark)).toEqual(['move'])
    expect(sidelinedCount(turnsOf(lines)[1]!)).toBe(1)
    expect(rows(lines, true)).toHaveLength(2)
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
  it('says what a line that rewrote the stat changes did, on a row of its own', () => {
    const said = (line: string) => rows([line], true)[0]

    // Nobody's line, so nobody's rail: Haze names no Pokémon at all.
    expect(said('|-clearallboost')).toMatchObject({
      side: null,
      species: null,
      message: { key: 'allBoostsCleared' },
    })
    expect(said('|-clearboost|p1a: Scrafty')).toMatchObject({
      side: 'p1',
      species: 'Scrafty',
      message: { key: 'boostsCleared' },
    })
    expect(
      said('|-clearpositiveboost|p2a: Whimsicott|p1a: Scrafty|move: Spectral Thief'),
    ).toMatchObject({ species: 'Whimsicott', message: { key: 'positiveBoostsCleared' } })
    // A set says where the stat now stands, sign and all — `atk 6` would read
    // as six of something rather than as the top of the scale.
    expect(said('|-setboost|p1a: Scrafty|atk|6|[from] move: Belly Drum')).toMatchObject({
      message: { key: 'boostSet', params: { stat: 'atk', stages: '+6' } },
    })
    expect(said('|-invertboost|p1a: Scrafty')).toMatchObject({
      message: { key: 'boostsInverted' },
    })
  })

  it('puts the other Pokémon of a trade behind the arrow, where a swap needs two', () => {
    const swap = rows(
      ['|-swapboost|p1a: Scrafty|p2a: Whimsicott|atk, spa|[from] move: Power Swap'],
      true,
    )[0]

    expect(swap).toMatchObject({
      side: 'p1',
      species: 'Scrafty',
      targets: [{ species: 'Whimsicott' }],
      // The stats as the log spelled them, comma-joined: the component is what
      // puts each into the reader's language.
      message: { key: 'boostsSwapped', params: { stats: 'atk,spa' } },
    })

    // Heart Swap names no stats, so the sentence cannot list any.
    expect(
      rows(['|-swapboost|p1a: Scrafty|p2a: Whimsicott|[from] move: Heart Swap'], true)[0],
    ).toMatchObject({ message: { key: 'allBoostsSwapped' }, targets: [{ species: 'Whimsicott' }] })

    expect(
      rows(['|-copyboost|p1a: Scrafty|p2a: Whimsicott|[from] move: Psych Up'], true)[0],
    ).toMatchObject({
      species: 'Scrafty',
      targets: [{ species: 'Whimsicott' }],
      message: { key: 'boostsCopied' },
    })
  })

  it('holds a rewritten stat change back until the rest of the turn is asked for', () => {
    // The same standing as `-boost`: the move that did it is the main line, and
    // the bar below already shows the chips going.
    const lines = ['|move|p2a: Whimsicott|Haze|p2a: Whimsicott', '|-clearallboost']

    expect(rows(lines).map((row) => row.mark)).toEqual(['move'])
    expect(sidelinedCount(turnsOf(lines)[1]!)).toBe(1)
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
    // Nothing about a `-damage` says the move is over, and measured logs put
    // the stat drop and the Protect that held on the far side of it.
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|32/100',
      '|-resisted|p2a: Whimsicott',
    ]

    expect(rows(lines)[0]?.targets[0]?.notes).toEqual([{ key: 'hit.resisted', quiet: false }])
    expect(rows(lines)).toHaveLength(1)
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
  it('folds a volatile the move put on onto that move’s row', () => {
    // Leech Seed's row already says Leech Seed, so the note the target carries
    // is the same word twice: quiet, like the Protect that goes up.
    const seeded = [
      '|move|p1a: Scrafty|Leech Seed|p2a: Whimsicott',
      '|-start|p2a: Whimsicott|move: Leech Seed',
    ]

    expect(rows(seeded)).toMatchObject([
      {
        move: 'Leech Seed',
        targets: [
          {
            species: 'Whimsicott',
            notes: [{ key: 'volatileStarted', params: { effect: 'Leech Seed' }, quiet: true }],
          },
        ],
      },
    ])
  })

  it('says a volatile the move did not name, and one wearing off', () => {
    // Confuse Ray leaves `confusion`, which is not the move's name, so the
    // note has something to add. A volatile coming off has no move open at
    // all: it happens at the end of the turn, on a row of its own.
    const confused = [
      '|move|p2a: Whimsicott|Confuse Ray|p1a: Scrafty',
      '|-start|p1a: Scrafty|confusion',
    ]

    expect(rows(confused)[0]?.targets[0]?.notes).toEqual([
      { key: 'volatileStarted', params: { effect: 'confusion' }, quiet: false },
    ])

    expect(rows(['|-end|p1a: Scrafty|move: Taunt'], true)).toMatchObject([
      { species: 'Scrafty', message: { key: 'volatileEnded', params: { effect: 'Taunt' } } },
    ])
  })

  it('keeps a volatile that ran out on the residual off the last move’s row', () => {
    // Measured in `gen9ou-2667296078` turn 10: a Taunt wore off after the
    // turn's last move, and folding it there made the row read as though Surf
    // had removed it. Nothing closes an action but a move or a switch, so the
    // residual phase is still inside the last one — and this file's own rule
    // is that a row never claims causality.
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|38/100',
      '|-end|p1a: Scrafty|move: Taunt',
    ]

    expect(rows(lines, true)).toMatchObject([
      { move: 'Knock Off', notes: [] },
      { species: 'Scrafty', message: { key: 'volatileEnded', params: { effect: 'Taunt' } } },
    ])
  })

  it('folds a Substitute the move broke onto that move’s row', () => {
    // The other half of the same line: on a Pokémon the move was aimed at,
    // the move is the only thing that could have taken it off.
    const lines = [
      '|-start|p2a: Whimsicott|Substitute',
      '|turn|2',
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-end|p2a: Whimsicott|Substitute',
    ]
    const turn = turnsOf(lines)[2]!

    expect(rowsOf(turn, { detailed: false })).toMatchObject([
      {
        move: 'Knock Off',
        targets: [
          {
            species: 'Whimsicott',
            notes: [{ key: 'volatileEnded', params: { effect: 'Substitute' }, quiet: false }],
          },
        ],
      },
    ])
  })

  it('says an Illusion breaking once, not twice', () => {
    // Showdown sends `|replace|` and then `|-end|…|Illusion` for the one
    // thing, measured in `gen9championsvgc2026regmb-2667169457` turn 2. The
    // reveal row already says it.
    const lines = ['|replace|p2a: Zoroark|Zoroark-Hisui, L50, M']

    expect(rows([...lines, '|-end|p2a: Zoroark|Illusion'], true)).toEqual(rows(lines, true))
  })

  it('says an ability that was taken off, and nothing when the log did not name it', () => {
    const named = [
      '|move|p2a: Whimsicott|Gastro Acid|p1a: Scrafty',
      '|-endability|p1a: Scrafty|Fairy Aura|[from] move: Gastro Acid',
    ]

    // On the main line: an ability going away decides the turns after it as
    // much as the `|-ability|` that announced it does.
    expect(rows(named)).toMatchObject([
      { move: 'Gastro Acid' },
      { species: 'Scrafty', message: { key: 'abilityEnded', params: { ability: 'Fairy Aura' } } },
    ])

    // Nothing named means nothing to say, so there is no row rather than a row
    // with a hole in it.
    expect(rows(['|-endability|p1a: Scrafty'], true)).toEqual([])
  })

  it('folds a failure onto the move that failed', () => {
    const failed = ['|move|p1a: Scrafty|Protect|p1a: Scrafty', '|-fail|p1a: Scrafty']

    // On the Pokémon that used the move, which is whose failure it is. A miss
    // is the one that moved off the user — see 'a move that missed' below,
    // and #149 for why.
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
      { species: 'Whimsicott', notes: [{ key: 'hit.resisted', quiet: false }], health: [] },
      { species: 'Gholdengo', notes: [{ key: 'hit.supereffective', quiet: false }], health: [] },
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

describe('the damage an action gathers onto its own row', () => {
  it('folds a hit onto the target it hit, when the log named no other source', () => {
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|38/100',
    ]

    expect(rows(lines)).toMatchObject([
      {
        move: 'Knock Off',
        targets: [{ species: 'Whimsicott', health: [{ hpBefore: 100, hpAfter: 38 }] }],
      },
    ])
    expect(rows(lines)).toHaveLength(1)
  })
  it('leaves the damage the log gave a source of on its own row', () => {
    // Measured on turn 3 of the ladder fixture: `[from] item: Life Orb` on the
    // Pokémon that just used the move, and `[from] brn` at the end of the turn.
    // Both would be a lie beside the move's target icon, and `from` is the log
    // saying so itself.
    const lines = [
      '|move|p2a: Whimsicott|Moonblast|p1a: Scrafty',
      '|-damage|p1a: Scrafty|62/100',
      '|-damage|p2a: Whimsicott|90/100|[from] item: Life Orb',
      '|-damage|p1a: Scrafty|56/100 brn|[from] brn',
      '|-heal|p1a: Scrafty|62/100|[from] item: Leftovers',
    ]

    expect(rows(lines).map((row) => [row.mark, row.species, row.health?.from])).toEqual([
      ['move', 'Whimsicott', undefined],
      ['health', 'Whimsicott', 'item: Life Orb'],
      ['health', 'Scrafty', 'brn'],
      ['health', 'Scrafty', 'item: Leftovers'],
    ])
    // The one with no source of its own is the one that went onto the row.
    expect(rows(lines)[0]?.targets[0]?.health).toMatchObject([{ hpAfter: 62 }])
  })

  it('folds nothing onto a Pokémon the move was never aimed at', () => {
    // Garchomp is on the row because it stopped the move, not because the log
    // called it a target — so a change in its HP is nobody's to claim.
    const lines = [
      '|switch|p1b: Garchomp|Garchomp, L50, F|100/100',
      '|move|p2a: Whimsicott|Make It Rain|p1b: Garchomp|[spread] p1a',
      '|-activate|p1b: Garchomp|move: Protect',
      '|-damage|p1b: Garchomp|80/100',
    ]

    const [move, hurt] = rows(lines).slice(-2)
    expect(move?.bystanders).toEqual([
      {
        species: 'Garchomp',
        notes: [{ key: 'effectHeld', params: { effect: 'Protect' }, quiet: false }],
        health: [],
      },
    ])
    expect(hurt).toMatchObject({ mark: 'health', species: 'Garchomp' })
  })

  it('keeps both hits of a move that hit twice', () => {
    const lines = [
      '|move|p1a: Scrafty|Dual Wingbeat|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|70/100',
      '|-damage|p2a: Whimsicott|41/100',
    ]

    expect(rows(lines)[0]?.targets[0]?.health).toMatchObject([{ hpAfter: 70 }, { hpAfter: 41 }])
  })

  it('gives each target of a spread move its own numbers, in the log’s order', () => {
    const lines = [
      '|switch|p2b: Gholdengo|Gholdengo, L50|100/100',
      '|move|p1a: Scrafty|Rock Slide|p2a: Whimsicott|[spread] p2a,p2b',
      '|-damage|p2b: Gholdengo|61/100',
      '|-damage|p2a: Whimsicott|0 fnt',
    ]

    expect(
      rows(lines)
        .at(-1)
        ?.targets.map((target) => [target.species, target.health.map((change) => change.hpAfter)]),
    ).toEqual([
      ['Whimsicott', [0]],
      ['Gholdengo', [61]],
    ])
  })
  it('folds nothing that Showdown itself did not show', () => {
    // A silent line is drawn nowhere at all (T24), and folding decides where a
    // change is drawn rather than whether — so the flag has to be asked here
    // too, or what was hidden reappears on the main line.
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|38/100|[silent]',
    ]

    expect(rows(lines)[0]?.targets[0]?.health).toEqual([])
    expect(rows(lines, true)).toHaveLength(1)
  })
})

/**
 * What a move failed to hit, and what a knockout is said about — the two
 * places the timeline used to say too little and too much (#149).
 */
describe('a move that missed', () => {
  it('says which Pokémon it failed to hit', () => {
    // The real shape, from `gen9championsvgc2026regmb-2667301751` turn 7.
    const [row] = rows([
      '|move|p1a: Scrafty|Blizzard|p2a: Whimsicott|[miss]',
      '|-miss|p1a: Scrafty|p2a: Whimsicott',
    ])

    expect(row?.targets).toEqual([
      { species: 'Whimsicott', notes: [{ key: 'missed', quiet: false }], health: [] },
    ])
    // Not on the Pokémon that used it: the row's subject did not dodge
    // anything, and saying it there is what left the reader guessing.
    expect(row?.notes).toEqual([])
  })

  it('says which of two a spread move failed to hit', () => {
    // Also real, from `gen9championsvgc2026regmb-2674380893`: a Rock Slide
    // that hit one and missed the other. The source used to say this shape
    // had never been measured.
    const [row] = rows(
      [
        '|move|p1a: Scrafty|Rock Slide|p2b: Garchomp|[spread] p2b',
        '|-miss|p1a: Scrafty|p2a: Whimsicott',
        '|-damage|p2b: Garchomp|69/100',
      ],
      false,
      FOUR_UP,
    )

    // The one it hit is a target; the one it missed the log never called one,
    // so it stands where a Pokémon an action reached without targeting does.
    expect(row?.targets.map((target) => target.species)).toEqual(['Garchomp'])
    expect(row?.targets[0]?.health.map((change) => change.hpAfter)).toEqual([69])
    expect(row?.bystanders).toEqual([
      { species: 'Whimsicott', notes: [{ key: 'missed', quiet: false }], health: [] },
    ])
  })

  it('keeps the miss on the row when the log named nobody', () => {
    const [row] = rows(['|move|p1a: Scrafty|Blizzard|p2a: Whimsicott', '|-miss|p1a: Scrafty'])

    expect(row?.notes).toEqual([{ key: 'missed', quiet: false }])
    expect(row?.targets[0]?.notes).toEqual([])
  })
})

describe('a Pokémon knocked out', () => {
  it('is said once, on the row of the move that did it', () => {
    const drawn = rows([
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|0 fnt',
      '|faint|p2a: Whimsicott',
    ])

    // The hit that took it to nothing is on the move's row already, and the
    // health chip says so — a row of its own said the same word again.
    expect(drawn.map((row) => row.mark)).toEqual(['move'])
    expect(drawn[0]?.targets[0]?.health.map((change) => change.hpAfter)).toEqual([0])
  })

  it('keeps a row of its own when its own move recoiled on it', () => {
    const drawn = rows([
      '|move|p1a: Scrafty|Double-Edge|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|50/100',
      '|-damage|p1a: Scrafty|0 fnt|[from] Recoil',
      '|faint|p1a: Scrafty',
    ])

    // The recoil carries `[from]`, so it never reached the move's row and
    // nothing there says the attacker is gone.
    expect(drawn.filter((row) => row.mark === 'faint').map((row) => row.species)).toEqual([
      'Scrafty',
    ])
  })

  it('keeps a row of its own when a residual tick finished it', () => {
    const drawn = rows([
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|50/100',
      '|-damage|p2a: Whimsicott|0 fnt|[from] psn',
      '|faint|p2a: Whimsicott',
    ])

    // A target of the move, but not killed by it: the row shows the 50 the
    // move took, never a nothing, so the faint is news.
    expect(drawn.filter((row) => row.mark === 'faint').map((row) => row.species)).toEqual([
      'Whimsicott',
    ])
  })

  it('offers the same rows behind the details switch as in front of it', () => {
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|0 fnt',
      '|faint|p2a: Whimsicott',
    ]

    // The count is the difference between the two levels, so a row dropped
    // from one and not the other would be offered and never appear.
    expect(sidelinedCount(turnsOf(lines)[1]!)).toBe(rows(lines, true).length - rows(lines).length)
    expect(rows(lines, true).map((row) => row.mark)).toEqual(['move'])
  })
})

/**
 * The same two rules against whole games rather than written turns, because
 * what made the repetition worth a ticket was that it happened every time
 * (#149).
 *
 * Four games rather than one: the faints that must **survive** are the rare
 * shape, and all six of the first game's are the common one. Life Orb is in
 * `-2667169457`, Recoil in the other two, and between them they also carry an
 * Earthquake that killed both targets at once and a Wave Crash that killed its
 * target and then its user.
 */
describe('whole games', () => {
  const games = [
    { name: '2667301751', log: ladder.log, survives: [] as string[] },
    { name: '2667169457', log: lifeOrb.log, survives: ['Gholdengo'] },
    { name: '2674380893', log: recoil.log, survives: ['Basculegion'] },
    { name: '2674448634', log: recoilToo.log, survives: ['Basculegion'] },
  ]

  const drawnFor = (log: string) =>
    parseTimeline(log).turns.map((turn) => rowsOf(turn, { detailed: false }))

  it.each(games)('never reports the same Pokémon knocked out twice in $name', ({ log }) => {
    const saidTwice = drawnFor(log).flatMap((rows) =>
      rows.flatMap((row, index) => {
        if (row.mark !== 'faint') return []

        const shownBefore = rows
          .slice(0, index)
          .some((earlier) =>
            earlier.targets.some(
              (target) =>
                target.species === row.species &&
                target.health.some((change) => change.kind === 'damage' && change.hpAfter === 0),
            ),
          )

        return shownBefore ? [row.species] : []
      }),
    )

    expect(saidTwice).toEqual([])
  })

  it.each(games)(
    'keeps a row for the self-KOs of $name and for nothing else',
    ({ log, survives }) => {
      // The direction that matters: a faint the move's row cannot account for
      // must still be drawn. Life Orb and Recoil kill the Pokémon that attacked,
      // whose damage carries `[from]` and so never reached that row.
      expect(
        drawnFor(log)
          .flat()
          .filter((row) => row.mark === 'faint')
          .map((row) => row.species),
      ).toEqual(survives)
    },
  )

  it.each(games)('accounts for every faint of $name, turn by turn', ({ log }) => {
    // Every `|faint|` the log reports is either drawn as a row or swallowed by
    // a row that shows that Pokémon at nothing — reconciled per turn, so a
    // change that started dropping or drawing wholesale would show up here.
    //
    // What this does **not** reach: a target finished by a residual tick, the
    // shape where the Pokémon is a target but the row cannot account for it.
    // None of the ten fixtures has one — all 61 of their faints follow a
    // damage to 0 — so the written turn above is that case's only guard.
    const turns = parseTimeline(log).turns

    for (const turn of turns) {
      const rows = rowsOf(turn, { detailed: false })
      const faintLines = turn.events.filter((event) => event.kind === 'faint').length
      const drawn = rows.filter((row) => row.mark === 'faint').length
      const swallowed = rows
        .flatMap((row) => row.targets)
        .filter((target) =>
          target.health.some((change) => change.kind === 'damage' && change.hpAfter === 0),
        ).length

      expect(drawn + swallowed).toBe(faintLines)
    }
  })

  it('names a dodger wherever it drew a miss', () => {
    const misses = games
      .flatMap((game) => drawnFor(game.log).flat())
      .flatMap((row) => [...row.targets, ...row.bystanders])
      .filter((at) => at.notes.some((note) => note.key === 'missed'))

    expect(misses.length).toBeGreaterThan(0)
    expect(misses.every((at) => at.species.length > 0)).toBe(true)
  })

  it.each(games)('offers in $name exactly the rows the details switch counts', ({ log }) => {
    for (const turn of parseTimeline(log).turns) {
      expect(sidelinedCount(turn)).toBe(
        rowsOf(turn, { detailed: true }).length - rowsOf(turn, { detailed: false }).length,
      )
    }
  })
})
