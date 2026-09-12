import { credentialsOf, privateReplayRefs, statusOf } from '../../showdown'

/**
 * `POST /api/showdown/sync-private` — the reader's private replays as
 * `ReplayRef[]`, which the browser then imports through the existing pipeline
 * (design document §4, decision D4). This handler keeps nothing: no Supabase,
 * no KV, no Durable Object.
 *
 * The first route in this app with logic behind it, and it exists only
 * because `replays/searchprivate` sends our origin no CORS headers (§2.1).
 *
 * A shell over `server/showdown.ts` on purpose: everything decided here is a
 * pure function there, because a Nitro handler cannot be called without a
 * server and what it decides is worth a test.
 */
export default defineEventHandler(async (event) => {
  // POST with a body, never a query string: a query string is in every access
  // log along the way (§5.4). The file name is what makes it POST-only.
  const credentials = credentialsOf(await readBody(event))

  if (!credentials) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A Showdown name and password are both required.',
    })
  }

  try {
    return await privateReplayRefs(credentials)
  } catch (error) {
    const statusCode = statusOf(error)

    throw createError({
      statusCode,
      // Showdown's own words only when it was Showdown that said no. Anything
      // else broke while holding the password, so nothing of it is passed on
      // — no message, and no `cause`.
      statusMessage:
        statusCode === 500 ? 'The sync could not be completed.' : (error as Error).message,
    })
  }
})
