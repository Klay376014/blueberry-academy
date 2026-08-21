import names from '../lib/dex/species-names.json'

/**
 * The generated table, widened from the literal type the JSON import gives it.
 * Nothing should depend on which ids happen to be in the file at compile time.
 */
const NAMES: Record<string, string> = names

/**
 * The official English name for a Showdown species id.
 *
 * Species names are identifiers, not copy: they are English everywhere and
 * never pass through i18n (design document §3). `toID()` is lossy and cannot
 * be reversed by any rule -- nothing about `hooh` says where the hyphen in
 * `Ho-Oh` goes -- so this is a lookup against a table generated from the same
 * dex data that produced the ids.
 *
 * An id the table does not know comes back unchanged. A new generation or a
 * forme a new format introduces will leave the table behind, and a raw id on
 * screen is readable and tells you exactly what to regenerate; guessing at a
 * name would be silently wrong, and throwing would take a whole dashboard
 * down over a cosmetic gap. Regenerate with `pnpm --filter web
 * gen:species-names`.
 */
export function speciesName(id: string): string {
  return NAMES[id] ?? id
}
