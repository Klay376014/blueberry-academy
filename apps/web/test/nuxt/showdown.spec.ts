import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShowdownError } from '../../app/composables/useShowdown'
import page1 from '../fixtures/search-bibasrozkurwiator-page1.json'
import page2 from '../fixtures/search-bibasrozkurwiator-page2.json'
import replay from '../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2667169457.json'

const ORIGIN = 'https://replay.pokemonshowdown.com'

/** A stub for the one thing this layer talks to. No test touches Showdown. */
let fetchMock: ReturnType<typeof vi.fn>

/** Responds with `body` as JSON, the way replay.pokemonshowdown.com does. */
function json(body: unknown) {
  return { ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) }
}

/** A replay id Showdown has never heard of: 404 with nothing in the body. */
function notFound() {
  return { ok: false, status: 404, text: () => Promise.resolve('') }
}

function serverError() {
  return { ok: false, status: 503, text: () => Promise.resolve('') }
}

/** The URLs the layer asked for, in order. */
function requestedUrls() {
  return fetchMock.mock.calls.map(([url]) => String(url))
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("listing a player's replays", () => {
  it('walks the pages until one comes back short of 51', async () => {
    // 51 per page is the page size; anything less is the last page. Waiting
    // for an empty array instead would cost one more request every time.
    fetchMock.mockResolvedValueOnce(json(page1)).mockResolvedValueOnce(json(page2.slice(0, 20)))

    const { replays, truncated } = await useShowdown().listReplays('Bibas Rozkurwiator')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(truncated).toBe(false)
    expect(replays).toHaveLength(51 + 20 - 1)
  })

  it('drops the one row that adjacent pages share', async () => {
    // Real page 1 and page 2 of one player: the offset is 50*(page-1) but 51
    // rows come back, so page 2 starts with the row page 1 ended on. Counting
    // both would overstate the total.
    expect(page2[0]!.id).toBe(page1.at(-1)!.id)

    fetchMock
      .mockResolvedValueOnce(json(page1))
      .mockResolvedValueOnce(json(page2))
      .mockResolvedValueOnce(json([]))

    const { replays } = await useShowdown().listReplays('Bibas Rozkurwiator')

    const ids = replays.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(101)
  })

  it('asks by user id rather than by the name as typed', async () => {
    fetchMock.mockResolvedValue(json([]))

    await useShowdown().listReplays('Not Little Star')

    // Showdown's search takes the normalised id, and it is what makes
    // NotLittleStar and notlittlestar one player.
    expect(requestedUrls()[0]).toBe(`${ORIGIN}/search.json?user=notlittlestar&page=1`)
  })

  it('starts at page 1, because page 0 does not come back as JSON', async () => {
    fetchMock.mockResolvedValue(json([]))

    await useShowdown().listReplays('someone')

    expect(requestedUrls()[0]).toContain('page=1')
  })

  it('stops at page 100 and says the list was cut short', async () => {
    // Showdown answers page > 100 with [] whatever the query, so a single
    // search reaches about 5001 replays and no more. Paging on regardless
    // would spin forever against a full account.
    fetchMock.mockResolvedValue(json(page1))

    const { replays, truncated } = await useShowdown().listReplays('someone')

    expect(fetchMock).toHaveBeenCalledTimes(100)
    expect(requestedUrls().at(-1)).toContain('page=100')
    expect(truncated).toBe(true)
    expect(replays.length).toBeGreaterThan(0)
  })

  it('turns away a name that normalises to nothing, before asking', async () => {
    // `search.json?user=` answers with the site-wide recent replays rather
    // than an error, so this would hand back thousands of strangers' battles
    // as if they were this user's.
    await expect(useShowdown().listReplays('!!!')).rejects.toThrow(/normalises to nothing/)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('says which page of whose replays a 404 was about', async () => {
    fetchMock.mockResolvedValue(notFound())

    const failure = await useShowdown()
      .listReplays('someone')
      .catch((error: unknown) => error)

    // Not "Showdown has no replay …/search.json?…": a listing that 404s is
    // not a replay that does not exist.
    expect((failure as ShowdownError).message).toContain('page 1 of the replays of someone')
  })

  it('reads a listing that is not a list of replays as malformed', async () => {
    fetchMock.mockResolvedValue(json({ error: 'nope' }))

    const failure = await useShowdown()
      .listReplays('someone')
      .catch((error: unknown) => error)

    // Valid JSON, wrong thing. Without a shape check this surfaced as
    // "rows is not iterable", which the import layer cannot report.
    expect((failure as ShowdownError).reason).toBe('malformed')
  })

  it('narrows the search by format when asked, to fetch less', async () => {
    fetchMock.mockResolvedValue(json([]))

    await useShowdown().listReplays('someone', { formatId: 'gen9championsvgc2026regmb' })

    expect(requestedUrls()[0]).toContain('format=gen9championsvgc2026regmb')
  })
})

describe('fetching one replay', () => {
  it('takes a public replay by its id alone', async () => {
    fetchMock.mockResolvedValue(json(replay))

    await useShowdown().fetchReplay({ id: replay.id })

    expect(requestedUrls()[0]).toBe(`${ORIGIN}/${replay.id}.json`)
  })

  it('keeps the pw suffix on a private replay, which cannot be left off', async () => {
    fetchMock.mockResolvedValue(json({ ...replay, private: 1, password: 'sw0rdfish' }))

    await useShowdown().fetchReplay({ id: replay.id, password: 'sw0rdfish' })

    // <id>-<password>pw.json. Without the suffix Showdown does not serve it,
    // which is why the caller passes a password rather than building the ref.
    expect(requestedUrls()[0]).toBe(`${ORIGIN}/${replay.id}-sw0rdfishpw.json`)
  })

  it('carries the format id, which only the single replay knows', async () => {
    fetchMock.mockResolvedValue(json(replay))

    const record = await useShowdown().fetchReplay({ id: replay.id })

    // The listing's `format` is a display name -- '[Gen 9 Champions] VGC 2026
    // Reg M-B' -- and battles.format_id cannot be filled from it.
    expect(record.formatid).toBe('gen9championsvgc2026regmb')
    expect(page1[0]!.format).toBe('[Gen 9 Champions] VGC 2026 Reg M-B')
    expect(record.log).toContain('|player|p1|')
  })

  it('reads a 404 with an empty body as "no such replay"', async () => {
    fetchMock.mockResolvedValue(notFound())

    // The body is empty, not a JSON error object, so anything that tries to
    // parse it throws a SyntaxError the import layer cannot report.
    const failure = await useShowdown()
      .fetchReplay({ id: 'gen9ou-1' })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ShowdownError)
    expect((failure as ShowdownError).reason).toBe('not-found')
    expect((failure as ShowdownError).message).toContain('gen9ou-1')
  })

  it('does not retry a 404, which is an answer rather than a failure', async () => {
    fetchMock.mockResolvedValue(notFound())

    await expect(useShowdown().fetchReplay({ id: 'gen9ou-1' })).rejects.toBeInstanceOf(
      ShowdownError,
    )

    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('reads a replay that is not a replay as malformed', async () => {
    fetchMock.mockResolvedValue(json(null))

    const failure = await useShowdown()
      .fetchReplay({ id: replay.id })
      .catch((error: unknown) => error)

    expect((failure as ShowdownError).reason).toBe('malformed')
  })

  it('reads a body that is not JSON as a malformed answer', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(']{"a":1}') })

    const failure = await useShowdown()
      .fetchReplay({ id: replay.id })
      .catch((error: unknown) => error)

    expect((failure as ShowdownError).reason).toBe('malformed')
  })
})

describe("being a good guest of somebody else's service", () => {
  it('keeps at most 5 requests in the air at once', async () => {
    // A user may have thousands of replays. Workers allows 6 outbound
    // connections, so the cap is 5 wherever this runs.
    let settled = 0
    const release: (() => void)[] = []
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          release.push(() => {
            settled += 1
            resolve(json(replay))
          })
        }),
    )

    const showdown = useShowdown()
    const all = Array.from({ length: 8 }, (_, index) =>
      showdown.fetchReplay({ id: `gen9ou-${index}` }),
    )

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(5)
    })

    // A slot opens as each one lands, and never more than five are out.
    release[0]!()
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(6)
    })

    fetchMock.mockImplementation(() => Promise.resolve(json(replay)))
    release.forEach((resolve) => resolve())
    await Promise.all(all)

    expect(fetchMock).toHaveBeenCalledTimes(8)
    expect(settled).toBeGreaterThan(0)
  })

  it('shares the cap across callers, since Showdown sees one browser', async () => {
    const release: (() => void)[] = []
    fetchMock.mockImplementation(
      () => new Promise((resolve) => release.push(() => resolve(json(replay)))),
    )

    // The listing layer and the import layer each call useShowdown(); a cap
    // that counted per instance would let them add up to ten.
    const first = useShowdown()
    const second = useShowdown()
    const all = [
      ...Array.from({ length: 4 }, (_, i) => first.fetchReplay({ id: `gen9ou-a${i}` })),
      ...Array.from({ length: 4 }, (_, i) => second.fetchReplay({ id: `gen9ou-b${i}` })),
    ]

    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(5)
    })

    fetchMock.mockImplementation(() => Promise.resolve(json(replay)))
    release.forEach((resolve) => resolve())
    await Promise.all(all)
  })

  it('frees the slot a failed request was holding', async () => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => {
      callback()
      return 0
    }) as unknown as typeof setTimeout)

    // Five failures in a row must not leave five slots occupied for good --
    // an import of a thousand replays would stall on the sixth.
    fetchMock.mockResolvedValue(notFound())
    const showdown = useShowdown()
    await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        showdown.fetchReplay({ id: `gen9ou-${i}` }).catch(() => undefined),
      ),
    )

    fetchMock.mockResolvedValue(json(replay))
    await expect(showdown.fetchReplay({ id: replay.id })).resolves.toMatchObject({ id: replay.id })
  })

  it('backs off exponentially before trying again', async () => {
    vi.useFakeTimers()
    const sleeps: number[] = []
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      callback: () => void,
      delay?: number,
    ) => {
      sleeps.push(delay ?? 0)
      callback()
      return 0
    }) as unknown as typeof setTimeout)

    fetchMock
      .mockResolvedValueOnce(serverError())
      .mockResolvedValueOnce(serverError())
      .mockResolvedValueOnce(json(replay))

    const record = await useShowdown().fetchReplay({ id: replay.id })

    expect(record.formatid).toBe('gen9championsvgc2026regmb')
    // Doubling each time, so a struggling service is left more room, not less.
    expect(sleeps).toEqual([500, 1000])
  })

  it('gives up after four attempts rather than hammering forever', async () => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => {
      callback()
      return 0
    }) as unknown as typeof setTimeout)

    fetchMock.mockResolvedValue(serverError())

    const failure = await useShowdown()
      .fetchReplay({ id: replay.id })
      .catch((error: unknown) => error)

    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect((failure as ShowdownError).reason).toBe('unavailable')
  })

  it('gives every request a deadline, so no slot is held for good', async () => {
    fetchMock.mockResolvedValue(json(replay))

    await useShowdown().fetchReplay({ id: replay.id })

    // A connection that is accepted and then answers nothing is the one way
    // a slot would never come back.
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect((init as RequestInit).signal).toBeInstanceOf(AbortSignal)
  })

  it('retries a body that died half-way through the download', async () => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => {
      callback()
      return 0
    }) as unknown as typeof setTimeout)

    // A replay log runs to hundreds of KB, so losing the connection during
    // the body is likelier than losing it before the headers -- and it has to
    // arrive as a reportable failure, not a raw TypeError.
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.reject(new TypeError('network error')),
      })
      .mockResolvedValueOnce(json(replay))

    const record = await useShowdown().fetchReplay({ id: replay.id })

    expect(record.id).toBe(replay.id)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries a connection that never got an answer', async () => {
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void) => {
      callback()
      return 0
    }) as unknown as typeof setTimeout)

    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(replay))

    const record = await useShowdown().fetchReplay({ id: replay.id })

    expect(record.id).toBe(replay.id)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('the search fixtures', () => {
  it('hold public replays only, so no password is committed', () => {
    for (const row of [...page1, ...page2]) {
      expect({ private: row.private, password: row.password }).toEqual({
        private: 0,
        password: null,
      })
    }
  })
})
