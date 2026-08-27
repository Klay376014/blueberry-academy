/**
 * Which battle the address says is open, and how to say a different one.
 *
 * `?battle=<replayId>` and nowhere else, so the link is shareable and the back
 * button closes the drawer (docs/specs/2026-08-20-battle-timeline-design.md §4,
 * decision T1).
 *
 * It sits in `shared/` rather than inside the timeline because the address is
 * not the timeline's to own: the dashboard's recent list highlights the open
 * row and opens another, and the timeline reads everything about whichever one
 * that is. Both talk to the same query parameter and neither to each other
 * (issue #61).
 */
export function useBattleRoute() {
  const route = useRoute()
  const router = useRouter()

  /** The battle the address says is open, if it says one is. */
  const openId = computed(() => {
    const asked = route.query.battle

    return typeof asked === 'string' && asked ? asked : null
  })

  function open(replayId: string): void {
    void router.push({ query: { ...route.query, battle: replayId } })
  }

  function close(): void {
    const { battle: _open, ...rest } = route.query

    void router.push({ query: rest })
  }

  return { openId, open, close }
}
