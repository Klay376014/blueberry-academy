import { describe, expect, it } from 'vitest'
import { Dex } from '@pkmn/dex'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import SpeciesParty from '../../app/shared/components/SpeciesParty.vue'
import { speciesIcon } from '../../app/shared/utils/speciesIcon'
import { speciesDisplayName, speciesLabel, speciesName } from '../../app/shared/utils/speciesName'
import zhHant from '../../app/shared/lib/dex/species-names-zh-hant.json'
import names from '../../app/shared/lib/dex/species-names.json'

/**
 * The lookup seam every localised name goes through, and the shape of the
 * table behind it. What the timeline does with it is
 * `app/features/timeline/test/localised-names.spec.ts`.
 *
 * See docs/adr/0014-localised-species-names.md.
 */

/** Official zh-Hant names, one per shape the generator can produce. */
const OFFICIAL = {
  // A base species: PokéAPI's `pokemon_species_names`, verbatim.
  pikachu: '皮卡丘',
  hooh: '鳳王',
  // A Mega: the forme row is already a complete name.
  charizardmegax: '超級噴火龍Ｘ',
  // A regional forme: the forme row names the forme only, so the species
  // carries it in brackets the way the games show it.
  ninetalesalola: '九尾（阿羅拉的樣子）',
  landorustherian: '土地雲（靈獸形態）',
  // The two the official Taiwan Pokédex disagreed with PokéAPI on, pinned to
  // the Pokédex's own strings: `仆刀將軍` was the mainland name in Traditional
  // glyphs, `超能艷鴕` a commoner glyph for the same word. Both come from
  // `scripts/species-names-zh-hant-official.mjs`, and `verify:species-names-zh-hant`
  // is what would catch a third one — see docs/adr/0014-localised-species-names.md.
  kingambit: '仆斬將軍',
  espathra: '超能豔鴕',
}

/**
 * A species none of the three sources reaches. It used to be
 * `ogerponwellspring`, until the calculator's table filled that one in (issue
 * #115); what is left in this position is a forme no source names at all --
 * Arceus' 17 type formes, Vivillon's patterns, the Gmax and Totem formes.
 */
const UNTRANSLATED = 'necrozmaduskmane'

describe('speciesDisplayName', () => {
  for (const [id, name] of Object.entries(OFFICIAL)) {
    it(`shows ${id} as ${name} in zh-TW`, () => {
      expect(speciesDisplayName(id, 'zh-TW')).toBe(name)
    })
  }

  it('leaves en on the English table', () => {
    for (const id of Object.keys(OFFICIAL)) {
      expect(speciesDisplayName(id, 'en')).toBe(speciesName(id))
    }
  })

  it('reads English for a locale that has no name table', () => {
    // A locale added to nuxt.config before its table is generated shows
    // English rather than nothing.
    expect(speciesDisplayName('pikachu', 'ja')).toBe('Pikachu')
  })

  it('falls back to the English name for an id the locale table has not reached', () => {
    expect(speciesDisplayName(UNTRANSLATED, 'zh-TW')).toBe('Necrozma-Dusk-Mane')
  })

  it('falls back to the raw id when neither table knows it', () => {
    // The raw id is the instruction to re-run the generators; a guessed
    // translation would be silently wrong.
    expect(speciesDisplayName('notapokemon', 'zh-TW')).toBe('notapokemon')
  })
})

describe('speciesLabel', () => {
  it('is the English name alone in en', () => {
    expect(speciesLabel('pikachu', 'en')).toBe('Pikachu')
  })

  it('keeps the English name beside the localised one', () => {
    // The English name is what Showdown itself shows, so it stays reachable
    // for anyone comparing the two screens.
    expect(speciesLabel('pikachu', 'zh-TW')).toBe('皮卡丘 · Pikachu')
  })

  it('does not say the same name twice when there is no translation', () => {
    expect(speciesLabel(UNTRANSLATED, 'zh-TW')).toBe('Necrozma-Dusk-Mane')
  })
})

