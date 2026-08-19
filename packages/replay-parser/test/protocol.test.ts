import { describe, expect, it } from 'vite-plus/test'
import { tokenizeLog } from '../src/protocol'

describe('tokenizeLog', () => {
  it('splits a plain line into its type and arguments', () => {
    expect(tokenizeLog('|player|p1|DavoPro1214|benga|1444')).toEqual([
      { type: 'player', args: ['p1', 'DavoPro1214', 'benga', '1444'] },
    ])
  })

  it('drops empty lines', () => {
    expect(tokenizeLog('|turn|1\n\n\n|turn|2')).toEqual([
      { type: 'turn', args: ['1'] },
      { type: 'turn', args: ['2'] },
    ])
  })

  it('drops the trailing empty line real logs end with', () => {
    expect(tokenizeLog('|win|Doomnik\n')).toEqual([{ type: 'win', args: ['Doomnik'] }])
  })

  it('reads a lone pipe as a blank-line marker with no arguments', () => {
    expect(tokenizeLog('|')).toEqual([{ type: '', args: [] }])
  })

  it('reads a type with no arguments', () => {
    expect(tokenizeLog('|upkeep')).toEqual([{ type: 'upkeep', args: [] }])
  })

  it('keeps the empty argument of a re-emitted |player| line', () => {
    // Showdown re-sends |player|p1| after the battle ends, with no name and no
    // rating. Swallowing the empty argument would make it indistinguishable
    // from an argument-less line and hide that the name was cleared.
    expect(tokenizeLog('|player|p1|')).toEqual([{ type: 'player', args: ['p1', ''] }])
  })

  it('reads a line that does not start with a pipe as untyped text', () => {
    expect(tokenizeLog('just text')).toEqual([{ type: '', args: ['just text'] }])
  })

  it('does not split the HTML of a |raw| line on the pipes inside it', () => {
    expect(tokenizeLog('|raw|<strong>a|b</strong>')).toEqual([
      { type: 'raw', args: ['<strong>a|b</strong>'] },
    ])
  })

  it('does not split the HTML of a |uhtml| line, but keeps its name separate', () => {
    expect(tokenizeLog('|uhtml|bestof|<div>Game 1|Game 2</div>')).toEqual([
      { type: 'uhtml', args: ['bestof', '<div>Game 1|Game 2</div>'] },
    ])
  })

  it('does not split chat content on the pipes inside it', () => {
    expect(tokenizeLog('|c|☆DavoPro1214|gg | wp')).toEqual([
      { type: 'c', args: ['☆DavoPro1214', 'gg | wp'] },
    ])
  })

  it('keeps the timestamp and author of a |c:| line separate from its content', () => {
    expect(tokenizeLog('|c:|1787130733|☆DavoPro1214|a|b')).toEqual([
      { type: 'c:', args: ['1787130733', '☆DavoPro1214', 'a|b'] },
    ])
  })

  it('keeps a free-text |-message| whole', () => {
    expect(tokenizeLog('|-message|Da|vo forfeited.')).toEqual([
      { type: '-message', args: ['Da|vo forfeited.'] },
    ])
  })

  it('still splits structured lines that happen to look like text', () => {
    expect(tokenizeLog('|switch|p1a: Scrafty|Scrafty, L50, F|100/100')).toEqual([
      { type: 'switch', args: ['p1a: Scrafty', 'Scrafty, L50, F', '100/100'] },
    ])
  })
})
