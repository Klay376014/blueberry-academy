/**
 * A registered team's address.
 *
 * Identity is `format_id` + `team_signature` and nothing else (CONTEXT.md,
 * 「隊伍的同一性」), so both go in the URL — a Bo1 team and its Bo3 counterpart
 * are different teams and must not share a page. The separator is `~`, which
 * appears in neither half: a format id is alphanumeric and a signature joins
 * base species ids with `|`.
 *
 * Long, and readable on purpose: an opaque hash would be shorter and would
 * make a wrong page impossible to diagnose from the address bar alone.
 */
const SEPARATOR = '~'

export interface TeamRef {
  formatId: string
  signature: string
}

export function teamRouteId({ formatId, signature }: TeamRef): string {
  return `${formatId}${SEPARATOR}${signature}`
}

/** The team an address names, or null when it names no team at all. */
export function parseTeamRouteId(id: string): TeamRef | null {
  const at = id.indexOf(SEPARATOR)
  if (at <= 0) return null

  const formatId = id.slice(0, at)
  const signature = id.slice(at + SEPARATOR.length)

  return signature === '' ? null : { formatId, signature }
}
