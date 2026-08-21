import { describe, expect, it } from 'vitest'
import { speciesName } from '../../app/utils/speciesName'
import { speciesIcon } from '../../app/utils/speciesIcon'
import names from '../../app/lib/dex/species-names.json'
import icons from '../../app/lib/dex/species-icons.json'
import pkg from '../../package.json'
import en from '../../i18n/locales/en.json'
import zhTW from '../../i18n/locales/zh-TW.json'

/**
 * The ids `toID()` cannot be reversed by any string rule -- the reason this
 * table exists at all. `hooh` is the clearest case: nothing about the id says
 * where the hyphen goes.
 */
const HARD_IDS = {
  hooh: 'Ho-Oh',
  farfetchd: 'Farfetch’d',
  mrmime: 'Mr. Mime',
  typenull: 'Type: Null',
  flabebe: 'Flabébé',
  porygonz: 'Porygon-Z',
  basculegionf: 'Basculegion-F',
}

describe('speciesName', () => {
  for (const [id, name] of Object.entries(HARD_IDS)) {
    it(`turns ${id} into ${name}`, () => {
      expect(speciesName(id)).toBe(name)
    })
  }

  it('spells Farfetch’d with a right single quotation mark, not an ASCII apostrophe', () => {
    // Showdown's own data uses U+2019. An ASCII apostrophe here would read as
    // correct on screen and never match anything the parser produced.
    expect(speciesName('farfetchd')).toContain('’')
    expect(speciesName('farfetchd')).not.toContain("'")
  })

  it('returns an id it does not know unchanged', () => {
    // A new generation, or a forme a new format introduces, leaves the table
    // behind. Showing the raw id is readable and diagnosable; guessing at a
    // name would be silently wrong, and throwing would take the dashboard
    // down over a cosmetic gap.
    expect(speciesName('notapokemon')).toBe('notapokemon')
  })

  it('does not titlecase, hyphenate or otherwise dress up an unknown id', () => {
    expect(speciesName('somenewpokemonex')).toBe('somenewpokemonex')
  })
})

describe('speciesIcon', () => {
  it('places Bulbasaur, the first slot on the sheet after the placeholder', () => {
    // One icon is 40x30 and the sheet is 12 wide, so dex number 1 sits one
    // cell right of the origin. The values are the CSS background-position
    // directly, hence negative.
    expect(speciesIcon('bulbasaur')).toEqual({ left: -40, top: 0 })
  })

  it('places Ho-Oh at the slot its dex number gives it', () => {
    // 250 = row 20, column 10.
    expect(speciesIcon('hooh')).toEqual({ left: -400, top: -600 })
  })

  it('gives a regional forme its own slot, not its base species one', () => {
    // Ninetales-Alola shares dex number 38 with Ninetales, so a slot derived
    // from the dex number would show the wrong Pokémon. Showdown keeps formes
    // in a separate range of the sheet.
    expect(speciesIcon('ninetalesalola')).toEqual({ left: -200, top: -2880 })
    expect(speciesIcon('ninetalesalola')).not.toEqual(speciesIcon('ninetales'))
  })

  it('gives a Mega and its base species different slots', () => {
    expect(speciesIcon('charizardmegax')).toEqual({ left: -40, top: -3300 })
    expect(speciesIcon('charizardmegax')).not.toEqual(speciesIcon('charizard'))
  })

  it('gives Floette-Eternal its own slot', () => {
    // The signature in a real Champions battle carries this id.
    expect(speciesIcon('floetteeternal')).toEqual({ left: -80, top: -2820 })
    expect(speciesIcon('floetteeternal')).not.toEqual(speciesIcon('floette'))
  })

  it('falls back to the sheet placeholder for an id it does not know', () => {
    // Slot 0 is Showdown's own unknown-Pokémon icon, so an id the table has
    // not caught up with draws a placeholder rather than a broken image.
    expect(speciesIcon('notapokemon')).toEqual({ left: 0, top: 0 })
  })
})

describe('the generated tables', () => {
  it('are flat objects keyed by id', () => {
    for (const table of [names, icons]) {
      for (const [id, value] of Object.entries(table)) {
        expect(id).toMatch(/^[a-z0-9]+$/)
        expect(Array.isArray(value) || typeof value === 'string').toBe(true)
      }
    }
  })

  it('spell accented names composed, the form a keyboard produces', () => {
    // Showdown's own data has Flabébé decomposed (e + U+0301). The two forms
    // look identical and compare unequal, so the generator pins one.
    for (const [id, name] of Object.entries(names)) {
      expect(name, id).toBe(name.normalize('NFC'))
    }
  })

  it('cover the same ids, because one walk produces both', () => {
    // Two walks could drift: an id in one table and not the other would show
    // a name with no icon, or an icon with no name.
    expect(Object.keys(icons)).toEqual(Object.keys(names))
  })

  it('hold every species Showdown knows, not a hand-picked subset', () => {
    // @pkmn/dex@0.10.11 has 1517 species with `exists` true. An exact
    // assertion would break on every dex bump; this catches a generator that
    // silently emitted a fraction of them.
    expect(Object.keys(names).length).toBeGreaterThan(1400)
  })

  it('store icon slots as two non-positive multiples of the cell size', () => {
    for (const [id, slot] of Object.entries(icons)) {
      expect(slot, id).toHaveLength(2)
      const [left, top] = slot as [number, number]
      expect(Math.abs(left % 40), id).toBe(0)
      expect(Math.abs(top % 30), id).toBe(0)
      expect(left, id).toBeLessThanOrEqual(0)
      expect(top, id).toBeLessThanOrEqual(0)
    }
  })
})

describe('where the dex data is allowed to live', () => {
  it('keeps @pkmn/dex out of runtime dependencies', () => {
    // It is a build-time source, and a 3MB dex has no business in the bundle.
    expect(pkg.dependencies).not.toHaveProperty('@pkmn/dex')
    expect(pkg.devDependencies).toHaveProperty('@pkmn/dex')
  })

  it('keeps @pkmn/img out of runtime dependencies', () => {
    expect(pkg.dependencies).not.toHaveProperty('@pkmn/img')
    expect(pkg.devDependencies).toHaveProperty('@pkmn/img')
  })

  it('keeps Pokémon names out of the i18n locales', () => {
    // Design document §3: a species name is an identifier, not copy. It is
    // English everywhere and never passes through a translation file.
    const locales = JSON.stringify([en, zhTW])
    for (const name of ['Ho-Oh', 'Pikachu', 'Farfetch', 'Flabébé', 'Basculegion']) {
      expect(locales).not.toContain(name)
    }
  })
})

describe('the display layer wiring', () => {
  it('registers both helpers as Nuxt auto-imports', async () => {
    // What `app/utils/` buys over `app/lib/`: a component can call these
    // without an import line. If that stops being true, every consuming
    // template breaks at once.
    const { speciesName: auto, speciesIcon: autoIcon } = await import('#imports')

    expect(auto('hooh')).toBe('Ho-Oh')
    expect(autoIcon('hooh')).toEqual({ left: -400, top: -600 })
  })
})
