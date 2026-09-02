import { describe, expect, it } from 'vitest'
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
}

/**
 * A species the official zh-Hant data does not reach. Every gen 9 forme is in
 * this position, so it is the common case rather than a curiosity.
 */
const UNTRANSLATED = 'ogerponwellspring'

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
    expect(speciesDisplayName(UNTRANSLATED, 'zh-TW')).toBe('Ogerpon-Wellspring')
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
    expect(speciesLabel('pikachu', 'zh-TW')).toBe('皮卡丘 (Pikachu)')
  })

  it('does not say the same name twice when there is no translation', () => {
    expect(speciesLabel(UNTRANSLATED, 'zh-TW')).toBe('Ogerpon-Wellspring')
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

  it('covers every base species the official data names', () => {
    // PokéAPI carries zh-Hant for all 1025 species. Formes are the gap, and
    // the fallback is what covers them.
    expect(entries.length).toBeGreaterThan(1025)
  })

  it('holds no English name', () => {
    // A row that came out as `Pikachu` would mean the generator matched the
    // wrong column and the fallback would never fire for it.
    for (const [id, name] of entries) {
      expect(name, id).not.toBe(names[id as keyof typeof names])
    }
  })
})
