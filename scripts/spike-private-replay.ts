/**
 * Measures the one round trip the whole private-replay feature rests on:
 * `act=login` → the sid out of `Set-Cookie` → `replays/searchprivate` with
 * that sid in the POST body → `act=logout`.
 *
 * Everything in §2.2 of docs/specs/2026-09-11-private-replay-sync-design.md
 * was read out of the loginserver source and never measured. Issue #175 is
 * that gap, and this script is how it gets closed: it runs the trip against a
 * real account and prints a Markdown transcript with the credentials taken
 * out, ready to paste into the spike note.
 *
 * A spike, not a dependency: nothing ships against this file. The Worker
 * route (#178) is written from the note, tested against fixtures, and never
 * talks to Showdown in a test.
 *
 * The password comes in by environment variable and never by flag — argv is
 * readable by every process on the machine through `ps`.
 *
 *   PS_USERNAME=... PS_PASSWORD=... node scripts/spike-private-replay.ts [--keep-session]
 *
 *   --keep-session   skip the logout and print the sid, so the same session
 *                    can be re-tried from a second network (check 7). Resume
 *                    with PS_SID=<that sid> instead of PS_PASSWORD.
 */

const PLAY_ORIGIN = 'https://play.pokemonshowdown.com'
const REPLAY_ORIGIN = 'https://replay.pokemonshowdown.com'

/** What `search.json` answers with, and what `searchprivate` is assumed to match. */
const PAGE_SIZE = 51

const REDACTED = '[redacted]'

export interface Options {
  keepSession: boolean
}

/** One row of `searchprivate`, under Showdown's own field names. */
export interface PrivateListing {
  id: string
  format: string
  players: string[]
  password: string | null
  uploadtime?: number
  private?: number
}

/** One thing #175 asks to be measured, and what the run made of it. */
interface Check {
  claim: string
  verdict: 'confirmed' | 'contradicted' | 'not exercised'
  evidence: string
}

export function optionsOf(argv: string[]): Options {
  const options: Options = { keepSession: false }

  for (const flag of argv) {
    if (flag === '--keep-session') options.keepSession = true
    else if (flag === '--password' || flag === '--pass') {
      throw new Error(`${flag} is not accepted: the password comes in as PS_PASSWORD, not in argv.`)
    } else throw new Error(`Unknown flag ${flag}. Known: --keep-session.`)
  }

  return options
}

/**
 * The sid as `body.sid` needs it. The cookie carries
 * `encodeURIComponent(name,sessionId,sidhash)` and the cookie path decodes it
 * on the way back in; the `body.sid` path does not (design document §2.2.2),
 * so the decoding has to happen here.
 */
export function sidOf(setCookie: string[]): string {
  const header = setCookie.find((cookie) => cookie.trimStart().startsWith('sid='))
  if (!header) throw new Error('Showdown sent no sid cookie.')

  const encoded = header.trimStart().slice('sid='.length).split(';')[0] ?? ''
  const sid = decodeURIComponent(encoded)

  if (sid.split(',').length !== 3) {
    throw new Error('The sid is not the three-part name,sessionId,sidhash shape.')
  }

  return sid
}

/** Showdown prefixes every action response with `]` against JSON hijacking. */
export function bodyOf(text: string): unknown {
  const json = text.startsWith(']') ? text.slice(1) : text

  try {
    return JSON.parse(json)
  } catch {
    throw new Error('Showdown answered with something that is not JSON.')
  }
}

/**
 * A rejected sid arrives as a 200 with `{"actionerror":…}`, which reads as an
 * empty result to anything that only checks for an array.
 */
export function listingsOf(value: unknown): PrivateListing[] | null {
  if (!Array.isArray(value)) return null

  return value.every((row) => typeof (row as PrivateListing | null)?.id === 'string')
    ? (value as PrivateListing[])
    : null
}

/**
 * Takes the credentials back out of the transcript. Both spellings of each,
 * because the sid appears decoded in a body and encoded in a header.
 */
