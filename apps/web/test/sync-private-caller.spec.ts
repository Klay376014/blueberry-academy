// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CallerError, bearerOf, callerOf } from '../server/caller'

const SUPABASE_URL = 'https://project.supabase.co'
const ANON_KEY = 'anon-key'
const TOKEN = 'a.jwt.value'

describe('the bearer token out of a header', () => {
  it('takes the value after Bearer', () => {
    expect(bearerOf(`Bearer ${TOKEN}`)).toBe(TOKEN)
  })

  it('does not care how Bearer is capitalised', () => {
    expect(bearerOf(`bearer ${TOKEN}`)).toBe(TOKEN)
  })

  it('has nothing for a header that is not there', () => {
    expect(bearerOf(undefined)).toBeNull()
    expect(bearerOf('')).toBeNull()
  })

  it('has nothing for a scheme it does not know', () => {
    expect(bearerOf(`Basic ${TOKEN}`)).toBeNull()
    expect(bearerOf(TOKEN)).toBeNull()
  })

  it('has nothing for a Bearer with no token after it', () => {
    expect(bearerOf('Bearer')).toBeNull()
    expect(bearerOf('Bearer   ')).toBeNull()
  })
})

function supabase(answer: (headers: Headers) => Response) {
  const calls: { url: string; headers: Headers }[] = []

  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    calls.push({ url: String(input), headers })

    return answer(headers)
  }) as unknown as typeof fetch

  return { calls, fetcher }
}

const user = () => new Response(JSON.stringify({ id: 'user-1', aud: 'authenticated' }))

describe('who is calling', () => {
  it('asks Supabase, with the token and the anon key', async () => {
    const { calls, fetcher } = supabase(user)

    await callerOf({ token: TOKEN, supabaseUrl: SUPABASE_URL, anonKey: ANON_KEY, fetch: fetcher })

    expect(calls[0]?.url).toBe(`${SUPABASE_URL}/auth/v1/user`)
    expect(calls[0]?.headers.get('authorization')).toBe(`Bearer ${TOKEN}`)
    expect(calls[0]?.headers.get('apikey')).toBe(ANON_KEY)
  })

  it('hands back the id of whoever the token belongs to', async () => {
    const { fetcher } = supabase(user)

    expect(
      await callerOf({
        token: TOKEN,
        supabaseUrl: SUPABASE_URL,
        anonKey: ANON_KEY,
        fetch: fetcher,
      }),
    ).toEqual({ id: 'user-1' })
  })

  it('refuses a token Supabase does not accept', async () => {
    const { fetcher } = supabase(() => new Response('{}', { status: 401 }))

    await expect(
      callerOf({ token: TOKEN, supabaseUrl: SUPABASE_URL, anonKey: ANON_KEY, fetch: fetcher }),
    ).rejects.toMatchObject({ reason: 'unauthenticated' })
  })

  it('refuses an answer with no user in it', async () => {
    // A 200 that is not a user is not a signed-in caller either.
    const { fetcher } = supabase(() => new Response('{}'))

    await expect(
      callerOf({ token: TOKEN, supabaseUrl: SUPABASE_URL, anonKey: ANON_KEY, fetch: fetcher }),
    ).rejects.toMatchObject({ reason: 'unauthenticated' })
  })

  it('does not call a Supabase it has not been told about', async () => {
    // An unconfigured Worker must refuse rather than let everyone through.
    const { calls, fetcher } = supabase(user)

    await expect(
      callerOf({ token: TOKEN, supabaseUrl: '', anonKey: ANON_KEY, fetch: fetcher }),
    ).rejects.toBeInstanceOf(CallerError)
    expect(calls).toHaveLength(0)
  })

  it('says unavailable rather than unauthenticated when Supabase is down', async () => {
    // Telling a signed-in reader to sign in again would send them round a
    // loop that cannot fix anything.
    const { fetcher } = supabase(() => new Response('', { status: 503 }))

    await expect(
      callerOf({ token: TOKEN, supabaseUrl: SUPABASE_URL, anonKey: ANON_KEY, fetch: fetcher }),
    ).rejects.toMatchObject({ reason: 'unavailable' })
  })

  it('says unavailable when Supabase cannot be reached at all', async () => {
    const unreachable = (() => {
      throw new Error('the socket went away')
    }) as unknown as typeof fetch

    await expect(
      callerOf({ token: TOKEN, supabaseUrl: SUPABASE_URL, anonKey: ANON_KEY, fetch: unreachable }),
    ).rejects.toMatchObject({ reason: 'unavailable' })
  })

  it('never puts the token in the URL', async () => {
    const { calls, fetcher } = supabase(user)

    await callerOf({ token: TOKEN, supabaseUrl: SUPABASE_URL, anonKey: ANON_KEY, fetch: fetcher })

    expect(calls[0]?.url).not.toContain(TOKEN)
  })
})
