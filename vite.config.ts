import { defineConfig } from 'vite-plus'

// Toolchain configuration for the whole workspace. This is `vp` config, not Vite
// config — `apps/web` is a Nuxt app, so its build and dev server belong to
// nuxt.config.ts, and its test settings to vitest.config.ts.
// See node_modules/vite-plus/docs/guide/monorepo.md
//
// There is deliberately no `defaultPackage`: the built-in `vp dev` / `vp build`
// are Vite commands, and pointing them at a Nuxt app serves a 404. The root
// package.json scripts delegate to each package's own scripts instead.
export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    semi: false,
    singleQuote: true,
  },
})
