/**
 * The Showdown names bound to the signed-in user, in the spelling they were
 * typed in.
 *
 * `null` until the profile has been read. "No names" and "not read yet" must
 * not look alike: writing the list replaces the whole array, so a write built
 * on a list that was never read would delete every name the profile has.
 */
export function useShowdownAliases() {
  return useState<string[] | null>('showdown-aliases', () => null)
}
