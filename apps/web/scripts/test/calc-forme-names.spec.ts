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
  it('rekeys the calculator table by Showdown id form, keeping its own words', () => {
    expect(indexCalcNames({ 'ogerpon-wellspring-mask': '厄鬼椪（水井面具）' })).toEqual({
      ogerponwellspringmask: {
        name: '厄鬼椪（水井面具）',
        segments: ['ogerpon', 'wellspring', 'mask'],
      },
    })
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

  // `Darmanitan-Galar` used to match both `darmanitan-galar-standard` and
  // `darmanitan-galar-zen`, go unresolved for being ambiguous, and leave a
  // zh-TW screen showing an English base forme beside a Chinese Zen one. The
  // `-zen` key is not ambiguous evidence: another species answers to it.
  it('ignores a candidate key that is some other species own id', () => {
    const filled = fillFormeNames({
      names: {},
      species: [
        species('Darmanitan-Galar', 'Darmanitan', 'Galar'),
        species('Darmanitan-Galar-Zen', 'Darmanitan', 'Galar-Zen'),
      ],
      calcNames: indexCalcNames({
        'darmanitan-galar-standard': '達摩狒狒（伽勒爾的樣子）',
        'darmanitan-galar-zen': '達摩狒狒（達摩模式-伽勒爾）',
      }),
    })

    expect(filled.names).toEqual({
      darmanitangalar: '達摩狒狒（伽勒爾的樣子）',
      darmanitangalarzen: '達摩狒狒（達摩模式-伽勒爾）',
    })
    expect(filled.unresolved).toEqual([])
  })

  // `Meowstic-M-Mega`'s `m` used to match plain `meowstic-mega` on a substring
  // -- a different Pokémon's entry, and its sibling `Meowstic-F-Mega` matched
  // nothing, so the pair came out half translated.
  it('matches a forme word as a whole word, not as a substring', () => {
    const filled = fillFormeNames({
      names: {},
      species: [species('Meowstic-M-Mega', 'Meowstic', 'M-Mega')],
      calcNames: indexCalcNames({ 'meowstic-mega': '超級超能妙喵' }),
    })

    expect(filled.names).toEqual({})
    expect(filled.unresolved).toEqual(['Meowstic-M-Mega'])
  })

  // Gender is the only forme Showdown spells with one letter, and one letter is
  // what a whole-word rule cannot match against a spelled-out key.
  it('reads the gender formes single letter as the word the calculator spells', () => {
    const filled = fillFormeNames({
      names: {},
      species: [species('Indeedee-F', 'Indeedee', 'F')],
      calcNames: indexCalcNames({
        'indeedee-male': '愛管侍（公）',
        'indeedee-female': '愛管侍（母）',
      }),
    })

    expect(filled.names).toEqual({ indeedeef: '愛管侍（母）' })
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
    //
    // These assertions hold on the committed table, which was generated with
    // the sibling checkout present. Regenerating without it drops all 80
    // gap-filled ids, so the message says that rather than leaving a bare data
    // mismatch to be puzzled over.
    const regenerate =
      'missing — was the table regenerated without PokemonTool-DamageCalculator? ' +
      'See docs/adr/0014-localised-species-names.md'
    const table = zhHant as Record<string, string>

    expect(table.ogerponwellspring, regenerate).toBe('厄鬼椪（水井面具）')
    expect(table.palafinhero, regenerate).toBe('海豚俠（全能形態）')
    expect(table.terapagosterastal, regenerate).toBe('太樂巴戈斯（太晶形態）')
    expect(table.indeedeef, regenerate).toBe('愛管侍（母）')
  })

  it('names both halves of a forme family or neither', () => {
    // `Darmanitan-Galar` used to be English beside a Chinese
    // `Darmanitan-Galar-Zen`: the matching rule declared the plain forme
    // ambiguous because the Zen key also matched it. Even is the invariant —
    // ADR-0014's "缺得整齊，比缺得像對的好".
    const table = zhHant as Record<string, string>

    expect('darmanitangalar' in table).toBe('darmanitangalarzen' in table)
    expect('meowsticfmega' in table).toBe('meowsticmmega' in table)
  })

  it('left out the calculator entry that would name two Pokémon alike', () => {
    // `Avalugg-Hisui` is `冰岩怪` there — plain `Avalugg`'s own name, the forme
    // descriptor missing.
    expect(zhHant).not.toHaveProperty('avalugghisui')
  })
})
