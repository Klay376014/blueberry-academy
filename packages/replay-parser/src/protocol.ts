/**
 * Line-level tokenizer for the Showdown battle protocol.
 *
 * A log is a sequence of `|type|arg|arg` lines. Splitting on every `|` is wrong
 * for the handful of message types whose last argument is free text or HTML —
 * chat, `|raw|`, `|uhtml|` — because that text may itself contain pipes. Those
 * types are listed below with the number of structured arguments that precede
 * the free text; everything after that count is kept whole.
 */
export interface ProtocolLine {
  /** The message type, e.g. `switch`. Empty for a bare `|` or an untyped line. */
  type: string
  args: string[]
}

/** Message type → how many structured arguments precede its free-text tail. */
const FREE_TEXT_TYPES = new Map([
  ['c', 1], // |c|<user>|<message>
  ['c:', 2], // |c:|<timestamp>|<user>|<message>
  ['chat', 1],
  ['-message', 0],
  ['bigerror', 0],
  ['error', 0],
  ['html', 0],
  ['inactive', 0],
  ['inactiveoff', 0],
  ['message', 0],
  ['popup', 0],
  ['raw', 0],
  ['uhtml', 1], // |uhtml|<name>|<html>
  ['uhtmlchange', 1],
])

/** Tokenizes a raw replay log. Empty lines are dropped; nothing else is. */
export function tokenizeLog(log: string): ProtocolLine[] {
  return log
    .split('\n')
    .filter((line) => line !== '')
    .map(tokenizeLine)
}

function tokenizeLine(line: string): ProtocolLine {
  // Showdown sends prose that predates the protocol as a bare line. Keep it as
  // an untyped line rather than guessing a type for it.
  if (!line.startsWith('|')) return { type: '', args: [line] }

  const parts = line.slice(1).split('|')
  const type = parts[0] ?? ''
  const rest = parts.slice(1)
  // `|` on its own is a blank-line marker, not a type with one empty argument.
  if (type === '' && rest.length === 0) return { type: '', args: [] }

  const structuredCount = FREE_TEXT_TYPES.get(type)
  if (structuredCount === undefined) return { type, args: rest }

  return {
    type,
    args: [...rest.slice(0, structuredCount), rest.slice(structuredCount).join('|')],
  }
}
