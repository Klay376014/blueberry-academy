import type { ReplayRef } from '../api/showdown'

const ORIGIN = 'https://replay.pokemonshowdown.com'

/**
 * Where a replay lives on Showdown. The address of the replay itself, without
 * a password: a link out of this app is for a battle the reader already has,
 * and putting the password of a private replay into a shareable page would
 * hand it out with it.
 */
export function replayUrl(replayId: string): string {
  return `${ORIGIN}/${replayId}`
}

/**
 * A format id, possibly with a tournament prefix, and the battle number.
 * `smogtours-gen9ou-799535` is one of these: the inner hyphens are part of the
 * id and only the final run of digits ends it.
 */
const REPLAY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*-\d+$/

/** The password of a private replay, as the address carries it: `-<password>pw`. */
const PASSWORD_SUFFIX = /^(.*)-([a-z0-9]+)pw$/

/**
 * The replay a pasted link points at, or null when it points at no replay.
 *
 * Everything the address bar can hold comes off here: the origin, a trailing
 * slash, the `?p2` that flips the viewer's side, the `#turn-3` that jumps into
 * the battle, and the password suffix. The password comes back beside the id
 * rather than inside it — `useShowdown().fetchReplay` is the only thing that
 * puts it back.
 *
 * Refused here rather than by asking Showdown, so a pasted profile page earns
 * a sentence about the link instead of a 404 blamed on a replay.
 */
export function parseReplayLink(input: string): ReplayRef | null {
  // Showdown resolves its ids lowercased, and a link out of a chat log arrives
  // with whatever spacing the chat put around it.
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return null

  // The query and hash are cut first, so `?p2` cannot be read as part of the id.
  const path = trimmed.split(/[?#]/)[0] ?? ''
  const segment = path.split('/').filter(Boolean).at(-1) ?? ''

  const secret = PASSWORD_SUFFIX.exec(segment)
  const id = secret?.[1] ?? segment
  const password = secret?.[2] ?? null

  return REPLAY_ID.test(id) ? { id, password } : null
}

/** The only host that serves replays; every other address names something else. */
const REPLAY_HOST = 'replay.pokemonshowdown.com'

/** What a chat log wraps a link in: `<>`, `()`, quotes, a trailing comma. */
const WRAPPING = /^[^a-z0-9]+|[^a-z0-9]+$/gi

/**
 * The candidate a token offers, or null when it could never be a replay.
 *
 * `parseReplayLink` reads the last path segment of whatever it is given, which
 * is right for a link the reader deliberately pasted and far too generous for
 * a token swept out of arbitrary text: it would read `/threads/vgc-2026-12345`
 * as a replay. So an address has to be Showdown's replay host, and a bare id
 * has to carry a letter — `2026-09-11` satisfies the id grammar on its own.
 */
function candidateOf(token: string): string | null {
  const bare = token.replace(WRAPPING, '')
  if (!bare) return null

  const address = bare.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  const host = (address.split('/')[0] ?? '').toLowerCase()

  if (bare.includes('://') || host.includes('.')) {
    return host === REPLAY_HOST ? address : null
  }

  return /[a-z]/i.test(bare) ? bare : null
}

/**
 * Every replay a piece of text names, in the order it names them, each one
 * once. Pasting a chat log straight in is the point: timestamps, usernames and
 * other links sit around the replay links and are passed over rather than
 * refused, so the caller cannot report them as replays that failed.
 *
 * Design document §6 (docs/specs/2026-09-11-private-replay-sync-design.md).
 */
export function findReplayLinks(text: string): ReplayRef[] {
  const found = new Map<string, ReplayRef>()

  for (const token of text.split(/\s+/)) {
    const candidate = candidateOf(token)
    const target = candidate === null ? null : parseReplayLink(candidate)

    if (target && !found.has(target.id)) found.set(target.id, target)
  }

  return [...found.values()]
}
