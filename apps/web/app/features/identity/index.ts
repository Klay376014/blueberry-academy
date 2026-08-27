/**
 * Who the reader is: signing in, and the Showdown names bound to them.
 *
 * The public API of `features/identity`. See `features/stats/index.ts` for
 * what that means.
 */
export { useAuth } from './composables/useAuth'
export { useProfile } from './composables/useProfile'
export { useReattribution } from './composables/useReattribution'
export type { BindResult } from './composables/useProfile'
export type { ReattributionOutcome, ReattributionReport } from './composables/useReattribution'
