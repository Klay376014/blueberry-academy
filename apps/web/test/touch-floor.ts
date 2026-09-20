import { expect } from 'vitest'

/**
 * The touch-target floor of docs/specs/2026-09-18-responsive-baseline.md §5,
 * shared by the two specs that assert it: the site chrome's half in
 * `nuxt/responsive.spec.ts` and the pages' half in `nuxt/touch-targets.spec.ts`.
 *
 * One implementation because §5 is one rule: two copies drifted apart within a
 * single issue — one of them had never heard of the `<label>` that carries the
 * floor for a checkbox.
 */

/** Anything a thumb can land on, which is more than the things called buttons. */
export const PRESSABLE = 'a, button, input:not([type="hidden"]), select, textarea'

/**
 * The floor, wherever it is carried. §5 allows three answers and this is all
 * three: the control itself, the `<label>` that wraps a 16px checkbox, or a
 * `::before` hit area behind a graphic that keeps its drawn size.
 */
export function carriesFloor(element: Element): boolean {
  const own = element.getAttribute('class') ?? ''
  if (own.includes('min-h-11') || own.includes('before:size-11')) return true

  const label = element.closest('label')

  return label !== null && (label.getAttribute('class') ?? '').includes('min-h-11')
}

export function nameOf(element: Element): string {
  return (
    element.getAttribute('data-testid') ??
    element.getAttribute('aria-label') ??
    element.textContent?.trim().slice(0, 30) ??
    element.tagName.toLowerCase()
  )
}

/**
 * @param roots The regions to sweep, together: a landmark of one region is
 * allowed to be missing from another.
 * @param landmarks Controls these regions are known to hold, so the sweep
 * cannot pass by finding nothing. Named rather than counted: how many controls
 * a region draws at once is what a narrow layout is allowed to change. Empty
 * only where the caller has proved by other means that the region rendered.
 */
export function expectFloor(roots: Element | Element[], landmarks: string[]) {
  const pressables = [roots].flat().flatMap((root) => [...root.querySelectorAll(PRESSABLE)])
  const names = pressables.map(nameOf)

  for (const landmark of landmarks) expect(names).toContain(landmark)

  expect(pressables.filter((element) => !carriesFloor(element)).map(nameOf)).toEqual([])
}

/**
 * §5's other half: two 44px boxes 4px apart are one target as far as a thumb
 * is concerned. Asserted in both axes at once, because these rows wrap.
 */
export function expectApart(element: Element) {
  const classes = (element.getAttribute('class') ?? '').split(' ')

  expect(
    classes.some((name) => /^gap-(?:[2-9]|\d\d)$/.test(name)),
    nameOf(element),
  ).toBe(true)
}
