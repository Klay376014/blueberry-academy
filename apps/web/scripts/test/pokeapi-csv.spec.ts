import { describe, expect, it } from 'vite-plus/test'
import { parseCsv, splitRow } from '../pokeapi-csv.mjs'

describe('splitRow', () => {
  it('splits a plain row on commas', () => {
    expect(splitRow('719,9,Volt Thunderbolt', 'where')).toEqual(['719', '9', 'Volt Thunderbolt'])
  })

  // move_names.csv line 7907 at the ref gen-move-names-zh-hant.mjs pins.
  it('keeps a comma that sits inside a quoted field', () => {
    expect(splitRow('719,9,"10,000,000 Volt Thunderbolt"', 'where')).toEqual([
      '719',
      '9',
      '10,000,000 Volt Thunderbolt',
    ])
  })

  it('reads `""` as one literal quote', () => {
    expect(splitRow('1,9,"say ""hi"", loudly"', 'where')).toEqual(['1', '9', 'say "hi", loudly'])
  })

  it('reads a quoted field that is nothing but an escaped quote', () => {
    expect(splitRow('1,""""', 'where')).toEqual(['1', '"'])
  })

  it('reads an empty quoted field', () => {
    expect(splitRow('1,"",2', 'where')).toEqual(['1', '', '2'])
  })

  it('keeps a trailing empty field rather than dropping it', () => {
    expect(splitRow('1,9,', 'where')).toEqual(['1', '9', ''])
  })

  it('keeps an empty field in the middle', () => {
    expect(splitRow('1,,9', 'where')).toEqual(['1', '', '9'])
  })

  // A quote that opens mid-field is a literal in PokéAPI's tables, not the
  // start of a quoted field, so `5" Steel Beam` reads as itself.
  it('treats a quote after the first character as a literal', () => {
    expect(splitRow('1,5" Steel Beam', 'where')).toEqual(['1', '5" Steel Beam'])
  })

  it('throws, naming where, when a row ends inside a quoted field', () => {
    expect(() => splitRow('719,9,"10,000', 'move_names.csv line 7907')).toThrowError(
      /move_names\.csv line 7907: row ends inside a quoted field/,
    )
  })
})

describe('parseCsv', () => {
  it('keys each row by the header columns', () => {
    const rows = parseCsv('move_id,local_language_id,name\n719,9,Zippy Zap\n', 'move_names.csv')

    expect(rows).toEqual([{ move_id: '719', local_language_id: '9', name: 'Zippy Zap' }])
  })

  it('reads a quoted field in a row and in the header alike', () => {
    const rows = parseCsv('id,"a,b"\n1,"x,y"\n', 'where')

    expect(rows).toEqual([{ id: '1', 'a,b': 'x,y' }])
  })

  it('fills a column the row stops short of with an empty string', () => {
    expect(parseCsv('a,b,c\n1,2\n', 'where')).toEqual([{ a: '1', b: '2', c: '' }])
  })

  // Tolerated at the line boundary only: git-for-Windows checkouts and raw
  // HTTP proxies both hand back CRLF, and a stray `\r` welded onto the last
  // column would corrupt a name instead of failing loudly.
  it('tolerates CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,Zippy Zap\r\n', 'where')).toEqual([{ a: '1', b: 'Zippy Zap' }])
  })

  it('names the file and the 1-based line when a row ends inside a quote', () => {
    expect(() => parseCsv('a,b\n1,ok\n2,"oops\n', 'move_names.csv')).toThrowError(
      /move_names\.csv line 3: row ends inside a quoted field/,
    )
  })

  it('has no rows for a header-only file', () => {
    expect(parseCsv('a,b\n', 'where')).toEqual([])
  })
})
