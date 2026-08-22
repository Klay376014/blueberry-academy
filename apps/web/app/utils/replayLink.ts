import type { ReplayRef } from '../composables/useShowdown'

/**
 * A replay id: a format id, possibly with a tournament prefix, and the battle
 * number Showdown gave it. `smogtours-gen9ou-799535` is one of these, so the
 * hyphens inside it are part of the id and only the final run of digits ends
 * it.
 */
const REPLAY_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*-\d+$/

/** The password of a private replay, as the address carries it: `-<password>pw`. */
const PASSWORD_SUFFIX = /^(.*)-([a-z0-9]+)pw$/

/**
 * The replay a pasted link points at, or null when it points at no replay.
 *
 * Pasting the address bar is the whole interaction, so everything the address
 * bar can hold is taken off here: the origin, a trailing slash, the `?p2` that
 * flips the viewer's side, the `#turn-3` that jumps into the battle, and the
 * `-<password>pw` suffix that a private replay is served under. The password
 * comes back beside the id rather than inside it, because
 * `useShowdown().fetchReplay` is the only thing allowed to put it back in.
 *
 * Refusing here rather than asking Showdown is deliberate: a user who pasted
 * their profile page deserves a sentence about the link, not a 404 blamed on
 * a replay that never existed.
 */
export function parseReplayLink(input: string): ReplayRef | null {
  // Showdown resolves its ids lowercased, and a link copied out of a chat log
  // arrives with whatever spacing the chat put around it.
  const trimmed = input.trim().toLowerCase()
  if (!trimmed) return null

  // Only the last path segment can be the replay; everything before it is an
  // origin this does not care about. A query or a hash is cut first, so that
  // `?p2` cannot be mistaken for part of the id.
  const path = trimmed.split(/[?#]/)[0] ?? ''
  const segment = path.split('/').filter(Boolean).at(-1) ?? ''

  const secret = PASSWORD_SUFFIX.exec(segment)
  const id = secret?.[1] ?? segment
  const password = secret?.[2] ?? null

  return REPLAY_ID.test(id) ? { id, password } : null
}
