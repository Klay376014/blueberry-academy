# blueberry-academy

Analyses your Pokémon Showdown replays. See `docs/specs/` for the design and
`CONTEXT.md` for the domain vocabulary.

## Workspace layout

```
apps/web/                  the app — Nuxt, file-based routes, SPA (`ssr: false`)
packages/replay-parser/    pure replay-log parser, zero runtime dependencies
supabase/                  schema migrations, RLS and Storage policies, pgTAP tests
vite.config.ts             `vp` toolchain config for the whole workspace
```

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
```

For a `vp` subcommand with no script of its own, use `pnpm exec vp <args>`.

Two things that bite:

- Go through `vp run <script>`, not the built-in `vp dev` / `vp build`. Those are
  _Vite_ commands, and `apps/web` is a Nuxt app — pointing them at it serves a 404. Nuxt's dev server is on port 3000, not Vite's 5173.
- `pnpm` must match `devEngines.packageManager`. Corepack does not switch
  versions on its own, so if it shims `pnpm` you will get a version error —
  `corepack install -g pnpm@<version>` aligns it. The shadcn-vue CLI shells out
  to `corepack pnpm add` internally and fails the same way.

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
covers the columns and indexes design document §5 asks for; `behaviour.test.sql`
covers what `regulation` derives, what the unique key refuses, and — as two
actual users under RLS — that neither can read, write or delete anything of the
other's, in the database or in the `replay-logs` bucket.

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

For the hosted project the same two values go in Supabase's Auth settings, with
the redirect URI pointing at that project instead.

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
