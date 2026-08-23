/**
 * A win rate as a fill colour, and ink that survives on top of it.
 *
 * One hue, deepening with the rate: the other colour in each palette is spent
 * on the exception (`--unfiled`), not on the data. Both themes deepen in the
 * same direction, so the ink has to flip at the halfway mark either way.
 *
 * Returned as a CSS string rather than a class, because the rate is data:
 * there is no finite set of utility classes that covers it.
 */
export function rateFill(rate: number): string {
  const mix = Math.round(18 + Math.min(Math.max(rate, 0), 1) * 82)

  return `color-mix(in oklab, var(--primary) ${mix}%, var(--muted))`
}

export function rateInk(rate: number): string {
  return rate >= 0.5 ? 'var(--background)' : 'var(--foreground)'
}
