import type { NamedSide, SideSlot } from './sideSlots'

/**
 * The two sides' hues, by the role the colour plays. Which hues, and why the
 * rail is dashed as well as gold, is measured in ADR-0017.
 */

/** A timeline row's rail and wash. `neutral` belongs to nobody and gets none. */
export const SIDE_RAIL: Record<SideSlot, string> = {
  first: 'border-solid border-l-primary bg-primary/12',
  second: 'border-dashed border-l-side-second bg-side-second/12',
  neutral: 'border-solid border-l-transparent',
}

/** A side's own words, wherever they are set in its hue rather than the ink. */
export const SIDE_TEXT: Record<SideSlot, string> = {
  first: 'text-primary',
  second: 'text-side-second',
  neutral: 'text-muted-foreground',
}

/** The outlined mark that names a side. */
export const SIDE_MARK: Record<NamedSide, string> = {
  first: 'border-primary/45 text-primary',
  second: 'border-side-second/55 text-side-second',
}
