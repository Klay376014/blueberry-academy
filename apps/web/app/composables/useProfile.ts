import { toID } from 'replay-parser'

/** What became of an attempt to bind a name. */
export type BindResult =
  /** Written to the profile. */
  | 'bound'
  /** Already on the list under some spelling of it. */
  | 'already-bound'
  /** Nothing a Showdown name could ever be — it normalises to nothing. */
  | 'unusable'

/**
 * The whole of what the app can do with the signed-in user's profile: read the
 * Showdown names bound to it, add one, remove one.
 *
 * Names are stored as the user typed them — that spelling is what a replay
 * shows — while every comparison goes through `toID()`, so `NotLittleStar` and
 * `notlittlestar` are one name. Callers never normalise for themselves; that
 * rule lives here and nowhere else.
 *
 * Binding is a trust model: Showdown has no OAuth and its user API has no
 * field to put a code in, so ownership of an account cannot be verified. The
 * same name may be bound by several users. See the design document §10.
 */
export function useProfile() {
  const { $supabase } = useNuxtApp()
  const user = useCurrentUser()
  const stored = useShowdownAliases()

  /** The names, and whether they are the profile's or just a default. */
  const aliases = computed(() => stored.value ?? [])
  const loaded = computed(() => stored.value !== null)

  function requireUserId() {
    const id = user.value?.id
    if (!id) throw new Error('No signed-in user to read a profile for.')
    return id
  }

  /** Replaces the stored list, and only then the one on screen. */
  async function write(next: string[]) {
    // A write is a whole-array replace, so writing a list that was never read
    // would silently drop every name already on the profile.
    if (stored.value === null) {
      throw new Error('The alias list has not been read yet, so it must not be written.')
    }

    const { data, error } = await $supabase
      .from('profiles')
      .update({ showdown_usernames: next })
      .eq('id', requireUserId())
      .select('showdown_usernames')
      // Asking for the row back is what makes a write that matched nothing
      // visible: an update with no matching row is not an error, so without
      // this the screen would show a binding that was never stored.
      .single()

    // Thrown rather than swallowed: the screen must not show a binding the
    // database refused.
    if (error) throw error

    // What came back, not what was sent: the row is the truth about what is
    // stored now.
    stored.value = data?.showdown_usernames ?? next
  }

  async function load() {
    const { data, error } = await $supabase
      .from('profiles')
      .select('showdown_usernames')
      .eq('id', requireUserId())
      .single()

    if (error) throw error

    stored.value = data?.showdown_usernames ?? []
  }

  async function bindAlias(name: string): Promise<BindResult> {
    const trimmed = name.trim()
    const id = toID(trimmed)

    // toID leaves nothing behind for whitespace or punctuation alone, and a
    // name that normalises to nothing could never match a replay.
    if (!id) return 'unusable'

    if (aliases.value.some((alias) => toID(alias) === id)) return 'already-bound'

    await write([...aliases.value, trimmed])
    return 'bound'
  }

  async function unbindAlias(name: string) {
    const id = toID(name)

    await write(aliases.value.filter((alias) => toID(alias) !== id))
  }

  return { aliases, loaded, load, bindAlias, unbindAlias }
}
