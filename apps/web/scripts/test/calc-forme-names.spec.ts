import { describe, expect, it } from 'vite-plus/test'
import { fillFormeNames, indexCalcNames } from '../calc-forme-names.mjs'
import zhHant from '../../app/shared/lib/dex/species-names-zh-hant.json'

/** A species as the generator hands one over: only these four fields are read. */
const species = (name: string, baseSpecies: string, forme: string, id?: string) => ({
  id: id ?? name.toLowerCase().replaceAll(/[^a-z0-9]+/g, ''),
  name,
  baseSpecies,
  forme,
})

describe('indexCalcNames', () => {
  it('rekeys the calculator table by Showdown id form', () => {
    expect(
      indexCalcNames({ 'ogerpon-wellspring-mask': '厄鬼椪（水井面具）', bulbasaur: '妙蛙種子' }),
    ).toEqual({ ogerponwellspringmask: '厄鬼椪（水井面具）', bulbasaur: '妙蛙種子' })
  })
})

describe('fillFormeNames', () => {
  it('matches a forme whose key carries a suffix the dex does not', () => {
    const filled = fillFormeNames({
      names: { ogerpon: '厄鬼椪' },
      species: [species('Ogerpon-Wellspring', 'Ogerpon', 'Wellspring')],
      calcNames: indexCalcNames({
        ogerpon: '厄鬼椪（碧草面具）',
        'ogerpon-wellspring-mask': '厄鬼椪（水井面具）',
      }),
    })

    expect(filled.names).toEqual({ ogerponwellspring: '厄鬼椪（水井面具）' })
    expect(filled.collided).toEqual([])
    expect(filled.unresolved).toEqual([])
  })

  it('matches a multi-word forme on every one of its words', () => {
    const filled = fillFormeNames({
      names: {},
      species: [species('Tauros-Paldea-Combat', 'Tauros', 'Paldea-Combat')],
      calcNames: indexCalcNames({
        'tauros-paldea-combat-breed': '肯泰羅（帕底亞的樣子-鬥戰種）',
        'tauros-paldea-aqua-breed': '肯泰羅（帕底亞的樣子-水瀾種）',
      }),
    })

    expect(filled.names).toEqual({ taurospaldeacombat: '肯泰羅（帕底亞的樣子-鬥戰種）' })
  })

  // The whole reason this is a gap-filler and not a source: the calculator's
  // table is the one that is wrong about Espathra, and ours is the one the
  // official Pokédex agrees with.
  it('never overwrites a name the table already has', () => {
    const filled = fillFormeNames({
      names: { espathra: '超能豔鴕' },
      species: [species('Espathra', 'Espathra', '')],
      calcNames: indexCalcNames({ espathra: '超能艷鴕' }),
    })

    expect(filled.names).toEqual({})
  })

  // `Avalugg-Hisui` is `冰岩怪` in the calculator's table -- the base species'
  // own name, with the forme descriptor missing. Taking it would put one name
  // on two different Pokémon, which is what `Darmanitan-Galar-Zen` is skipped
  // for. Measured: this is the only such entry.
  it('skips a name that another Pokémon already answers to', () => {
    const filled = fillFormeNames({
      names: { avalugg: '冰岩怪' },
      species: [species('Avalugg-Hisui', 'Avalugg', 'Hisui')],
      calcNames: indexCalcNames({ 'avalugg-hisui': '冰岩怪' }),
    })

    expect(filled.names).toEqual({})
    expect(filled.collided).toEqual([{ name: 'Avalugg-Hisui', clash: '冰岩怪' }])
  })

  it('skips a name two filled formes would share', () => {
    const filled = fillFormeNames({
      names: {},
      species: [species('Fake-One', 'Fake', 'One'), species('Fake-Two', 'Fake', 'Two')],
      calcNames: indexCalcNames({ 'fake-one': '一樣的名字', 'fake-two': '一樣的名字' }),
    })

    expect(Object.keys(filled.names)).toEqual(['fakeone'])
    expect(filled.collided).toEqual([{ name: 'Fake-Two', clash: '一樣的名字' }])
  })

  it('reports a forme it cannot key rather than guessing at one', () => {
    const filled = fillFormeNames({
      names: {},
      species: [species('Necrozma-Dusk-Mane', 'Necrozma', 'Dusk-Mane')],
      calcNames: indexCalcNames({
        necrozma: '奈克洛茲瑪',
        'necrozma-dusk': '奈克洛茲瑪（黃昏之鬃）',
      }),
    })

    expect(filled.names).toEqual({})
    expect(filled.unresolved).toEqual(['Necrozma-Dusk-Mane'])
  })

  it('declines a forme whose words match two keys at once', () => {
    const filled = fillFormeNames({
      names: {},
      species: [species('Fake-Red', 'Fake', 'Red')],
      calcNames: indexCalcNames({ 'fake-red-one': '紅一', 'fake-red-two': '紅二' }),
    })

    expect(filled.names).toEqual({})
    expect(filled.unresolved).toEqual(['Fake-Red'])
  })

  it('leaves a base species the calculator has never heard of alone', () => {
    const filled = fillFormeNames({
      names: {},
      species: [species('Nihil-Form', 'Nihil', 'Form')],
      calcNames: indexCalcNames({ bulbasaur: '妙蛙種子' }),
    })

    expect(filled.names).toEqual({})
    expect(filled.unresolved).toEqual(['Nihil-Form'])
  })

  it('fills in a stable order whatever order the species arrive in', () => {
    const calcNames = indexCalcNames({ 'fake-a': '甲', 'fake-b': '乙' })
    const forward = fillFormeNames({
      names: {},
      species: [species('Fake-A', 'Fake', 'A'), species('Fake-B', 'Fake', 'B')],
      calcNames,
    })
    const backward = fillFormeNames({
      names: {},
      species: [species('Fake-B', 'Fake', 'B'), species('Fake-A', 'Fake', 'A')],
      calcNames,
    })

    expect(Object.keys(forward.names)).toEqual(Object.keys(backward.names))
  })
})

describe('the committed table, against the sources that outrank the calculator', () => {
  // The gap-filler runs last and only into holes. These two are the measured
  // proof of why: the calculator's file says `超能艷鴕`, and the official
  // Pokédex says `超能豔鴕`. If a future change lets it overwrite, this is
  // where that shows up rather than on screen.
  it("still carries the official Pokédex strings, not the calculator's", () => {
    expect((zhHant as Record<string, string>).espathra).toBe('超能豔鴕')
    expect((zhHant as Record<string, string>).kingambit).toBe('仆斬將軍')
  })

  it('names the formes a gen 9 battle actually puts on screen', () => {
    // The timeline draws the forme a Pokémon is *in*, so these are on screen
    // every game a team brings them — the whole reason issue #115 exists.
    const table = zhHant as Record<string, string>

    expect(table.ogerponwellspring).toBe('厄鬼椪（水井面具）')
    expect(table.palafinhero).toBe('海豚俠（全能形態）')
    expect(table.terapagosterastal).toBe('太樂巴戈斯（太晶形態）')
    expect(table.indeedeef).toBe('愛管侍（母）')
  })

  it('left out the calculator entry that would name two Pokémon alike', () => {
    // `Avalugg-Hisui` is `冰岩怪` there — plain `Avalugg`'s own name, the forme
    // descriptor missing.
    expect(zhHant).not.toHaveProperty('avalugghisui')
  })
})
