/**
 * Fills the forme-name holes PokéAPI leaves, out of the zh-Hant table in the
 * sibling project `PokemonTool-DamageCalculator` (issue #115).
 *
 * Why a third source at all: PokéAPI's zh-Hant *forme* column effectively
 * stops around gen 8, so 107 formes a gen-9 battle can put on screen fall
 * back to English -- and the timeline draws the forme a Pokémon is *in*, so a
 * team with Ogerpon shows `Ogerpon-Wellspring` every single game.
 *
 * Its standing in the precedence order, and why it is last:
 * docs/adr/0014-localised-species-names.md. In short -- it is the repo owner's
 * own hand-maintained file with no recorded provenance, so it is neither the
 * authority (the official Taiwan Pokédex) nor a publication of official
 * strings (PokéAPI). It is used only where both of those have nothing, and it
 * never overwrites a name they gave.
 *
 * It is read from where it lives rather than vendored in: it belongs to
 * another project on the same machine, and copying it here would fork it. A
 * generator run without it still succeeds -- those formes stay English -- so
 * anyone without that checkout can still regenerate the table.
 *
 * Plain ESM rather than TypeScript on purpose -- its caller runs under bare
 * `node` with no build step or loader.
 */

/** The id form Showdown uses, so the calculator's keys can be matched to it. */
const toId = (text) => text.toLowerCase().replaceAll(/[^a-z0-9]+/g, '')

/**
 * The calculator's table, rekeyed into Showdown's id form.
 *
 * @param {Record<string, string>} table
 * @returns {Record<string, string>}
 */
export function indexCalcNames(table) {
  /** @type {Record<string, string>} */
  const indexed = {}
  for (const [key, name] of Object.entries(table)) indexed[toId(key)] = name

  return indexed
}

/**
 * The two tables key formes differently -- Showdown's `ogerponwellspring`
 * against `@smogon/calc`'s `ogerpon-wellspring-mask`, `indeedeef` against
 * `indeedee-female` -- and no rule turns one into the other. So a candidate is
 * any key starting with the base species, and the forme's own words are what
 * pick one out of them: every word must appear, and exactly one key may match.
 *
 * Two keys matching, or none, means this script cannot say which name belongs
 * to this forme -- and a wrong name is the outcome ADR-0014 exists to refuse,
 * so it reports the forme instead of choosing. `Necrozma-Dusk-Mane` is the
 * measured example of "none": the calculator calls it `necrozma-dusk`, and
 * `mane` appears in no key at all.
 *
 * @param {string} id
 * @param {string} name
 * @param {string} baseSpecies
 * @param {string} forme
 * @param {Record<string, string>} calcNames
 * @returns {string | null}
 */
function keyFor(id, name, baseSpecies, forme, calcNames) {
  if (calcNames[id] !== undefined) return id

  const base = toId(baseSpecies)
  const words = forme.split('-').map(toId).filter(Boolean)
  if (words.length === 0) return null

  const matches = Object.keys(calcNames)
    .filter((key) => key.startsWith(base) && words.every((word) => key.includes(word)))
    .sort()

  return matches.length === 1 ? matches[0] : null
}

/**
 * The names to add to a table, and what was left out of it.
 *
 * `names` is only read, never written: the caller merges. A name already in
 * the table wins outright -- the calculator's file is the one that is wrong
 * about Espathra (`超能艷鴕` against the Pokédex's `超能豔鴕`), so "fill the
 * holes" has to mean only that.
 *
 * A name another Pokémon already answers to is dropped rather than added.
 * `Avalugg-Hisui` is `冰岩怪` in that file -- the base species' own name, the
 * forme descriptor missing -- and taking it would put one name on two
 * different Pokémon, which is exactly what `Darmanitan-Galar-Zen` is skipped
 * for in the generator. Measured: it is the only entry that collides.
 *
 * @param {object} input
 * @param {Record<string, string>} input.names names the earlier sources gave
 * @param {{ id: string, name: string, baseSpecies: string, forme: string }[]} input.species
 * @param {Record<string, string>} input.calcNames
 */
export function fillFormeNames({ names, species, calcNames }) {
  /** @type {Record<string, string>} */
  const filled = {}
  /** @type {{ name: string, clash: string }[]} */
  const collided = []
  /** @type {string[]} */
  const unresolved = []

  // Sorted so the run is a function of its inputs rather than of the order
  // they arrive in: which of two formes wanting one name gets it is otherwise
  // whichever the dex happened to list first.
  const wanted = species
    .filter((s) => names[s.id] === undefined)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const taken = new Set(Object.values(names))

  for (const s of wanted) {
    const key = keyFor(s.id, s.name, s.baseSpecies, s.forme, calcNames)
    if (key === null) {
      unresolved.push(s.name)
      continue
    }

    const name = calcNames[key]
    if (taken.has(name)) {
      collided.push({ name: s.name, clash: name })
      continue
    }

    filled[s.id] = name
    taken.add(name)
  }

  return { names: filled, collided, unresolved }
}
