import type { DOMWrapper } from '@vue/test-utils'

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

/**
 * Long enough for what reka-ui draws on its own schedule — a menu's portal,
 * a dialog's content — to have landed.
 */
export async function settle(): Promise<void> {
  for (let turn = 0; turn < 3; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

/** Opens a reka-ui menu from the keyboard and waits for its teleported content. */
export async function openMenu(trigger: Pick<DOMWrapper<Element>, 'trigger'>): Promise<void> {
  await trigger.trigger('keydown', { key: 'Enter' })
  await settle()
}

/** Clears what earlier mounts left in the document, so `at(-1)` means this one. */
export function forgetTeleported(testid: string): void {
  for (const stale of document.body.querySelectorAll(`[data-testid="${testid}"]`)) stale.remove()
}
