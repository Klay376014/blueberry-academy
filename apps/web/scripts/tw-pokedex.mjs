/**
 * The one fetch of the official Taiwan Pokédex, and how its page is read.
 *
 * Extracted from `verify-species-names-zh-hant.mjs` so #103's ability verifier
 * widens the existing reader rather than adding a second fetcher of the same
 * page. Both verifiers are manual, networked steps -- nothing in
 * `vp run -r test:unit` reaches this file (ADR-0014's rule: what fetches lives
 * in a script).
 *
 * **This page is a verifier, never a source.** Its terms of use forbid
 * copying, modifying, publishing and redistributing its content, so none of
 * its strings are committed to this repository. What may be committed is the
 * handful of ids where a source disagrees with it, which is a bug report and
 * not a copy of the dataset. See docs/adr/0014-localised-species-names.md.
 *
 * Plain ESM rather than TypeScript on purpose -- it runs under bare `node`
 * with no build step or loader.
 */

/**
 * The list page carries every name, so this is one request rather than one per
 * record. `/play/pokedex` answers 308 to `/pokedex/`, so the redirect has to
 * be followed -- not following it returns 9 bytes and an empty diff that looks
 * exactly like a pass. The count assertions each caller makes are what make
 * that impossible.
 */
const PORTAL = 'https://tw.portal-pokemon.com/play/pokedex'

/** A browserless UA gets a different response; this is the one measured. */
const UA = 'Mozilla/5.0'

/**
 * The page is a Next.js App Router document with no JSON API: the data is
 * inside `self.__next_f.push(...)` calls as an escaped RSC payload, so the
 * quotes are `\"`.
 */
const SPECIES =
  /\\?"zukan_id\\?":\\?"(\d{4})\\?",\\?"zukan_sub_id\\?":(\d+),\\?"pokemon_name\\?":\\?"([^"\\]+)\\?"/g

/**
 * The ability records on the same page. The key is the ability's English name
 * lowercased with its spaces kept (`air lock`, `teraform zero`), which is one
 * `toID()` away from the id every table here is keyed by.
 */
const ABILITY =
  /\\?"pokemon_ability_id\\?":\\?"([^"\\]+)\\?",\\?"pokemon_ability_name\\?":\\?"([^"\\]+)\\?"/g

/**
 * One GET, parsed into the two things the page has an opinion about.
 *
 * Formes are not among them: every forme record (`zukan_sub_id != 0`) repeats
 * its base species' `pokemon_name`, so the page says nothing about forme
 * names. It carries no moves and no items at all (measured:
 * `pokemon_item_id` and `pokemon_move_id` occur zero times), which is why the
 * move and item tables have no authority to be checked against.
 */
export async function fetchTwPokedex() {
  const response = await fetch(PORTAL, { headers: { 'user-agent': UA }, redirect: 'follow' })
  if (!response.ok) throw new Error(`${response.url}: HTTP ${response.status}`)

  const html = await response.text()

  /** Dex number -> official name, base species only. */
  const species = new Map()
  for (const [, zukanId, subId, name] of html.matchAll(SPECIES)) {
    if (subId === '0') species.set(Number(zukanId), name)
  }

  /** Lowercased English ability name -> official name. */
  const abilities = new Map()
  for (const [, id, name] of html.matchAll(ABILITY)) abilities.set(id, name)

  return { url: response.url, bytes: html.length, species, abilities }
}
