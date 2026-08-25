# blueberry-academy

Analyses your Pokémon Showdown replays. See `docs/specs/` for the design and
`CONTEXT.md` for the domain vocabulary.

## Workspace layout

```
apps/web/                  the app — Nuxt, file-based routes, SPA (`ssr: false`)
packages/replay-parser/    pure replay-log parser, zero runtime dependencies
packages/battle-row/       the parsed battle → `battles` row mapping, shared
scripts/                   local maintenance scripts, never deployed
supabase/                  schema migrations, RLS and Storage policies, pgTAP tests
vite.config.ts             `vp` toolchain config for the whole workspace
```

`packages/battle-row/` exists because that mapping has two callers that must
never disagree: the browser writes rows at import time, and `pnpm reparse`
rewrites them from the stored raw log.

`apps/web` builds through Nuxt: `apps/web/nuxt.config.ts` owns the app build and
`apps/web/vitest.config.ts` owns its tests. The root `vite.config.ts` is toolchain
config (lint, fmt, staged) and is shared. The `vp` commands below resolve to
`apps/web` via `defaultPackage`; target another package with
`vp -C packages/replay-parser <command>`.

The app renders client-side only (`ssr: false`) and builds to a `cloudflare_module`
Worker bundle in `apps/web/.output/`. The reasoning is recorded in
`docs/specs/2026-08-16-replay-analytics-design.md` §3 and in `nuxt.config.ts`.

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

`vue-tsc` is the real type gate, run as `vp run type-check` (which calls `nuxt
typecheck`). `vp check` type-checks with tsgolint, which cannot read Vue SFCs, so
`apps/web/vue-shims.d.ts` keeps `*.vue` imports resolvable there. In editors,
[Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) makes the
TypeScript language service aware of `.vue` types.

## Linting Vue templates

