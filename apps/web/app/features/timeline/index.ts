/**
 * One battle, flattened into turns: the drawer and everything it draws.
 *
 * The public API of `features/timeline`. See `features/stats/index.ts` for
 * what that means.
 */
export { useBattleDrawer } from './composables/useBattleDrawer'
export type { DrawerBattle, DrawerFailure } from './composables/useBattleDrawer'
export { BattleLogError, useBattleLog } from './composables/useBattleLog'
export type { BattleLogFailure } from './composables/useBattleLog'
