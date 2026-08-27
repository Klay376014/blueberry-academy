/**
 * The dashboard: what was played, counted and ranked.
 *
 * The public API of `features/stats`. Everything under this folder that is not
 * named here is the feature's own business — nothing outside it may reach past
 * this file (issue #61, enforced by `vp check` and `test/architecture.spec.ts`).
 */
export { useStats } from './composables/useStats'
export { defaultStatsFilters, useStatsFilters } from './composables/useStatsFilters'
export type { StatsFilters } from './composables/useStatsFilters'
export { useRecentBattles } from './composables/useRecentBattles'
export type { RecentBattle } from './composables/useRecentBattles'
export type { Aggregate, ResultUnit, SignatureStats, Tally, TeamStats } from './utils/battleStats'
export { parseTeamRouteId, teamRouteId } from './utils/teamRoute'
export type { TeamRef } from './utils/teamRoute'
