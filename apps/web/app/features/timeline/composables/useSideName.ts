import type { SideId } from 'replay-parser'
import { sideLabelKey } from '../utils/sideSlots'

/**
 * What to call a side, in the reader's language.
 *
 * The half of the side vocabulary that needs `t()`, and so cannot live in
 * `utils/sideSlots.ts` — the util decides *which* naming applies and this
 * resolves it. Everything in the drawer that names a side goes through here,
 * so the timeline's rows and the field bar cannot drift into calling the same
 * side two different things.
 */
export function useSideName() {
  const { t } = useI18n()

  return (side: SideId, mySide: SideId | null): string => {
    const key = sideLabelKey(side, mySide)

    // `P1` / `P2` is what the log calls the sides, and it stays as Showdown
    // spells it (ADR-0016). It is the label of a spectated battle, where
    // neither side can be named after the reader.
    return key === null ? side.toUpperCase() : t(`battle.drawer.${key}`)
  }
}
