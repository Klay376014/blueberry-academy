/**
 * How PokéAPI's `data/v2/csv/` tables are read, for every generator in this
 * directory. One implementation on purpose: it used to be two, and the naive
 * one silently truncated a quoted field (issue #110).
 *
 * Enough CSV for these tables: comma separated, `"`-quoted where a value
 * contains a comma, `""` for a literal quote inside one, no embedded newlines.
 *
 * The quoting is not hypothetical -- `move_names.csv` line 7907 at the ref
 * `gen-move-names-zh-hant.mjs` pins is `719,9,"10,000,000 Volt Thunderbolt"`,
 * and reading it on `split(',')` truncates the English name to `"10`, which
 * drops that move's PokéAPI row out of the join entirely. The species tables
 * carry no quoted row today -- measured over `pokemon_species_names.csv`,
 * `pokemon_form_names.csv` and `pokemon_forms.csv` -- which makes reading them
 * naively a latent bug rather than a live one.
 *
 * Plain ESM rather than TypeScript on purpose -- its callers run under bare
 * `node` with no build step or loader.
 */

/**
 * One CSV row into its fields. `where` names the row in the error a row that
 * ends inside a quote throws -- handing such a row on truncated is how a name
 * goes missing without anything failing.
 *
 * @param {string} row
 * @param {string} where
 * @returns {string[]}
 */
export function splitRow(row, where) {
  const cells = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index]

    if (quoted) {
      if (char !== '"') {
        cell += char
      } else if (row[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = false
      }
      continue
    }

    if (char === '"' && cell === '') {
      quoted = true
    } else if (char === ',') {
      cells.push(cell)
      cell = ''
    } else {
      cell += char
    }
  }

  if (quoted) throw new Error(`${where}: row ends inside a quoted field: ${row}`)

  return [...cells, cell]
}

/**
 * A whole CSV document into one object per row, keyed by the header columns.
 * `where` is the file's name, which the row errors are numbered against.
 *
 * CRLF is tolerated at the line boundary. Nothing upstream serves it today,
 * but a stray `\r` welded onto the last column would corrupt a name rather
 * than fail, and splitting on `/\r?\n/` costs nothing.
 *
 * @param {string} text
 * @param {string} where
 * @returns {Record<string, string>[]}
 */
export function parseCsv(text, where) {
  const [header = '', ...lines] = text.trim().split(/\r?\n/)
  const columns = splitRow(header, where)

  return lines.map((line, index) => {
    const cells = splitRow(line, `${where} line ${index + 2}`)
    return Object.fromEntries(columns.map((column, at) => [column, cells[at] ?? '']))
  })
}

/**
 * Fetches one of PokéAPI's CSVs and reads it. `base` is the caller's own
 * `raw.githubusercontent.com` prefix, which each generator pins to a commit
 * sha of its own so that re-running reproduces the committed bytes.
 *
 * @param {string} base
 * @param {string} name
 * @returns {Promise<Record<string, string>[]>}
 */
export async function fetchCsv(base, name) {
  const response = await fetch(`${base}${name}`)
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)

  return parseCsv(await response.text(), name)
}
