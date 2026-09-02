/**
 * Species whose zh-Hant name in PokéAPI is *not* the string the official
 * Taiwan Pokédex publishes, with the official string and the page it was read
 * from. `gen-species-names-zh-hant.mjs` substitutes these into PokéAPI's data
 * before it composes anything, so a re-run cannot revert them.
 *
 * **Every `name` here is an official string copied byte for byte from the page
 * named in `source`.** Nothing in this file is translated, transliterated,
 * glyph-converted or otherwise produced by this project: no name may be added
 * to this table without an official Pokédex URL that shows it. See
 * docs/adr/0014-localised-species-names.md ("官方圖鑑逐位元組相符" and the
 * provenance correction under it).
 *
 * `pnpm --filter web verify:species-names-zh-hant` is what finds entries for
 * this table -- it diffs all 1025 base species against the official Pokédex.
 *
 * Measured 2026-09-02 (`curl -sSL -A "Mozilla/5.0" …`, note the 308 from
 * `/play/pokedex/…`):
 *
 *   #0956 <title>超能豔鴕 | Pokédex | 台灣寶可夢官方網站</title>
 *   #0983 <title>仆斬將軍 | Pokédex | 台灣寶可夢官方網站</title>
 *
 * PokéAPI has `超能艷鴕` and `仆刀將軍` for the two. They differ in kind, and
 * only the second is a wrong word: `艷`/`豔` are semantic variants of one
 * character through `艶` (Unihan `kSemanticVariant`), while `刀` and `斬` have
 * no variant relation at all -- PokéAPI's zh-Hant value there is its own
 * zh-Hans `仆刀将军` in Traditional glyphs, which is the mainland name and
 * exactly what ADR-0014 refuses. Both are corrected, because the rule is that
 * the official string wins character for character.
 */

/**
 * Showdown id -> the official Taiwan Pokédex name and its evidence.
 *
 * `zukanId` is the national dex number as the Pokédex spells it, and the
 * generator checks it against `@pkmn/dex`'s number for the id -- so an entry
 * whose evidence URL points at a different Pokémon fails the run instead of
 * quietly renaming the wrong species.
 *
 * @type {Record<string, { name: string, zukanId: string, source: string }>}
 */
export const OFFICIAL_ZH_HANT_NAMES = {
  espathra: {
    name: '超能豔鴕',
    zukanId: '0956',
    source: 'https://tw.portal-pokemon.com/pokedex/0956',
  },
  kingambit: {
    name: '仆斬將軍',
    zukanId: '0983',
    source: 'https://tw.portal-pokemon.com/pokedex/0983',
  },
}