export function redactorFor(secrets: string[]): (text: string) => string {
  const spellings = secrets
    .filter(Boolean)
    .flatMap((secret) => [secret, encodeURIComponent(secret)])
    .sort((a, b) => b.length - a.length)

  return (text) => spellings.reduce((done, spelling) => done.split(spelling).join(REDACTED), text)
}

interface Answer {
  url: string
  status: number
  setCookie: string[]
  text: string
  value: unknown
}

const transcript: string[] = []

async function post(origin: string, act: string, fields: Record<string, string>): Promise<Answer> {
  const url = `${origin}/api/${act}`
  // Credentials go in the body, never the query string: a query string is in
  // every access log along the way (design document §5.4).
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  })

  const text = await response.text()
  const fieldNames = Object.keys(fields).join(', ')

  transcript.push(
    `POST ${url}\n  body fields: ${fieldNames || '(none)'}\n  → ${response.status}` +
      `\n  set-cookie: ${response.headers.getSetCookie().join(' | ') || '(none)'}` +
      `\n  body: ${text.slice(0, 600)}`,
  )

  let value: unknown = null
  try {
    value = bodyOf(text)
  } catch {
    // Left as null; the check that cares reports it.
  }

  return { url, status: response.status, setCookie: response.headers.getSetCookie(), text, value }
}

/**
 * `searchprivate` at whichever host answers it. Which of the two loginserver
 * hostnames serves the replay actions is exactly the kind of thing the spike
 * is here to settle, so both are tried and both are in the transcript.
 */
async function searchPrivate(sid: string, username: string, page: number) {
  const fields: Record<string, string> = { username, page: String(page) }
  if (sid) fields.sid = sid

  const first = await post(REPLAY_ORIGIN, 'replays/searchprivate', fields)
  if (listingsOf(first.value)) return first

  const second = await post(PLAY_ORIGIN, 'replays/searchprivate', fields)

  return listingsOf(second.value) ? second : first
}

function report(checks: Check[], secrets: string[]) {
  const redact = redactorFor(secrets)
  const mark = { confirmed: '✅', contradicted: '❌', 'not exercised': '⚪' }

  const table = checks
    .map((check) => `| ${mark[check.verdict]} | ${check.claim} | ${redact(check.evidence)} |`)
    .join('\n')

  console.log(
    `\n## 結果\n\n| | 主張 | 實測 |\n| --- | --- | --- |\n${table}\n` +
      `\n## 逐一請求\n\n\`\`\`\n${redact(transcript.join('\n\n'))}\n\`\`\`\n`,
  )

  if (checks.some((check) => check.verdict === 'contradicted')) process.exitCode = 1
}

