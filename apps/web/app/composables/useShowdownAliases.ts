/**
 * The Showdown names bound to the signed-in user, in the spelling they were
 * typed in. Written by useProfile, read by anything that needs to know which
 * battles are "mine".
 *
 * `null` until the profile has actually been read. "No names" and "not read
 * yet" must not look alike: writing the list replaces the whole array, so a
 * write built on a list that was never read would delete every name the
 * profile really has.
 *
 * A `useState` rather than a module-level ref, for the same reason as
 * useCurrentUser: the value lives on the Nuxt instance and is resettable
 * between tests.
 */
export function useShowdownAliases() {
  return useState<string[] | null>('showdown-aliases', () => null)
}
