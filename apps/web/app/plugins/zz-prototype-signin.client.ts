/**
 * PROTOTYPE ONLY (issue #17) — delete with the rest of the prototype.
 *
 * The dashboard is behind the login, and the login needs Supabase, which the
 * prototype deliberately does not depend on. So rather than opening a hole in
 * the route guard -- which is real logic with real tests on it -- this puts a
 * fake user into the state the Supabase plugin normally writes, exactly as the
 * `signIn()` test helper does.
 *
 * Named `zz-` because plugins load in path order and this has to win against
 * supabase.client.ts, which sets the same state to null when it finds no
 * session.
 */
export default defineNuxtPlugin(() => {
  useCurrentUser().value = { id: 'prototype-user' } as never
  useShowdownAliases().value = ['Prototype Trainer']
})