async function main() {
  const options = optionsOf(process.argv.slice(2))
  const username = process.env.PS_USERNAME
  const password = process.env.PS_PASSWORD ?? ''
  const resumedSid = process.env.PS_SID ?? ''

  if (!username) throw new Error('PS_USERNAME is the Showdown name to search for.')
  if (!password && !resumedSid) throw new Error('Set PS_PASSWORD, or PS_SID to resume a session.')

  const checks: Check[] = []
  const secrets = [password, resumedSid]
  let sid = resumedSid

  if (resumedSid) {
    console.log('resuming an existing session: only the searchprivate leg runs (check 7)')
  } else {
    const login = await post(PLAY_ORIGIN, 'login', { name: username, pass: password })
    const body = login.value as Record<string, unknown> | null

    checks.push({
      claim: '`act=login` 回 `{ actionsuccess, assertion, curuser }`',
      verdict: body?.actionsuccess && body.assertion && body.curuser ? 'confirmed' : 'contradicted',
      evidence: `${login.status}, keys: ${Object.keys(body ?? {}).join(', ') || '(none)'}`,
    })

    sid = sidOf(login.setCookie)
    secrets.push(sid)

    checks.push({
      claim: 'sid 由 `Set-Cookie` 發出，值是 `encodeURIComponent(name,sessionId,sidhash)`',
      verdict: 'confirmed',
      evidence: `解碼後三段，第一段是 \`${sid.split(',')[0]}\`（= 帳號 id）`,
    })

    const anonymous = await searchPrivate('', username, 1)
    checks.push({
      claim: '沒有 sid 的 `searchprivate` 會被拒絕（所以通過的那次是 sid 的功勞）',
      verdict: listingsOf(anonymous.value) ? 'contradicted' : 'confirmed',
      evidence: `${anonymous.status} ${anonymous.text.slice(0, 120)}`,
    })
  }

  const first = await searchPrivate(sid, username, 1)
  const rows = listingsOf(first.value)

  checks.push({
    claim: resumedSid
      ? '換一個出口 IP，同一個 sid 仍然有效（`checkLoggedIn` 不比對 IP）'
      : '`sid` 走 POST body 就能拿到含密碼的私人清單',
    verdict: rows ? 'confirmed' : 'contradicted',
    evidence: rows
      ? `${rows.length} 列，${rows.filter((row) => row.password).length} 列帶密碼`
      : `${first.status} ${first.text.slice(0, 160)}`,
  })

  checks.push({
    claim: '回應本體帶前導 `]`',
    verdict: first.text.startsWith(']') ? 'confirmed' : 'contradicted',
    evidence: `body[0] = \`${first.text.slice(0, 1)}\``,
  })

  for (const row of rows ?? []) if (row.password) secrets.push(row.password)

  if (!rows) {
    report(checks, secrets)
    return
  }

  if (rows.length < PAGE_SIZE) {
    checks.push({
      claim: `分頁與 \`search.json\` 同構（一頁 ${PAGE_SIZE} 筆、相鄰頁共用一列）`,
      verdict: 'not exercised',
      evidence: `這個帳號的第一頁只有 ${rows.length} 列，不足一頁`,
    })
  } else {
    const second = await searchPrivate(sid, username, 2)
    const next = listingsOf(second.value) ?? []
    const shared = next.filter((row) => rows.some((seen) => seen.id === row.id)).length

    checks.push({
      claim: `分頁與 \`search.json\` 同構（一頁 ${PAGE_SIZE} 筆、相鄰頁共用一列）`,
      verdict: rows.length === PAGE_SIZE && shared === 1 ? 'confirmed' : 'contradicted',
      evidence: `第一頁 ${rows.length} 列、第二頁 ${next.length} 列、共用 ${shared} 列`,
    })
  }

  if (options.keepSession) {
    checks.push({
      claim: '`act=logout` 之後同一個 sid 會被拒絕',
      verdict: 'not exercised',
      evidence: '--keep-session：session 留著給第二個出口 IP 用',
    })

    report(checks, secrets)
    // Deliberately outside the report, which is redacted: this is the one
    // place the sid is meant to be readable, and it is a credential.
    console.log('\n⚠️  session 仍然開著。第二台機器上執行，用完不要忘記再跑一次收尾：\n')
    console.log(`PS_USERNAME=${username} PS_SID='${sid}' node scripts/spike-private-replay.ts\n`)
    return
  }

  const logout = await post(PLAY_ORIGIN, 'logout', { userid: sid.split(',')[0] ?? '', sid })
  const afterLogout = await searchPrivate(sid, username, 1)

  checks.push({
    claim: '`act=logout` 之後，同一個 sid 再打 `searchprivate` 會被拒絕',
    verdict: !listingsOf(afterLogout.value) ? 'confirmed' : 'contradicted',
    evidence:
      `logout ${logout.status}，之後 searchprivate ${afterLogout.status} ` +
      `${afterLogout.text.slice(0, 120)}`,
  })

  report(checks, secrets)
}

// Only when run, so the tests can import the pure parts above.
if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    // A missing variable is a message, not a stack trace: a person runs this.
    console.error(`spike: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
