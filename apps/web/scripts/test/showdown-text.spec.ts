// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { scanShowdownNames, scanShowdownRecord, serialise } from '../showdown-text.mjs'

/**
 * Reading somebody else's TypeScript, which is what Showdown's
 * `data/text/zh-tw/*.ts` are: they are not a data format and they are not on
 * npm, so the generators scan them, and every defence in that scan is here
 * because upstream can break it (docs/adr/0016-localised-battle-vocabulary.md).
 *
 * The strings in this file are the shapes measured at the pinned ref, cut down
 * to the line that matters. Tabs are significant — that is how upstream
 * indents, and the patterns key off it.
 */

const entry = (lines: string[]) => lines.join('\n')

describe('scanShowdownNames', () => {
  const source = entry([
    'export const MovesText: { [id: IDEntry]: MoveText } = {',
    '\tabsorb: {',
    '\t\tname: "吸取",',
    '\t\tdesc: null, // NEEDS TRANSLATION',
    '\t},',
    '\t"10000000voltthunderbolt": {',
    '\t\tname: "千萬伏特",',
    '\t},',
    '\tguessedmove: {',
    '\t\tname: "猜的", // NEEDS QC',
    '\t},',
    '\tnamelessmove: {',
    '\t\tname: null, // NEEDS TRANSLATION',
    '\t},',
    '};',
  ])

  it('reads a name per top-level entry', () => {
    const names = scanShowdownNames(source, { file: 'moves.ts', entryFloor: 1, nameFloor: 1 })

    expect(names.absorb).toBe('吸取')
  })

  it('keeps a key upstream wrapped in quotes', () => {
    // `"10000000voltthunderbolt"` is the one entry whose key does not start
    // with a letter, and a letters-only pattern drops a real move.
    const names = scanShowdownNames(source, { file: 'moves.ts', entryFloor: 1, nameFloor: 1 })

    expect(names['10000000voltthunderbolt']).toBe('千萬伏特')
  })

  it('drops a name upstream marked NEEDS QC', () => {
    // Upstream has an open PR putting machine translations behind that
    // comment, its own author saying they should not be considered good. The
    // cost of it landing has to be a few names falling back to English.
    const names = scanShowdownNames(source, { file: 'moves.ts', entryFloor: 1, nameFloor: 1 })

    expect(names.guessedmove).toBeUndefined()
  })

  it('leaves out an entry whose name is null rather than defaulting it', () => {
    const names = scanShowdownNames(source, { file: 'moves.ts', entryFloor: 1, nameFloor: 1 })

    expect(names.namelessmove).toBeUndefined()
  })

  it('reads a field other than name, which is how the weather is reached', () => {
    // `default.ts` carries the weather's *state* name alongside its sentences,
    // and that string is not the move's: 下雪 against the move's 雪景.
    const weather = entry([
      '\tsnowscape: {',
      '\t\tweatherName: "下雪",',
      '\t\tstart: "  開始下雪了！",',
      '\t},',
      '\telectricterrain: {',
      '\t\tstart: "  腳下電流飛閃！",',
      '\t},',
    ])
    const names = scanShowdownNames(weather, {
      file: 'default.ts',
      field: 'weatherName',
      entryFloor: 2,
      nameFloor: 1,
    })

    expect(names).toEqual({ snowscape: '下雪' })
  })

  it('throws when the entry pattern stops matching, rather than writing an empty table', () => {
    // The failure that takes the whole table with it.
    expect(() =>
      scanShowdownNames('nothing here', { file: 'moves.ts', entryFloor: 900, nameFloor: 900 }),
    ).toThrow(/scanned 0 entries, expected at least 900/)
  })

  it('throws when every entry is found and every name is gone', () => {
    // The independent failure only the second floor sees: upstream reformats
    // the name line, the entries all still match, and the names all vanish.
    const reformatted = entry(['\tabsorb: {', "\t\tname: '吸取',", '\t},'])

    expect(() =>
      scanShowdownNames(reformatted, { file: 'moves.ts', entryFloor: 1, nameFloor: 1 }),
    ).toThrow(/captured only 0 name values/)
  })
})

describe('scanShowdownRecord', () => {
  const source = entry([
    'export const StatNames: { [id: string]: TranslationString } = {',
    '\thp: "HP", atk: "攻擊", def: "防禦",',
    '\taccuracy: "命中率",',
    '};',
    '',
    'export const StatusNames: { [id: string]: TranslationString } = {',
    '\tbrn: null, // NEEDS TRANSLATION',
    '\tpar: null, // NEEDS TRANSLATION',
    '};',
  ])

  it('reads several pairs off one line, which is how upstream writes these', () => {
    const names = scanShowdownRecord(source, { file: 'names.ts', record: 'StatNames', floor: 4 })

    expect(names).toEqual({ hp: 'HP', atk: '攻擊', def: '防禦', accuracy: '命中率' })
  })

  it('reads one record and not the one after it', () => {
    const names = scanShowdownRecord(source, { file: 'names.ts', record: 'StatNames', floor: 4 })

    expect(names).not.toHaveProperty('brn')
  })

  it('leaves out a null, which is upstream saying there is no translation', () => {
    // Every one of `StatusNames`' eight is `null` at the pinned ref. That is
    // the first-hand evidence that `brn` has no official noun, and it has to
    // survive as an absence rather than becoming an empty string.
    const names = scanShowdownRecord(source, { file: 'names.ts', record: 'StatusNames', floor: 0 })

    expect(names).toEqual({})
  })

  it('throws when the record is gone or renamed', () => {
    expect(() =>
      scanShowdownRecord(source, { file: 'names.ts', record: 'TypeNames', floor: 19 }),
    ).toThrow(/no export named TypeNames/)
  })

  it('throws when it finds fewer names than the floor', () => {
    expect(() =>
      scanShowdownRecord(source, { file: 'names.ts', record: 'StatNames', floor: 9 }),
    ).toThrow(/gave 4 names, expected at least 9/)
  })
})

describe('serialise', () => {
  it('writes one entry per line, so a source update reads as a diff', () => {
    expect(serialise({ absorb: '吸取', pound: '拍擊' })).toBe(
      '{\n  "absorb": "吸取",\n  "pound": "拍擊"\n}\n',
    )
  })
})
