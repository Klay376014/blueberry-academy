import { describe, expect, it } from 'vitest'
import { parseTimeline } from 'replay-parser'
import type { TimelineTurn } from 'replay-parser'
import { rowsOf, sidelinedCount } from '../../app/utils/timelineRows'

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
  it('reads a move as its English name and the icons it was aimed at', () => {
    // The move name is an identifier and never passes through i18n; the
    // targets are icons, so what is carried is their species.
    expect(rows(['|move|p1a: Scrafty|Knock Off|p2a: Whimsicott'])).toEqual([
      {
        mark: 'move',
        side: 'p1',
        species: 'Scrafty',
        move: 'Knock Off',
        targets: ['Whimsicott'],
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

    expect(rows(turn).at(-1)?.targets).toEqual(['Whimsicott', 'Gholdengo'])
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
      targets: ['Toxapex'],
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
    expect(sidelinedCount(turnsOf(lines)[1]!)).toBe(3)
    expect(rows(lines, true)).toHaveLength(5)
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
