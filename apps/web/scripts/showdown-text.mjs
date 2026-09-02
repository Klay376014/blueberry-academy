/**
 * How Showdown's `data/text/zh-tw/*.ts` files are read, in one place.
 *
 * These are somebody else's TypeScript rather than a data format, so every
 * reader of them needs the same three defences, and three of #103's
 * generators need a reader. `gen-move-names-zh-hant.mjs` still has its own
 * copy: it is being edited on the #110 branch at the same time, and one merge
 * conflict is worth less than the duplication is (see
 * docs/adr/0016-localised-battle-vocabulary.md).
 *
 * Plain ESM rather than TypeScript on purpose -- it runs under bare `node`
 * with no build step or loader.
 *
 * Upstream copyright, retained as the licence requires:
 * - Pokémon Showdown, MIT. Copyright (c) 2011-2026 Guangcong Luo and other
 *   contributors. https://github.com/smogon/pokemon-showdown/blob/master/LICENSE
 * Pokémon and Pokémon character names are trademarks of Nintendo.
 */

/** Showdown @ 2026-09-02, the ref ADR-0015's move table pins and the research note measured. */
export const SHOWDOWN_REF = '2f5b273925862ac242b419086c1e7a8868b51da1'
export const SHOWDOWN_TEXT = `https://raw.githubusercontent.com/smogon/pokemon-showdown/${SHOWDOWN_REF}/data/text/zh-tw/`

/** One of Showdown's zh-tw text files, as source. */
export async function fetchShowdownText(file) {
  const response = await fetch(`${SHOWDOWN_TEXT}${file}`)
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`)

  return await response.text()
}

/**
 * `id -> name` out of one of Showdown's `data/text/zh-tw/*.ts` files.
 *
 * Scanned line by line rather than by matching an entry's whole body: a
 * non-greedy body match over-counts, because a body occasionally swallows the
 * entry after it (research note §4.1). An entry whose name is annotated
 * `NEEDS QC` is dropped -- upstream marks its machine-translated strings that
 * way (§4.5), and this project's whole position is that a guessed name is
 * worse than an English one.
 *
 * `field` is which name to take: `name` for the moves/abilities/items files,
 * `weatherName` for `default.ts`, where the weather's own row carries the
 * state's name alongside the sentences.
 *
 * The two floors are independent, and each sees a failure the other cannot: an
 * entry pattern that stops matching takes the whole table with it, and a name
 * line reformatted upstream leaves every entry still found and every name
 * gone. Both sit under the measured counts on purpose -- an exact pin would
 * turn the `NEEDS QC` rule, which is meant to cost a few names, into a throw
 * the first time upstream lands one.
 */
export function scanShowdownNames(source, { file, field = 'name', entryFloor, nameFloor }) {
  /** @type {Record<string, string>} */
  const names = {}
  let entries = 0
  let id = null

  // A key that does not start with a letter is quoted upstream
  // (`"10000000voltthunderbolt"`), which is exactly the entry a letters-only
  // pattern would drop.
  const opening = /^\t"?([a-z0-9]+)"?: \{/
  const named = new RegExp(`^\\t\\t${field}: "([^"]+)",(.*)$`)

  for (const line of source.split('\n')) {
    const open = opening.exec(line)
    if (open) {
      id = open[1]
      entries += 1
      continue
    }
    if (id === null) continue

    const hit = named.exec(line)
    if (hit && !hit[2].includes('NEEDS QC')) names[id] = hit[1]
  }

  if (entries < entryFloor) {
    throw new Error(`${file}: scanned ${entries} entries, expected at least ${entryFloor}`)
  }

  const captured = Object.keys(names).length
  if (captured < nameFloor) {
    throw new Error(
      `${file}: scanned ${entries} entries but captured only ${captured} ${field} values, ` +
        `expected at least ${nameFloor}`,
    )
  }

  return names
}

/**
 * `id -> name` out of one of `names.ts`'s exported records, e.g. `StatNames`.
 *
 * A different shape from the per-entry files: one `export const` object of
 * `id: "name"` pairs, several to a line. Entries whose value is `null` are
 * upstream saying it has no translation -- measured, every one of
 * `StatusNames`' eight is `null` -- and are left out rather than defaulted,
 * which is what makes "there is no official word for `brn`" visible here
 * instead of guessed at.
 */
export function scanShowdownRecord(source, { file, record, floor }) {
  const start = source.indexOf(`export const ${record}`)
  if (start === -1) throw new Error(`${file}: no export named ${record}`)

  const open = source.indexOf('{', start)
  const end = source.indexOf('\n};', open)
  if (open === -1 || end === -1) throw new Error(`${file}: ${record} is not a braced object`)

  const body = source.slice(open + 1, end)
  /** @type {Record<string, string>} */
  const names = {}

  for (const [, id, name] of body.matchAll(/([a-z0-9]+): "([^"]*)"/g)) names[id] = name

  const captured = Object.keys(names).length
  if (captured < floor) {
    throw new Error(`${file}: ${record} gave ${captured} names, expected at least ${floor}`)
  }

  return names
}

/**
 * One entry per line, matching the other generated name tables so all of them
 * diff alike.
 *
 * @param {Record<string, string>} names
 */
export function serialise(names) {
  const lines = Object.entries(names).map(
    ([id, name]) => `  ${JSON.stringify(id)}: ${JSON.stringify(name)}`,
  )

  return `{\n${lines.join(',\n')}\n}\n`
}
