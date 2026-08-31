import { describe, expect, it } from 'vitest'
import { parseTimeline } from 'replay-parser'
import { fieldSnapshots } from '../utils/battleField'
import f1 from '../../../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2667169457.json'
import f2 from '../../../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2667301751.json'
import f3 from '../../../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmbbo3-2667579302.json'
import f4 from '../../../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmbbo3-2667582547.json'
import f5 from '../../../../../../packages/replay-parser/test/fixtures/gen9ou-2667293085.json'
import f6 from '../../../../../../packages/replay-parser/test/fixtures/gen9ou-2667296078.json'
import f7 from '../../../../../../packages/replay-parser/test/fixtures/gen9ou-2667299955.json'

describe('probe', () => {
  it('probes', () => {
    const out: string[] = []
    for (const f of [f1, f2, f3, f4, f5, f6, f7] as any[]) {
      const snaps = fieldSnapshots(parseTimeline(f.log))
      const last = snaps.at(-1)!
      const all = [...last.slots, ...last.offField]
      for (const side of ['p1', 'p2']) {
        const mine = all.filter((p) => p.side === side)
        const species = mine.map((p) => p.species)
        out.push([f.id, side, 'n=' + mine.length, species.join(',')].join(' '))
        const dup = species.filter((s, i) => species.indexOf(s) !== i)
        if (dup.length) out.push('  DUPLICATE ' + dup)
        const bad = mine.filter((p) => p.hp !== null && (p.hp < 0 || p.hp > 100))
        if (bad.length) out.push('  BAD HP ' + JSON.stringify(bad))
      }
      // count non-monotonic offField shrink
      for (let i = 1; i < snaps.length; i++) {
        const a = snaps[i - 1]!.offField.length
        const b = snaps[i]!.offField.length
        if (b < a - 1) out.push('  SHRINK ' + [f.id, snaps[i]!.turn, a, b].join(' '))
      }
    }
    require('fs').writeFileSync('/tmp/probe.txt', out.join('\n'))
    expect(true).toBe(true)
  })
})
