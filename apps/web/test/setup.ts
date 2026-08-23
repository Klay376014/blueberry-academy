/**
 * The SVG geometry jsdom does not implement.
 *
 * Unovis measures rendered text to lay out its axes, and jsdom has no layout
 * engine, so `getBBox` and friends are simply missing rather than returning
 * zeroes. Stubbed to zero here: the numbers are only used for tick spacing,
 * and what the tests read off a chart is the path it drew, not where the
 * labels landed.
 */
const EMPTY_BOX = { x: 0, y: 0, width: 0, height: 0 }

interface Measurable {
  getBBox?: () => typeof EMPTY_BOX
  getComputedTextLength?: () => number
  getSubStringLength?: () => number
}

const prototype = globalThis.SVGElement?.prototype as Measurable | undefined

if (prototype) {
  prototype.getBBox ??= () => EMPTY_BOX
  prototype.getComputedTextLength ??= () => 0
  prototype.getSubStringLength ??= () => 0
}

/**
 * A ResizeObserver that observes nothing.
 *
 * jsdom has none, so Unovis falls back to `@juggle/resize-observer`, whose
 * teardown then throws on every unmount and fails the surrounding test. There
 * is no layout in jsdom for an observer to report on either way, so an inert
 * one is the honest stand-in rather than a lie.
 */
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