oxlint checks the `<script>` block of an SFC but not the `<template>` — oxc's own
compatibility page says "no template linting yet", so `v-for` without a `:key`
and `v-html` on a component used to be caught by nothing.
[`oxlint-plugin-vize`](https://www.npmjs.com/package/oxlint-plugin-vize) fills
that in through the root `vite.config.ts` (`nuxt` preset), inside `vp lint` and
`vp check` rather than beside them.

Two things to know:

- **An SFC with no `<script>` block is skipped entirely**, so its template is
  still unchecked. This is an upstream limitation. The fix upstream offers is the
  separate `oxlint-vize` CLI, which would bypass `vp lint` / `vp check` and give
  up the single toolchain entry point design document §3 keeps — not worth it for
  a gap that closes itself as soon as a page needs a `<script setup>`.
- **`apps/web/vue-shims.d.ts` is still necessary.** Vize adds template
  diagnostics, not module resolution: without the shim, tsgolint still reports
  `TS2307: Cannot find module '../../app/app.vue'`.

Rules that disagree with what the shadcn-vue CLI generates are turned off for
`apps/web/app/components/ui/**` — see the override in the root `vite.config.ts`.

## Customize configuration

App config lives in [`apps/web/nuxt.config.ts`](https://nuxt.com/docs/api/nuxt-config);
toolchain config in the root `vite.config.ts`.

## Commands

`vite-plus` is a devDependency, so `vp` is not on your `PATH`. Go through the
package scripts:

```sh
pnpm install        # install dependencies
pnpm dev            # dev server with hot reload, on http://localhost:3000
pnpm build          # production build into apps/web/.output/
pnpm test:unit      # unit tests
pnpm type-check     # nuxt typecheck (vue-tsc)
pnpm check          # format, lint and type-check everything
pnpm check:fix      # …and fix what it can
pnpm run deploy     # build and deploy to Cloudflare — see Deploying
```

`pnpm run deploy`, not `pnpm deploy`: the bare form is pnpm's own built-in
command for deploying a workspace package, and it will not run this script.

For a `vp` subcommand with no script of its own, use `pnpm exec vp <args>`.

Two things that bite:

- Go through `vp run <script>`, not the built-in `vp dev` / `vp build`. Those are
  _Vite_ commands, and `apps/web` is a Nuxt app — pointing them at it serves a 404. Nuxt's dev server is on port 3000, not Vite's 5173.
- `pnpm` must match `devEngines.packageManager`. Corepack does not switch
  versions on its own, so if it shims `pnpm` you will get a version error —
  `corepack install -g pnpm@<version>` aligns it. The shadcn-vue CLI shells out
  to `corepack pnpm add` internally and fails the same way.

## CI

`.github/workflows/ci.yml` runs on every pull request and on every push to
`main`, in three jobs — plus a fourth that only a push to `main` reaches:

- **`check, type-check, test, build`** — `pnpm check`, `pnpm type-check`,
  `pnpm test:unit` and `pnpm build`, the same four commands as above. pnpm's
  version is pinned in the workflow as well as in `devEngines.packageManager`:
  `pnpm/action-setup` reads the `packageManager` field, which this repo does not
  set, so the two have to move together.
- **`AGENTS.md 實作守則`** — `scripts/check-conventions.sh` over the pull
  request's diff.
- **`pgTAP`** — `supabase start` and then `supabase test db`, which is what
  `pnpm db:test` runs. `supabase/.env` is not present in CI and does not need to
  be: without the Google credentials the stack still starts, and no test signs in.
- **`deploy to Cloudflare`** — `pnpm run deploy`, gated on all three of the
  above and on the push being to `main`. See [Deploying](#deploying).

The hooks in `.vite-hooks/` still run first and still catch most of this before a
push. What CI adds is the part that cannot rest on self-discipline: hooks are
skippable with `--no-verify` and only ever see the machine they run on.

`check-conventions.sh` has two entry points for that reason:

```sh
sh scripts/check-conventions.sh                 # the staged content, from the pre-commit hook
sh scripts/check-conventions.sh <base> <head>   # what <head> adds since it left <base>, from CI
```

The rule bodies are shared; the modes differ only in which files are listed and
which revision their content is read from. In CI that revision is the pull
request's merge commit — what would actually land, rather than what the branch
holds in isolation.

## Database

The schema lives in `supabase/migrations/` at the repo root, not under
`apps/web` — it is not the app's, and the maintenance scripts read it too. Needs
Docker and the [Supabase CLI](https://supabase.com/docs/guides/cli) on your
`PATH`.

```sh
pnpm db:start       # bring the local stack up
pnpm db:reset       # re-apply every migration from zero
pnpm db:test        # pgTAP tests in supabase/tests/
```

The stack sits on the CLI's default ports (API on 54321, database on 54322,
Studio on 54323), so only one local Supabase project can run at a time — stop
the other one with `supabase stop --project-id <its-id>` first. Stopping keeps
its data in a Docker volume.

`supabase/tests/` is where the schema's guarantees are checked. `schema.test.sql`
covers the columns and indexes design document §5 asks for, that `authenticated`
and `service_role` hold the table privileges RLS then filters, and that `anon`
holds none — a grant is the door, a policy only decides which rows are behind
it, the data floor originally stated the second half only, and a hosted project
opens the door by default unless a migration closes it; `behaviour.test.sql`
covers what `regulation` derives, what the unique key refuses, and — as two
actual users under RLS — that neither can read, write or delete anything of the
other's, in the database or in the `replay-logs` bucket. `stats.test.sql` seeds
the same battles as `apps/web/test/fixtures/stats-rows.ts` and checks the half
of the stats layer only a database can answer: that the read `useStats` issues
returns exactly the rows it should — spectated battles and other users' battles
left out — and that the game, series, team and bring counts computed
independently in SQL are the ones the TypeScript tests assert.

## Re-parsing

The raw log in Storage is the only source of truth; every derived column in
`battles` is rebuildable from it. `scripts/reparse.ts` is that rebuild, and it
is what makes a parser change safe — nothing is fetched from Showdown again.

```sh
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… pnpm reparse [flags]

  --stale        only rows whose parser_version is not the current one
  --user <id>    only one user's rows
  --dry-run      report what would change, write nothing
```

Both values for the local stack are printed by `pnpm db:start`
(`supabase status -o env` prints them again). The **service_role key bypasses
RLS**, so it lives in your shell and nowhere else: never in `apps/web/`, never
in a committed file. `scripts/` is a workspace package of its own so that its
dependencies — the service_role client among them — cannot reach the app's
bundle, and `scripts/check-conventions.sh` refuses a commit that imports it from
`apps/web/`. An online admin endpoint and a browser-side re-parse were both
rejected for the same reason (design document §6, decisions Q16/Q19).

A row is only written when a column actually moved, so re-running an unchanged
parser reports every battle as `unchanged` and writes nothing:

```
parser 1: 0 rebuilt, 412 unchanged, 0 still unreadable, 0 without a stored log, 0 failed
```

Two things the comparison has to know, both measured against the local stack:
`played_at` comes back from PostgREST as `…T09:19:18+00:00` where the parser
produced `…T09:19:18.000Z`, and `jsonb` returns `details` with its keys
re-sorted. Compared as strings, every row on the table would look changed.

Identity is resolved from the alias list as it stands _now_, so adding the name
you played under and re-parsing turns spectated battles back into your own.

## Authentication

Google only — there is no password sign-in, in the UI or in the project:
with `[auth.email] enable_signup = false` the local stack reports
`email: false` and the password grant answers `422 email_provider_disabled`. Signing up creates the `profiles` row
through a database trigger, so the alias list always has somewhere to go. Every
route is behind the login except `/login`, `/auth/callback` and `/about`; the
allowlist is in `app/middleware/auth.global.ts` and a new page is protected by
default. The reasoning for hand-wiring the client instead of using
`@nuxtjs/supabase` is in
[ADR-0009](docs/adr/0009-supabase-client-without-the-nuxt-module.md).

To sign in locally you need Google OAuth credentials of your own:

1. In Google Cloud console, create an OAuth 2.0 Client ID (type: Web
   application) and add `http://127.0.0.1:54321/auth/v1/callback` as an
   authorised redirect URI.
2. Put the pair in `supabase/.env`, which the CLI loads on its own (gitignored;
   no need to `source` it):

   ```sh
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID="…apps.googleusercontent.com"
   SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET="GOCSPX-…"
   ```

   Left unset, the stack still starts — the Google button just fails at Google.
   To check the pair landed, without printing the secret:

   ```sh
   curl -s -o /dev/null -w '%{redirect_url}\n' \
     'http://127.0.0.1:54321/auth/v1/authorize?provider=google'
   ```

   A 302 to `accounts.google.com` carrying your `client_id` means yes; an empty
   `client_id` means the CLI never saw the variables.

3. Copy `apps/web/.env.example` to `apps/web/.env` and fill in the anon key that
   `pnpm db:start` printed.

The hosted project takes the same pair with its own redirect URI; the two sets
of values and where each lives are in [Hosted project](#hosted-project).

If the last hop of the round trip lands on a refused connection, check what the
dev server is actually bound to:

```sh
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

`redirectTo` is built from `window.location.origin`, so the browser comes back
to whichever of `localhost` / `127.0.0.1` you started on — and a dev server
bound to `[::1]` only serves the first of those. `nuxt.config.ts` pins the host
to `127.0.0.1` so that both names reach it; that line is load-bearing for the
OAuth flow, not a preference.

## Hosted project

`scripts/setup-hosted-supabase.sh` stands one up, from nothing to a project two
accounts have proved they cannot read each other on.

```sh
bash scripts/setup-hosted-supabase.sh
```

Eight stages: it creates the project, links it, pushes `supabase/migrations/`,
checks the schema, the bucket and the grants against the live API, walks you
through the redirect URI at Google, pushes the Auth settings, and then stands
beside the two things only real accounts can prove — that the `profiles` trigger
fired, and that neither account can reach the other's battles or raw log. You
drive the browser where a browser is unavoidable; it does the rest.

Re-running it is safe. A project it already created is skipped — the ref is in
`.env.hosted` — and `link` and `db push` have nothing to add on a project that
is already current. The values it captures go where the rest of the tooling
reads them: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into `.env.hosted` at
the repo root, `NUXT_PUBLIC_SUPABASE_URL` and `NUXT_PUBLIC_SUPABASE_ANON_KEY`
into `apps/web/.env.hosted`.

One thing a clone cannot inherit: the Google OAuth client. Its secret is not in
the repo, so anyone standing up their own project brings their own pair — see
[Authentication](#authentication) — and adds that project's callback URI to it.

Both halves go up as files rather than as clicks: `supabase db push` carries
`supabase/migrations/` — schema, RLS policies and the `replay-logs` bucket —
and `supabase config push` carries `supabase/config.toml`'s `[auth]`, so the
Google provider and `enable_signup = false` are the same statement the local
stack reads. Studio is where you look at the result, not where it was decided.

Two sets of values, and mixing them is the failure mode to expect:

| value                                                        | local                                           | hosted                                              |
| ------------------------------------------------------------ | ----------------------------------------------- | --------------------------------------------------- |
| `NUXT_PUBLIC_SUPABASE_URL`, `NUXT_PUBLIC_SUPABASE_ANON_KEY`  | `apps/web/.env`, printed by `pnpm db:start`     | `apps/web/.env.hosted`, written by the wizard       |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (`pnpm reparse`) | `supabase status -o env`                        | `.env.hosted` at the repo root                      |
| Google client id and secret                                  | `supabase/.env`, which the CLI loads on its own | the same pair — one OAuth client, two redirect URIs |
| Google redirect URI                                          | `http://127.0.0.1:54321/auth/v1/callback`       | `https://<ref>.supabase.co/auth/v1/callback`        |

The anon (or publishable) key is meant to be in the browser: the table grants
and RLS are the defence, not the key's secrecy. The **service_role key bypasses
RLS**, so it stays in `.env.hosted` and your shell — never in `apps/web/`, never
in a committed file. `.gitignore` covers `.env` and `.env.*` with
`.env.example` as the one exception, and `scripts/check-conventions.sh` fails a
commit that puts a service_role key into the app.

To point the local dev server at the hosted project without disturbing
`apps/web/.env`:

```sh
cd apps/web && pnpm exec nuxt dev --dotenv .env.hosted
```

`redirectTo` is built from `window.location.origin`, so whichever origin you
browse from has to be in the hosted project's allowlist — `config.toml`'s
`site_url` and `additional_redirect_urls`, pushed with `supabase config push`.
That list holds the deployed origin as well as the two local ones — see
[Deploying](#deploying).

## Deploying

**Merging to `main` puts the site up.** The `deploy to Cloudflare` job runs
`pnpm run deploy` after the three check jobs pass, so a red gate produces no
deploy and nothing has to be remembered. Deploying by hand is the same command:

```sh
pnpm run deploy
```

Reach for the manual form when CI cannot do it — rolling back to an older commit
without a revert, or pushing while the gate is broken for reasons unrelated to
the app. `wrangler login` once, and it deploys from your machine with the values
in `apps/web/.env.hosted`; the next push to `main` overwrites whatever you sent.
Cloudflare's dashboard keeps previous versions, so a rollback can also be done
there without this repo at all.

CI needs four secrets, and they are the whole list:

| secret                          | what it is                           |
| ------------------------------- | ------------------------------------ |
| `CLOUDFLARE_API_TOKEN`          | an **Edit Cloudflare Workers** token |
| `CLOUDFLARE_ACCOUNT_ID`         | the account the Worker lives in      |
| `NUXT_PUBLIC_SUPABASE_URL`      | the hosted project's URL             |
| `NUXT_PUBLIC_SUPABASE_ANON_KEY` | its anon key                         |

The **service_role key is not among them and must never be**: it belongs to
`scripts/`, which is never deployed, and the deploy path has no reason to touch
it (`scripts/check-conventions.sh` enforces the same rule on the app's source).

The site is a Worker on Cloudflare at
**<https://blueberry-academy.ivy-cudgel.com>**. `scripts/deploy.sh` builds,
uploads and then checks the result; `apps/web/wrangler.jsonc` says what gets
uploaded — `.output/server/index.mjs` as the Worker, `.output/public/` as its
assets, both produced by Nitro's `cloudflare_module` preset
([ADR-0002](docs/adr/0002-cloudflare-module-preset.md)).

You need `wrangler login` once, and the `ivy-cudgel.com` zone has to be in the
same Cloudflare account — that is what lets `custom_domain: true` create the DNS
record on its own.

**The two `NUXT_PUBLIC_*` values are runtime variables of the Worker, not build
inputs.** `ssr: false` makes this counter-intuitive enough to be worth stating
plainly: it turns off server-rendering of the page components, but the Nitro
server is still there, and every HTML response is a SPA shell it computes per
request — `runtimeConfig.public` is written into the payload at that moment,
from the Worker's environment. The build output contains neither value.
[ADR-0011](docs/adr/0011-nuxt-public-as-worker-runtime-vars.md) has the
measurement.

So the deploy passes them with `--var`, reading them from
`apps/web/.env.hosted`, or from the environment when it is set — which is how CI
will supply them from secrets:

```sh
NUXT_PUBLIC_SUPABASE_URL=… NUXT_PUBLIC_SUPABASE_ANON_KEY=… pnpm run deploy
```

`--var` replaces the whole set on every deploy, so both values go in every time;
omitting one empties it rather than keeping the previous value. Both are public
by design (RLS is the defence), and the **service_role key has no part in this
path at all** — it belongs to `scripts/`, which is never deployed.

The script fails rather than deploys when the URL is not the hosted project's
`https://<ref>.supabase.co`, and after uploading it fetches the live origin and
looks for that URL in the served shell. A deploy that succeeded but points the
site at `http://127.0.0.1:54321` is the failure worth spending a request to rule
out: nothing about it looks wrong until someone tries to sign in.

Auth has to know about the origin too. `redirectTo` is built from
`window.location.origin`, so `supabase/config.toml` carries the deployed origin
in `site_url` and `additional_redirect_urls`, and `supabase config push` is what
puts it on the hosted project. Google's own OAuth client is unaffected: its
redirect URI is Supabase's `https://<ref>.supabase.co/auth/v1/callback`, which
does not change when the site gets a domain.

To look at the production bundle locally before sending it up:

```sh
pnpm build
cd apps/web && pnpm exec wrangler dev --var NUXT_PUBLIC_SUPABASE_URL:… --var NUXT_PUBLIC_SUPABASE_ANON_KEY:…
```

## UI and i18n

Tailwind v4 through `@tailwindcss/vite`, shadcn-vue components copied into
`apps/web/app/components/ui/` and auto-imported with a `Ui` prefix
(`<UiButton>`), `@nuxtjs/i18n` with English as the default locale. The decisions
and their evidence are in [ADR-0004](docs/adr/0004-tailwind-v4-through-vite-plugin.md)
through [ADR-0007](docs/adr/0007-self-hosted-inter.md).

Adding a component:

```sh
cd apps/web && pnpm dlx shadcn-vue@latest add <component>
pnpm check:fix      # the CLI emits double quotes; the formatter wants single
```

Pokémon, move and item names are identifiers, not copy — they stay English and
never enter the locale files.

### Dex display tables

A species id is what the parser stores (`hooh`), not what a person reads
(`Ho-Oh`), and `toID()` cannot be reversed by any rule. Two committed tables
close that gap, both written by one generator:

```sh
pnpm --filter web gen:species-names
```

It walks `Dex.species.all()` once and writes
`apps/web/app/lib/dex/species-names.json` (id → official English name) and
`species-icons.json` (id → slot on Showdown's icon sheet). Read them through
`speciesName()` and `speciesIcon()` in `apps/web/app/utils/`, which are Nuxt
auto-imports; an id neither table knows degrades to the raw id and to the
sheet's placeholder icon rather than throwing.

`@pkmn/dex` and `@pkmn/img` are build-time devDependencies and must stay that
way — the tables are committed because the Worker free plan cannot afford a
runtime lookup. The icon slots come from `@pkmn/img` rather than from
`species.num`: Ninetales-Alola shares dex number 38 with Ninetales, and 524 of
the 1517 species are Megas, Gmax, regional or cosmetic formes that Showdown
keeps in a separate range of the sheet.
