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

The app renders client-side only. The dashboard lives behind a login so it has no
SEO value, and server-rendering chart-heavy pages would very likely exceed the 10ms
CPU limit of the Cloudflare Workers free plan. `vp run build` emits a
`cloudflare_module` Worker bundle into `apps/web/.output/`.

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

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
pnpm install
```

### Compile and Hot-Reload for Development

```sh
pnpm dev
```

### Type-Check, Compile and Minify for Production

```sh
pnpm build
```

### Run Unit Tests with [Vitest](https://vitest.dev/)

```sh
pnpm test:unit
```
