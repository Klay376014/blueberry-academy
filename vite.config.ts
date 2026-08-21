import { defineConfig } from 'vite-plus'
import { createVizeLintConfig } from 'oxlint-plugin-vize'

// oxlint checks the <script> block of an SFC but not the <template> -- oxc's
// own compatibility page says "no template linting yet". Vize fills that in,
// so `v-for` without a `:key` and `v-html` on a component are caught by
// `vp lint` instead of by nobody.
//
// Known gap: an SFC with no <script> block at all is skipped entirely, so its
// template is still unchecked. The upstream answer is the `oxlint-vize` CLI,
// which would bypass `vp lint` / `vp check` and give up the single toolchain
// entry point design document §3 keeps. Accepted as-is; in practice a page
// that does anything has a <script setup>.
const vize = createVizeLintConfig({ preset: 'nuxt' })

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
  // `createVizeLintConfig` returns a whole lint config, jsPlugins included, so
  // it has to be spread and then merged into -- handing it the existing
  // settings would drop vite-plus's own plugin and fail with
  // "Plugin 'vite-plus' not found".
  lint: {
    ...vize,
    jsPlugins: [...vize.jsPlugins, { name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { ...vize.rules, 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        // shadcn-vue components are copied in by its CLI, not written here
        // (docs/adr/0005-shadcn-vue-without-nuxt-module.md), so style rules
        // that disagree with the CLI's output only make the next
        // `shadcn-vue add` produce a diff.
        files: ['apps/web/app/components/ui/**'],
        rules: {
          // Nuxt registers these with a `Ui` prefix (`<UiButton>`), so the
          // collision with a real <button> that this rule guards against
          // cannot happen.
          'vize/vue/multi-word-component-names': 'off',
          'vize/vue/prefer-props-shorthand': 'off',
        },
      },
    ],
  },
  fmt: {
    semi: false,
    singleQuote: true,
  },
})
