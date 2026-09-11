import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'
import { parseTimeline } from 'replay-parser'
import EventRow from '../components/EventRow.vue'
import { row } from './fixtures'
import { rowsOf } from '../utils/timelineRows'
import type { RowHit } from '../utils/timelineRows'
import multiHit from '../../../../../../packages/replay-parser/test/fixtures/gen9vgc2024regf-2082942604.json'

/**
 * How a move that hit more than once is drawn: one line per hit, each with
 * the results the log stated before it (#170).
 *
 * The reading it replaces put all six results of a three-hit move in a row and
 * the three health bars after them, so nothing said which crit went with which
 * bite and the line ran off the drawer's edge.
 */

const hit = (hpBefore: number, hpAfter: number, notes: string[]): RowHit => ({
  notes: notes.map((key) => ({ key, quiet: false })),
  change: {
    kind: 'damage',
    pokemon: {
      side: 'p2',
      position: 'p2a',
      species: 'Rillaboom',
      nickname: 'Rillaboom',
      revealedSpecies: null,
    },
    hpBefore,
    hpAfter,
    hpDelta: hpAfter - hpBefore,
    from: null,
    silent: false,
  },
})

/** The three hits of the Surging Strikes the issue was reported from. */
const SURGING_STRIKES = [
  hit(100, 87, ['hit.resisted', 'hit.crit']),
  hit(87, 75, ['hit.resisted', 'hit.crit']),
  hit(75, 64, ['hit.resisted', 'hit.crit']),
]

async function mount(hits: RowHit[]) {
  return await mountSuspended(EventRow, {
    props: {
      row: row({
        move: 'Surging Strikes',
        targets: [{ species: 'Rillaboom', notes: [], hits }],
      }),
      mySide: 'p1',
    },
  })
}

describe('a move that hit more than once', () => {
  it('draws one line per hit, each holding that hit’s own results', async () => {
    const wrapper = await mount(SURGING_STRIKES)
    const lines = wrapper.findAll('[data-testid="row-hit"]')

    expect(lines).toHaveLength(3)
    expect(lines.map((line) => line.text())).toEqual([
      'resistedcritical hit−13% 87%',
      'resistedcritical hit−12% 75%',
      'resistedcritical hit−11% 64%',
    ])
  })

  it('keeps each hit’s results in the same line as its health bar', async () => {
    // The order the words come in is the whole of it for a reader who cannot
    // see the lines: the alternative is six results and then three numbers.
    const wrapper = await mount(SURGING_STRIKES)
    const first = wrapper.findAll('[data-testid="row-hit"]')[0]

    expect(first?.findAll('[data-testid="row-note"]')).toHaveLength(2)
    expect(first?.findAll('[data-testid="row-health"]')).toHaveLength(1)
  })

  it('draws a single hit exactly as it always did', async () => {
    // The common row must not change shape: one line, the note beside the bar.
    const wrapper = await mount([hit(100, 62, ['hit.supereffective'])])

    expect(wrapper.findAll('[data-testid="row-hit"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="row-hit"]').text()).toBe('super effective−38% 62%')
  })

  it('shows all three hits of the battle the issue was reported from', async () => {
    // End to end on the real log: three bars, none of them lost off the edge
    // of the drawer, and the Fake Out on the other slot still its own row.
    const turn = parseTimeline(multiHit.log).turns.find((it) => it.number === 1)
    const surging = rowsOf(turn!, { detailed: false }).find((it) => it.move === 'Surging Strikes')
    const wrapper = await mountSuspended(EventRow, {
      props: { row: surging!, mySide: 'p1' },
    })

    expect(wrapper.findAll('[data-testid="row-hit"]').map((line) => line.text())).toEqual([
      'resistedcritical hit−13% 87%',
      'resistedcritical hit−12% 75%',
      'resistedcritical hit−11% 64%',
    ])
  })

  it('reads a note the last hit did not claim after that hit, as the log did', () => {
    // Dynamic Punch says `-resisted`, then the damage, then the confusion it
    // left behind. The hit owns the first; the second belongs to no hit and
    // has to stay where the log put it, behind the bar rather than in front
    // of the results that came before it.
    return mountSuspended(EventRow, {
      props: {
        row: row({
          move: 'Dynamic Punch',
          targets: [
            {
              species: 'Rillaboom',
              notes: [{ key: 'volatileStarted', params: { effect: 'confusion' }, quiet: false }],
              hits: [hit(100, 38, ['hit.resisted'])],
            },
          ],
        }),
        mySide: 'p1',
      },
    }).then((wrapper) => {
      expect(wrapper.findAll('[data-testid="row-note"]').map((note) => note.text())).toEqual([
        'resisted',
        'confusion',
      ])
    })
  })
})
