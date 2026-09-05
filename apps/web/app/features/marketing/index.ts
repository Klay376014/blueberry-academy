/**
 * The public face of the app: what it is, for somebody who has not signed in
 * and has no reason to yet.
 *
 * The public API of `features/marketing`. It exports nothing — the feature is
 * made of components, which Nuxt registers from `nuxt.config.ts`, and it holds
 * no domain logic of its own on purpose: every sentence in it is a claim about
 * what the other features do, and a claim is not a dependency.
 *
 * See `features/stats/index.ts` for what a feature's public API means here.
 */
export {}