describe('the generated zh-Hant table', () => {
  const entries = Object.entries(zhHant as Record<string, string>)

  it('is a flat object keyed by Showdown id', () => {
    for (const [id, name] of entries) {
      expect(id).toMatch(/^[a-z0-9]+$/)
      expect(typeof name).toBe('string')
      expect(name.length).toBeGreaterThan(0)
    }
  })

  it('names only ids the English table also has', () => {
    // Both generators walk the same dex. An id here and not there would show a
    // Chinese name with no English one to fall back to.
    for (const [id] of entries) expect(names).toHaveProperty(id)
  })

  it('is sorted by id, so a source update reads as a diff', () => {
    const ids = entries.map(([id]) => id)
    expect(ids).toEqual([...ids].sort())
  })

  it('spells names composed, the form a keyboard produces', () => {
    for (const [id, name] of entries) expect(name, id).toBe(name.normalize('NFC'))
  })

  it('covers every base species, not a count that formes could stand in for', () => {
    // PokéAPI carries zh-Hant for all 1025 base species, so every one of them
    // has to be here. Counting `entries` instead would let base coverage
    // collapse while forme coverage grew: the table holds both.
    const missing = Dex.species
      .all()
      .filter((species) => species.exists && species.num > 0 && !species.forme)
      .filter((species) => !(species.id in zhHant))
      .map((species) => species.name)

    expect(missing).toEqual([])
  })

  it('names no forme twice, which is how a composed name goes wrong', () => {
    // `Darmanitan-Galar-Zen` used to come out as `達摩狒狒（達摩模式）` —
    // Unovan Darmanitan-Zen's name exactly, because the bracket carried the
    // mode and dropped the region. Two ids sharing one value is what that
    // looks like from here.
    const seen = new Map<string, string>()

    for (const [id, name] of entries) {
      expect(seen.get(name), `${seen.get(name)} and ${id} share a name`).toBeUndefined()
      seen.set(name, id)
    }
  })

  it('holds no English name', () => {
    // A row that came out as `Pikachu` would mean the generator matched the
    // wrong column and the fallback would never fire for it.
    for (const [id, name] of entries) {
      expect(name, id).not.toBe(names[id as keyof typeof names])
    }
  })
})

/**
 * The row of six above the timeline. Its label follows the reader's locale for
 * the same reason the timeline does — `BattleDrawer` draws the two together,
 * and a screen reader that heard `Pikachu` here and `皮卡丘` a line down would
 * be describing one battle in two languages.
 *
 * What does not move: `signature` is still the stored ids, and nothing about
 * team grouping reads this label.
 */
describe('SpeciesParty', () => {
  const signature = 'pikachu|ninetalesalola'

  it('reads the party out in English in en, unchanged', async () => {
    const wrapper = await mountSuspended(SpeciesParty, { props: { signature }, route: '/' })

    expect(wrapper.attributes('aria-label')).toBe('Pikachu, Ninetales-Alola')
    expect(wrapper.findAll('[title]').map((icon) => icon.attributes('title'))).toEqual([
      'Pikachu',
      'Ninetales-Alola',
    ])
  })

  it('reads it out in Chinese in zh-TW', async () => {
    const wrapper = await mountSuspended(SpeciesParty, { props: { signature }, route: '/zh-TW/' })

    expect(wrapper.attributes('aria-label')).toBe('皮卡丘, 九尾（阿羅拉的樣子）')
  })

  it('puts the localised name inside the localised copy for one that stayed home', async () => {
    const wrapper = await mountSuspended(SpeciesParty, {
      props: { signature, bring: 'pikachu' },
      route: '/zh-TW/',
    })

    expect(wrapper.attributes('aria-label')).toBe('皮卡丘, 九尾（阿羅拉的樣子）（未出場）')
  })

  it('still looks everything else up by id, whatever the locale', async () => {
    // The label is display text; the ids behind it are the stored column, and
    // team grouping is keyed on those (CONTEXT.md, ADR-0014). The icon sheet is
    // the visible proof: a localised name reaching the icon lookup would land
    // on slot 0, Showdown's unknown-Pokémon placeholder.
    const wrapper = await mountSuspended(SpeciesParty, { props: { signature }, route: '/zh-TW/' })
    const { left, top } = speciesIcon('ninetalesalola')

    expect(wrapper.html()).toContain(`background-position: ${left}px ${top}px`)
  })
})
