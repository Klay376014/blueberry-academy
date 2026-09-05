/**
 * Finding what reka-ui teleports to `document.body`, and pressing it.
 *
 * The last match rather than the only one: a page unmounted by an earlier test
 * leaves its teleported nodes behind, and the drawer's tests document the same
 * trap on their own side.
 */
export function teleported(testid: string): Element | null {
  return [...document.body.querySelectorAll(`[data-testid="${testid}"]`)].at(-1) ?? null
}

export function pressTeleported(testid: string): void {
  const buttons = [...document.body.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`)]

  buttons.at(-1)?.click()
}

/** Clears what earlier mounts left in the document, so `at(-1)` means this one. */
export function forgetTeleported(testid: string): void {
  for (const stale of document.body.querySelectorAll(`[data-testid="${testid}"]`)) stale.remove()
}
