import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import FieldBar from '../components/FieldBar.vue'
import type { FieldSnapshot } from '../utils/battleField'

/**
 * The field row of the turn summary: what the reader is shown standing on the
 * whole field, and whether the three kinds standing there can be told apart.
 *
 * Names are `localised-names.spec.ts`' subject; this file is about which chips
 * appear at all and what marks one kind off from another (#119).
 */

const EMPTY: FieldSnapshot = {
  turn: 1,
  slots: [
    {
      side: 'p1',
      position: 'p1a',
      species: 'Scrafty',
      hp: 100,
      status: null,
      boosts: {},
      teraType: null,
      fainted: false,
    },
  ],
  offField: [],
  screens: { p1: [], p2: [] },
  fieldEffects: [],
  weather: null,
  fieldAbilities: [],
}

async function mountField(snapshot: Partial<FieldSnapshot>) {
  return await mountSuspended(FieldBar, {
    props: { snapshot: { ...EMPTY, ...snapshot }, mySide: 'p1' as const, caption: 'Turn 1' },
  })
}

/** The chips on the bar, by the kind each one says it is. */
async function chips(snapshot: Partial<FieldSnapshot>) {
  const wrapper = await mountField(snapshot)

  return wrapper.findAll('[data-condition]').map((chip) => ({
    kind: chip.attributes('data-condition'),
    text: chip.text(),
    tone: chip.classes().join(' '),
  }))
}

describe('what the field row shows', () => {
  it('draws nothing when nothing is standing on the field', async () => {
    expect(await chips({})).toEqual([])
  })

  it('draws the weather even when nothing else is up', async () => {
    // The row used to appear only for a `-fieldstart` effect, so a game spent
    // entirely in the snow had no field row at all.
    expect(await chips({ weather: 'Snowscape' })).toMatchObject([
      { kind: 'weather', text: 'Snowscape' },
    ])
  })

  it('draws a whole-field ability even when nothing else is up', async () => {
    expect(await chips({ fieldAbilities: ['Fairy Aura'] })).toMatchObject([
      { kind: 'ability', text: 'Fairy Aura' },
    ])
  })

  it('tells the three kinds on the row apart by colour', async () => {
    const row = await chips({
      fieldEffects: ['Trick Room'],
      weather: 'Snowscape',
      fieldAbilities: ['Fairy Aura'],
    })

    expect(row.map((chip) => chip.kind)).toEqual(['field', 'weather', 'ability'])
    // Colour is all the row has to say which is which: at 9px there is no room
    // beside a chip for a label, so three identical paints would be one blur.
    expect(new Set(row.map((chip) => chip.tone)).size).toBe(3)
  })

  it('does not draw an ability chip in the paint the status chips use', async () => {
    // `chart-4` is also `par`/`slp` and a stat drop, one row below on the same
    // bar. The palette has no sixth hue to spend, so the ability chip is the
    // dashed one — which is what it is: an effect propped up by a Pokémon
    // standing there rather than by the field.
    const [aura] = await chips({ fieldAbilities: ['Fairy Aura'] })
    const others = await chips({ fieldEffects: ['Trick Room'], weather: 'Snowscape' })

    expect(aura?.tone).toContain('border-dashed')
    for (const chip of others) expect(chip.tone, chip.kind).not.toContain('border-dashed')
  })

  it('keeps a side’s screens off the whole field’s row', async () => {
    // Tailwind is one side's. On the field row it would read as everyone's.
    const row = await chips({ screens: { p1: ['Tailwind'], p2: [] } })

    expect(row.map((chip) => chip.kind)).toEqual(['screen'])
  })
})
