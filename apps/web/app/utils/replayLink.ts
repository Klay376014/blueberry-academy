import type { ReplayRef } from '../composables/useShowdown'

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
