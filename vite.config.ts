import { defineConfig } from 'vite-plus'

// Toolchain configuration for the whole workspace. This is `vp` config, not Vite
// config — per-app Vite/Vitest settings live in each package's own vite.config.ts.
// See node_modules/vite-plus/docs/guide/monorepo.md
export default defineConfig({
  // `vp dev` / `vp build` at the root would otherwise have to guess (or prompt)
  // which package to act on.
  defaultPackage: './apps/web',
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
