# blueberry-academy

Analyses your Pokémon Showdown replays. See `docs/specs/` for the design and
`CONTEXT.md` for the domain vocabulary.

## Workspace layout

```
apps/web/                  the app — Nuxt, file-based routes, SPA (`ssr: false`)
packages/replay-parser/    pure replay-log parser, zero runtime dependencies
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

```sh
vp install          # install dependencies
vp run dev          # dev server with hot reload
vp run build        # production build into apps/web/.output/
vp run test:unit    # unit tests
vp run type-check   # nuxt typecheck (vue-tsc)
vp check            # format, lint and type-check everything
```
