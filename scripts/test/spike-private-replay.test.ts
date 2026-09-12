import { describe, expect, it } from 'vite-plus/test'
import { bodyOf, listingsOf, optionsOf, redactorFor, sidOf } from '../spike-private-replay.ts'

describe('what the command line asked for', () => {
  it('runs the whole round trip and closes the session by default', () => {
    expect(optionsOf([])).toEqual({ keepSession: false })
  })

  it('takes --keep-session, which is what makes the second-IP check possible', () => {
    expect(optionsOf(['--keep-session'])).toEqual({ keepSession: true })
  })

  it('refuses a flag it does not know', () => {
    // A misspelt --keep-session that ran anyway would log the session out
    // before the second machine could use it.
    expect(() => optionsOf(['--keepsession'])).toThrow(/--keepsession/)
  })

  it('refuses a password on the command line', () => {
    // argv is world-readable through `ps`; the password comes in by env var.
    expect(() => optionsOf(['--password', 'hunter2'])).toThrow(/--password/)
  })
})

describe('the sid out of Set-Cookie', () => {
  it('decodes it, because the body.sid path does not (design document §2.2.2)', () => {
    const cookies = ['sid=klay%2C1234%2Cabcdef; Max-Age=1209600; Path=/; HttpOnly; Secure']

    expect(sidOf(cookies)).toBe('klay,1234,abcdef')
  })

  it('finds the sid among other cookies', () => {
    expect(sidOf(['showdown_firstseen=1; Path=/', 'sid=klay%2C1234%2Cabcdef; Path=/'])).toBe(
      'klay,1234,abcdef',
    )
  })

  it('refuses a value that is not the three-part shape', () => {
    // Two parts means the assumption about the format is wrong, and sending
    // it on would fail further away with a less useful message.
    expect(() => sidOf(['sid=klay%2C1234; Path=/'])).toThrow(/three/)
  })

  it('says so when there is no sid at all', () => {
    expect(() => sidOf(['showdown_firstseen=1; Path=/'])).toThrow(/no sid/i)
  })

  it('says so when there is no Set-Cookie at all', () => {
    expect(() => sidOf([])).toThrow(/no sid/i)
  })
})

describe("Showdown's JSON-hijacking prefix", () => {
  it('strips the leading ] before parsing', () => {
    expect(bodyOf(']{"actionsuccess":true}')).toEqual({ actionsuccess: true })
  })

  it('parses a body that has no prefix', () => {
    expect(bodyOf('{"actionsuccess":true}')).toEqual({ actionsuccess: true })
  })

  it('strips only the one prefix, not a ] that belongs to the value', () => {
    expect(bodyOf('][]')).toEqual([])
  })

  it('reports the body when it is not JSON at all', () => {
    expect(() => bodyOf('<html>502</html>')).toThrow(/not JSON/)
  })
})

describe('the rows searchprivate answers with', () => {
  const row = { id: 'gen9vgc2026-1', format: 'Gen 9 VGC', players: ['a', 'b'], password: 'abc' }

  it('accepts an array of listings', () => {
    expect(listingsOf([row])).toEqual([row])
  })

  it('accepts an empty page', () => {
    expect(listingsOf([])).toEqual([])
  })

  it('rejects an action error, which comes back with a 200', () => {
    // `]{"actionerror":"Access denied…"}` is how a rejected sid arrives, and
    // treating it as an empty list would report the check as passing.
    expect(listingsOf({ actionerror: 'Access denied: You must be logged in.' })).toBeNull()
  })

  it('rejects rows that are not listings', () => {
    expect(listingsOf([{ nope: true }])).toBeNull()
  })
})

describe('redaction of the transcript', () => {
  it('replaces every secret it was given, wherever it appears', () => {
    const redact = redactorFor(['hunter2', 'klay,1234,abcdef'])

    expect(redact('sid=klay,1234,abcdef&pass=hunter2')).toBe('sid=[redacted]&pass=[redacted]')
  })

  it('replaces the percent-encoded spelling too', () => {
    // The sid travels encoded in Set-Cookie and decoded in the body, and the
    // transcript shows both.
    const redact = redactorFor(['klay,1234,abcdef'])

    expect(redact('sid=klay%2C1234%2Cabcdef')).toBe('sid=[redacted]')
  })

  it('leaves everything else alone, including an empty secret', () => {
    const redact = redactorFor(['', 'hunter2'])

    expect(redact('actionsuccess: true')).toBe('actionsuccess: true')
  })
})
