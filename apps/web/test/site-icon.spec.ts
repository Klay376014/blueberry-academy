// @vitest-environment node
/// <reference types="node" />
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The files behind the icon (issue #140).
 *
 * They are served from this repo rather than hotlinked from the image host
 * they came from: an outside host is free to disappear or to refuse the
 * request, and a share card whose image will not load renders blank rather
 * than falling back to the text-only card it used to be.
 */
const PUBLIC = fileURLToPath(new URL('../public', import.meta.url))

const bytes = (name: string) => readFileSync(path.join(PUBLIC, name))

/** Width and height out of a PNG's IHDR, which is always the first chunk. */
function pngSize(name: string) {
  const png = bytes(name)

  expect(png.subarray(1, 4).toString()).toBe('PNG')

  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

describe('the site icon', () => {
  it('is served from here rather than from somewhere that may stop serving it', () => {
    for (const file of ['favicon.ico', 'icon.png', 'apple-touch-icon.png']) {
      expect(statSync(path.join(PUBLIC, file)).size).toBeGreaterThan(0)
    }
  })

  it('is square and big enough for a share card to accept', () => {
    // Both the OG and the Twitter minimum for a summary card is 144×144.
    const { width, height } = pngSize('icon.png')

    expect(width).toBe(height)
    expect(width).toBeGreaterThanOrEqual(144)
  })

  it('gives Apple the size it asks for, with no transparency to fill in black', () => {
    const { width, height } = pngSize('apple-touch-icon.png')

    expect([width, height]).toEqual([180, 180])

    // Colour type 2 is RGB; 6 would be RGBA. iOS composites a transparent app
    // icon onto black rather than onto the home screen, so this one is opaque.
    expect(bytes('apple-touch-icon.png').readUInt8(25)).toBe(2)
  })

  it('offers the small sizes a browser tab actually draws', () => {
    // An .ico is a directory of images; byte 4 is how many it holds.
    const ico = bytes('favicon.ico')
    const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, index) => {
      // 0 in the directory means 256; the tab sizes are all well under that.
      const entry = 6 + index * 16
      return ico.readUInt8(entry)
    })

    expect(sizes).toContain(16)
    expect(sizes).toContain(32)
  })
})
