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

// The same violation has three spellings (a `features/` specifier, `../../<name>`
// out of a subdirectory, `../<name>` out of a feature root), and one wording for
// all of them, kept here so the three patterns cannot drift apart.
const CROSS_FEATURE_IMPORT =
  'A feature may not import another feature. Move what both need to app/shared/, or let a page compose the two.'

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
        // Bar widths, progress, sprite-sheet offsets and win-rate fills are data, not
        // styling: there is no finite set of utility classes that covers a
        // percentage. Scoped-style `v-bind()` would cover the single-element
        // cases and not the `v-for` ones, so the rule is off for the files
        // that draw, and on everywhere else.
        files: [
          'apps/web/app/shared/components/SpeciesIcon.vue',
          'apps/web/app/features/timeline/components/HealthChange.vue',
          'apps/web/app/features/stats/components/AccountingBar.vue',
          'apps/web/app/features/stats/components/TeamCard.vue',
          'apps/web/app/features/stats/components/TeamDetail.vue',
          'apps/web/app/features/ingest/components/ImportPage.vue',
        ],
        rules: {
          'vize/vue/no-inline-style': 'off',
        },
      },
      {
        // The one outbound link in the app. Its href is built by `replayUrl()`,
        // which puts a stored replay id after a literal https origin, so there
        // is no room in it for a scheme of its own. The rule reports every
        // dynamic `:href` and has no way to see that.
        files: ['apps/web/app/features/timeline/components/BattleDrawer.vue'],
        rules: {
          'vize/vue/no-unsafe-url': 'off',
        },
      },
      {
        // shadcn-vue components are copied in by its CLI, not written here
        // (docs/adr/0005-shadcn-vue-without-nuxt-module.md), so style rules
        // that disagree with the CLI's output only make the next
        // `shadcn-vue add` produce a diff.
        files: ['apps/web/app/shared/components/ui/**'],
        rules: {
          // Nuxt registers these with a `Ui` prefix (`<UiButton>`), so the
          // collision with a real <button> that this rule guards against
          // cannot happen.
          'vize/vue/multi-word-component-names': 'off',
          'vize/vue/prefer-props-shorthand': 'off',
        },
      },

      // The feature seams of apps/web, as a rule rather than as a convention
      // (issue #61). `app/features/<name>/index.ts` is the whole of what a
      // feature offers; everything else under it is its own business.
      //
      // What lint can see is import statements. Nuxt auto-imports have none,
      // so `test/architecture.spec.ts` walks the same seams over the resolved
      // graph and over the auto-imported names as well.
      {
        // A feature may reach for `shared/` and for packages, and for nothing
        // in another feature. Its own files it reaches for relatively, which
        // is why no legitimate import inside a feature names `features/`.
        files: ['apps/web/app/features/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  regex: 'features/',
                  message: CROSS_FEATURE_IMPORT,
                },
                {
                  // `../../<name>` out of a feature subdirectory is the other
                  // spelling of the same thing. Spelled without a lookahead
                  // because oxlint's regexes have none: `../../../` leaves for
                  // app/ and starts with a dot, a feature name with a letter.
                  regex: '^\\.\\./\\.\\./[A-Za-z]',
                  message: CROSS_FEATURE_IMPORT,
                },
              ],
            },
          ],
        },
      },
      {
        // A file at a feature's root (in practice its `index.ts`) is one level
        // above the subdirectory files, so a single `../` already leaves the
        // feature: `../<name>` from here is always a sibling feature, never the
        // feature's own `composables/` or `utils/`. The override above cannot
        // catch it -- such a specifier names no `features/` and has only one
        // `../` -- and the glob has to stop at the root, because the same
        // `../<name>` one level deeper is a file reaching for its own feature's
        // other directories. `*` does not cross a `/`, which is what keeps
        // `features/<name>/composables/*` out of this list.
        files: ['apps/web/app/features/*/*'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  regex: '^\\.\\./[A-Za-z]',
                  message: CROSS_FEATURE_IMPORT,
                },
              ],
            },
          ],
        },
      },
      {
        // shared/ is under every feature, so it may know none of them.
        files: ['apps/web/app/shared/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  regex: 'features/',
                  message:
                    'app/shared/ is what every feature may depend on, so it may depend on no feature.',
                },
              ],
            },
          ],
        },
      },
      {
        // Pages, app.vue, the route middleware, the plugins and the app-level
        // tests are where features meet. They may use a feature — through the
        // one file it offers.
        files: [
          'apps/web/app/pages/**',
          'apps/web/app/app.vue',
          'apps/web/app/middleware/**',
          'apps/web/app/plugins/**',
          'apps/web/test/**',
        ],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  regex: 'features/[^/]+/',
                  message:
                    "Import a feature through `~/features/<name>`, which is its public API. What is inside it is the feature's own business.",
                },
              ],
            },
          ],
        },
      },
    ],
  },
  fmt: {
    semi: false,
    singleQuote: true,
  },
})
