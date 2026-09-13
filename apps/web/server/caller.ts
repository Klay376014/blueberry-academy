/**
 * Who is calling `POST /api/showdown/sync-private`.
 *
 * Without this the route is an open Showdown login proxy: anyone who knows
 * the URL can post name/password pairs and read the refused-versus-accepted
 * distinction, which is a credential-stuffing oracle running on our domain
 * and our egress (design document §8, "未解決：這條 route 對第三方是開放的").
 *
 * The check is one call to Supabase's own `/auth/v1/user` with the caller's
 * access token. It needs no secret — the anon key and the reader's own token
 * are enough — and it keeps the route stateless, which §5.1 rests on.
 *
 * This is the first thing in `server/` that knows Supabase exists; see
 * docs/adr/0009-supabase-client-without-the-nuxt-module.md, which is amended
 * for it.
 */

/** Generous, and far below what one invocation is allowed to take. */
const TIMEOUT_MS = 5_000

export type CallerFailure =
  /** No token, or one Supabase will not vouch for. */
  | 'unauthenticated'
  /** Supabase could not be asked, so nothing is known either way. */
  | 'unavailable'

/** Carries no `cause`, for the reason ShowdownSyncError does not. */
export class CallerError extends Error {
  constructor(
    readonly reason: CallerFailure,
    message: string,
  ) {
    super(message)
    this.name = 'CallerError'
  }
}

export interface Caller {
  id: string
}

export interface CallerRequest {
  token: string
  supabaseUrl: string
  anonKey: string
  fetch?: typeof globalThis.fetch
}

/**
 * The token out of an `Authorization` header, or null if there is not one.
 * Null rather than a throw: "no token" and "a token Supabase rejected" are
 * the same answer to the caller and the same status on the way out.
 */
export function bearerOf(header: string | null | undefined): string | null {
  const [scheme, ...rest] = (header ?? '').trim().split(/\s+/)
  if (scheme?.toLowerCase() !== 'bearer') return null

  return rest.join(' ') || null
}

/** The signed-in reader the token belongs to, or a reason there is not one. */
export async function callerOf({
  token,
  supabaseUrl,
  anonKey,
  fetch = globalThis.fetch,
}: CallerRequest): Promise<Caller> {
  // A Worker that was never told where Supabase is cannot check anybody, and
  // the safe answer to "I do not know" is no.
  if (!supabaseUrl || !anonKey) {
    throw new CallerError('unavailable', 'This deployment cannot check who is calling.')
  }

  let response: Response
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      // The token goes in a header, never the URL: a query string is in every
      // access log along the way (§5.4), and this one is a live session.
      headers: { authorization: `Bearer ${token}`, apikey: anonKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new CallerError('unavailable', 'We could not check who is calling.')
  }

  // 401 and 403 are answers about the token; anything else is about Supabase.
  // Telling a signed-in reader to sign in again would send them round a loop
  // that cannot fix what is wrong.
  if (response.status === 401 || response.status === 403) {
    throw new CallerError('unauthenticated', 'That session is not valid.')
  }

  if (!response.ok) {
    throw new CallerError('unavailable', 'We could not check who is calling.')
  }

  const user = (await response.json().catch(() => null)) as { id?: unknown } | null

  if (typeof user?.id !== 'string' || !user.id) {
    throw new CallerError('unauthenticated', 'That session names nobody.')
  }

  return { id: user.id }
}
