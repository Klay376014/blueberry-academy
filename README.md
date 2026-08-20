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

The local ports are shifted by +100 from the CLI defaults (API on 54421, database
on 54422, Studio on 54423) so that a second Supabase project running on the same
machine does not collide with this one.

`supabase/tests/` is where the schema's guarantees are checked: the columns and
indexes design document §5 asks for, what `regulation` derives, and — as two
actual users under RLS — that neither can read, write or delete anything of the
other's, in the database or in the `replay-logs` bucket.

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
