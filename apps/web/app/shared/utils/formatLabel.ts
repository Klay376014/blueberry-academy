/**
 * The badge a format wears: whether it is a ladder Bo1 or a best-of series,
 * and which. Read off the suffix, which is where `regulation` is derived from
 * too — see the generated column in the schema.
 *
 * `BO2` is reported as itself rather than folded into `BO3`: it is a real
 * suffix Showdown uses, and a badge that lies about which is worse than one
 * more value.
 */
export function bestOfLabel(formatId: string): string {
  return /bo([23])$/.exec(formatId)?.[0].toUpperCase() ?? 'BO1'
}
