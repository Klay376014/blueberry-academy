/**
 * Fills the forme-name holes PokéAPI leaves, out of the zh-Hant table in the
 * sibling project `PokemonTool-DamageCalculator` (issue #115).
 *
 * Why a third source at all: PokéAPI's zh-Hant *forme* column effectively
 * stops around gen 8, so 220 formes a gen-9 battle can put on screen fell
 * back to English -- and the timeline draws the forme a Pokémon is *in*, so a
 * team with Ogerpon showed `Ogerpon-Wellspring` every single game.
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
 * Showdown spells the two gender formes with one letter and the calculator
 * spells them out. They are the only single-letter formes in the dex, and a
 * single letter is also the thing most likely to match a longer word by
 * accident -- `Meowstic-M-Mega`'s `m` used to pick up plain `meowstic-mega`,
 * which is a different Pokémon's entry.
 */
const WORD_ALIASES = { f: ['f', 'female'], m: ['m', 'male'] }

/**
 * The calculator's table, rekeyed into Showdown's id form and keeping the
 * words its own key was spelled with.
 *
 * The segments are the point: matching a forme against the flattened id makes
 * every short forme a substring hazard, and matching whole words is what makes
 * `mega` and `m` different questions.
 *
 * @param {Record<string, string>} table
 * @returns {Record<string, { name: string, segments: string[] }>}
 */
export function indexCalcNames(table) {
  /** @type {Record<string, { name: string, segments: string[] }>} */
  const indexed = {}
  for (const [key, name] of Object.entries(table)) {
    indexed[toId(key)] = {
      name,
      segments: key
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean),
    }
  }

  return indexed
}

/**
 * The two tables key formes differently -- Showdown's `ogerponwellspring`
 * against `@smogon/calc`'s `ogerpon-wellspring-mask`, `indeedeef` against
 * `indeedee-female` -- and no rule turns one into the other. So a candidate is
 * any key starting with the base species, and the forme's own words are what
 * pick one out: every word must appear **as a whole segment** of that key, and
 * exactly one candidate may match.
 *
 * A candidate that is some other species' own id is dropped first. Without
 * that, `Darmanitan-Galar` (forme `Galar`) matched both
 * `darmanitan-galar-standard` and `darmanitan-galar-zen`, went unresolved for
 * being ambiguous, and left a zh-TW screen showing an English
 * `Darmanitan-Galar` beside a Chinese Zen forme. The `-zen` key is not
 * ambiguous evidence -- it is spoken for.
 *
 * Two keys still matching, or none, means this script cannot say which name
 * belongs to this forme, and a wrong name is the outcome ADR-0014 exists to
 * refuse -- so it reports the forme instead of choosing. `Necrozma-Dusk-Mane`
 * is the measured example of "none": the calculator calls it `necrozma-dusk`,
 * and `mane` is in no key at all.
 *
 * @param {string} id
 * @param {string} baseSpecies
 * @param {string} forme
 * @param {Record<string, { name: string, segments: string[] }>} calcNames
 * @param {Set<string>} claimed every species id, so a key spoken for is skipped
 * @returns {string | null}
 */
function keyFor(id, baseSpecies, forme, calcNames, claimed) {
  if (calcNames[id] !== undefined) return id

  const base = toId(baseSpecies)
  const words = forme.split('-').map(toId).filter(Boolean)
  if (words.length === 0) return null

  const matches = Object.keys(calcNames)
    .filter((key) => key !== id && key.startsWith(base) && !claimed.has(key))
    .filter((key) => {
      const segments = new Set(calcNames[key].segments)

      return words.every((word) =>
        (WORD_ALIASES[word] ?? [word]).some((spelling) => segments.has(spelling)),
      )
    })
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
 * different Pokémon, which is exactly what `Darmanitan-Galar-Zen` used to be
 * skipped for in the generator. Measured, three entries are like this:
 * `Avalugg-Hisui`, `Eevee-Starter` and `Pikachu-Starter`.
 *
 * @param {object} input
 * @param {Record<string, string>} input.names names the earlier sources gave
 * @param {{ id: string, name: string, baseSpecies: string, forme: string }[]} input.species
 * @param {Record<string, { name: string, segments: string[] }>} input.calcNames
 */
export function fillFormeNames({ names, species, calcNames }) {
  /** @type {Record<string, string>} */
  const filled = {}
  /** @type {{ name: string, clash: string }[]} */
  const collided = []
  /** @type {string[]} */
  const unresolved = []

  /** Every id the dex knows, so a calc key that is one is left to its owner. */
  const claimed = new Set(species.map((s) => s.id))

  // Sorted so the run is a function of its inputs rather than of the order
  // they arrive in: which of two formes wanting one name gets it is otherwise
  // whichever the dex happened to list first.
  const wanted = species
    .filter((s) => names[s.id] === undefined)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const taken = new Set(Object.values(names))

  for (const s of wanted) {
    const key = keyFor(s.id, s.baseSpecies, s.forme, calcNames, claimed)
    if (key === null) {
      unresolved.push(s.name)
      continue
    }

    const { name } = calcNames[key]
    if (taken.has(name)) {
      collided.push({ name: s.name, clash: name })
      continue
    }

    filled[s.id] = name
    taken.add(name)
  }

  return { names: filled, collided, unresolved }
}
