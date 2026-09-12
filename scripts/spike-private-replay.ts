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
import { toID } from 'replay-parser'

const PLAY_ORIGIN = 'https://play.pokemonshowdown.com'

/**
 * Where `searchprivate` actually answers, measured. `play.` knows the action
 * too but the listing came back from here; see the spike note, "transcript
 * 才看得到的三件事".
 */
const REPLAY_ORIGIN = 'https://replay.pokemonshowdown.com'

/** What `search.json` answers with, and what `searchprivate` is assumed to match. */
const PAGE_SIZE = 51

/** Per response in the printed transcript. Applied after redaction, never before. */
const TRANSCRIPT_BODY = 600

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

/**
 * Flags that would put a credential in argv. Refused rather than read: the
 * whole point of PS_PASSWORD is that `ps` cannot see it.
 */
const CREDENTIAL_FLAGS = ['--password', '--pass', '--sid']

export function optionsOf(argv: string[]): Options {
  const options: Options = { keepSession: false }

  for (const argument of argv) {
    // Split first: `--password=hunter2` is one argv entry, and neither the
    // comparison below nor the error message may ever see the half after `=`.
    const flag = argument.split('=')[0] ?? ''

    if (flag === '--keep-session') options.keepSession = true
    else if (CREDENTIAL_FLAGS.includes(flag)) {
      throw new Error(`${flag} is not accepted: credentials come in by environment variable.`)
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
  status: number
  setCookie: string[]
  text: string
  value: unknown
}

/**
 * Every credential this run has seen, so that one redactor covers the whole
 * transcript. A replay password found on page 3 has to reach the redaction of
 * page 1, which is why this is collected as it goes rather than at the end.
 */
const secrets: string[] = []

function remember(...values: (string | null | undefined)[]) {
  for (const value of values) if (value) secrets.push(value)
}

/** Responses in full. Truncation happens in the report, after redaction. */
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
  const setCookie = response.headers.getSetCookie()

  transcript.push(
    `POST ${url}\n  body fields: ${Object.keys(fields).join(', ') || '(none)'}` +
      `\n  → ${response.status}\n  set-cookie: ${setCookie.join(' | ') || '(none)'}\n  body: ${text}`,
  )

  let value: unknown = null
  try {
    value = bodyOf(text)
  } catch {
    // Left as null; the check that cares reports it.
  }

  return { status: response.status, setCookie, text, value }
}

/**
 * `searchprivate` at whichever host answers it. Which of the two loginserver
 * hostnames serves the replay actions is exactly the kind of thing the spike
 * is here to settle, so both are tried and both are in the transcript.
 */
async function searchPrivate(sid: string, username: string, page: number): Promise<Answer> {
  const fields: Record<string, string> = { username, page: String(page) }
  if (sid) fields.sid = sid

  // Before anything prints: these are live passwords to the reader's private
  // replays, and every page has its own set.
  const keep = (answer: Answer) => {
    for (const row of listingsOf(answer.value) ?? []) remember(row.password)

    return answer
  }

  const first = keep(await post(REPLAY_ORIGIN, 'replays/searchprivate', fields))
  if (listingsOf(first.value)) return first

  const second = keep(await post(PLAY_ORIGIN, 'replays/searchprivate', fields))

  return listingsOf(second.value) ? second : first
}

function report(checks: Check[]) {
  const redact = redactorFor(secrets)
  const mark = { confirmed: '✅', contradicted: '❌', 'not exercised': '⚪' }

  const table = checks
    .map((check) => `| ${mark[check.verdict]} | ${check.claim} | ${redact(check.evidence)} |`)
    .join('\n')

  // Redact, then truncate. The other order leaves the front half of a secret
  // that straddles the cut, which no whole-string replacement can match.
  const requests = transcript
    .map((entry) => {
      const [head, ...body] = redact(entry).split('\n  body: ')

      return `${head}\n  body: ${body.join('\n  body: ').slice(0, TRANSCRIPT_BODY)}`
    })
    .join('\n\n')

  console.log(
    `\n## 結果\n\n| | 主張 | 實測 |\n| --- | --- | --- |\n${table}\n` +
      `\n## 逐一請求\n\n\`\`\`\n${requests}\n\`\`\`\n`,
  )

  if (checks.some((check) => check.verdict === 'contradicted')) process.exitCode = 1
}

async function main() {
  const options = optionsOf(process.argv.slice(2))
  // The same normalisation the app applies (useShowdown.listReplays), so a
  // name typed with spaces or capitals cannot look like a failed spike.
  const username = toID(process.env.PS_USERNAME ?? '')
  const password = process.env.PS_PASSWORD ?? ''
  const resumedSid = process.env.PS_SID ?? ''

  if (!username) throw new Error('PS_USERNAME is the Showdown name to search for.')
  if (!password && !resumedSid) throw new Error('Set PS_PASSWORD, or PS_SID to resume a session.')

  remember(password, resumedSid)

  const checks: Check[] = []
  let sid = resumedSid

  try {
    if (resumedSid) {
      console.log('resuming an existing session: only the searchprivate leg runs (check 7)')
    } else {
      const login = await post(PLAY_ORIGIN, 'login', { name: username, pass: password })
      const body = login.value as Record<string, unknown> | null
      const refusal = typeof body?.actionerror === 'string' ? body.actionerror : null

      // Presence, not content: the measured `assertion` is the string "This
      // server is requesting an invalid login key", because one is only
      // issued against a challstr from the sim server. The login still
      // succeeds and the sid still works — see the spike note.
      checks.push({
        claim: '`act=login` 回 `{ actionsuccess, assertion, curuser }`',
        verdict:
          !refusal && body?.actionsuccess && body.assertion && body.curuser
            ? 'confirmed'
            : 'contradicted',
        evidence: refusal
          ? `${login.status} actionerror: ${refusal}`
          : `${login.status}, keys: ${Object.keys(body ?? {}).join(', ') || '(none)'}`,
      })

      // Said here rather than left to `sidOf`, whose "no sid cookie" is true
      // but unhelpful when what happened is a wrong password.
      if (refusal) throw new Error(`Showdown refused the login: ${refusal}`)

      sid = sidOf(login.setCookie)
      remember(sid)

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

    const pagination = `分頁與 \`search.json\` 同構（一頁 ${PAGE_SIZE} 筆、相鄰頁共用一列）`

    if (!rows) {
      checks.push({ claim: pagination, verdict: 'not exercised', evidence: '第一頁就沒拿到清單' })
    } else if (rows.length < PAGE_SIZE) {
      checks.push({
        claim: pagination,
        verdict: 'not exercised',
        evidence: `這個帳號的第一頁只有 ${rows.length} 列，不足一頁`,
      })
    } else {
      const second = await searchPrivate(sid, username, 2)
      const next = listingsOf(second.value)

      // A rejected page 2 is not an empty page 2. Collapsing the two would
      // report a network hiccup as evidence that Showdown pages differently.
      if (!next) {
        checks.push({
          claim: pagination,
          verdict: 'not exercised',
          evidence: `第二頁沒有回清單：${second.status} ${second.text.slice(0, 120)}`,
        })
      } else {
        const shared = next.filter((row) => rows.some((seen) => seen.id === row.id)).length

        checks.push({
          claim: pagination,
          verdict: rows.length === PAGE_SIZE && shared === 1 ? 'confirmed' : 'contradicted',
          evidence: `第一頁 ${rows.length} 列、第二頁 ${next.length} 列、共用 ${shared} 列`,
        })
      }
    }
  } finally {
    // In a finally because the sid is a live credential and the transcript it
    // would be recoverable from is redacted: any path that leaves this
    // function without logging out leaves a session nobody can close.
    if (sid && !options.keepSession) {
      try {
        const logout = await post(PLAY_ORIGIN, 'logout', { userid: sid.split(',')[0] ?? '', sid })
        const afterLogout = await searchPrivate(sid, username, 1)

        checks.push({
          claim: '`act=logout` 之後，同一個 sid 再打 `searchprivate` 會被拒絕',
          verdict: !listingsOf(afterLogout.value) ? 'confirmed' : 'contradicted',
          evidence:
            `logout ${logout.status}，之後 searchprivate ${afterLogout.status} ` +
            `${afterLogout.text.slice(0, 120)}`,
        })
      } catch (error) {
        // Never out of the finally: it would replace whatever brought us here
        // with a network message, and the report below is the useful part.
        checks.push({
          claim: '`act=logout` 之後，同一個 sid 再打 `searchprivate` 會被拒絕',
          verdict: 'not exercised',
          evidence: `登出失敗，session 可能還開著：${error instanceof Error ? error.message : ''}`,
        })
      }
    } else if (sid) {
      checks.push({
        claim: '`act=logout` 之後同一個 sid 會被拒絕',
        verdict: 'not exercised',
        evidence: '--keep-session：session 留著給第二個出口 IP 用',
      })
    }

    report(checks)
  }

  if (options.keepSession && sid) {
    // Deliberately outside the report, which is redacted: this is the one
    // place the sid is meant to be readable, and it is a credential.
    console.log('\n⚠️  session 仍然開著。第二台機器上執行，用完不要忘記再跑一次收尾：\n')
    console.log(`PS_USERNAME=${username} PS_SID='${sid}' node scripts/spike-private-replay.ts\n`)
  }
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
