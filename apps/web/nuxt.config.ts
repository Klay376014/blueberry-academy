// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

// The key order is not editorial: vize's nuxt/nuxt-config-keys-order enforces
// it. The rule reports one key at a time and does not publish the order it
// wants, so it was found by asking repeatedly:
//
//   modules, ssr, components, css, colorMode, runtimeConfig, devServer,
//   compatibilityDate, nitro, vite, i18n
//
// Adding a key means running `vp lint` until it stops answering.
export default defineNuxtConfig({
  // @pinia/nuxt: Pinia was registered by hand in the old src/main.ts; the
  // module keeps that capability wired up now that the entry file is gone.
  // @nuxt/fonts: self-hosts Inter, see docs/adr/0007-self-hosted-inter.md.
  modules: ['@pinia/nuxt', '@nuxt/fonts', '@nuxtjs/i18n', '@nuxtjs/color-mode'],

  // SPA — see docs/adr/0001-spa-only-rendering.md.
  // The dashboard lives behind a login, so it has no SEO value, and
  // server-rendering chart-heavy pages would very likely blow the 10ms CPU
  // budget of the Workers free plan. Individual routes can opt back into SSR
  // through route rules later.
  ssr: false,

  // One entry per feature, plus `shared/`, because the app is organised by
  // feature rather than by kind of file (issue #61). The prefixes are the
  // names the templates already used: `features/timeline` draws a battle, so
  // its components are `Battle*`.
  //
  // `extensions: ['vue']` — see docs/adr/0005-shadcn-vue-without-nuxt-module.md:
  // shadcn ships an index.ts barrel beside each component, and Nuxt's default
  // scan would register both files under the same name (NUXT_B3011).
  components: [
    { path: '~/features/stats/components', prefix: 'Stats', extensions: ['vue'] },
    { path: '~/features/timeline/components', prefix: 'Battle', extensions: ['vue'] },
    { path: '~/features/identity/components', prefix: 'Identity', extensions: ['vue'] },
    { path: '~/features/ingest/components', prefix: 'Ingest', extensions: ['vue'] },
    { path: '~/features/spectated/components', prefix: 'Spectated', extensions: ['vue'] },
    { path: '~/features/marketing/components', prefix: 'Marketing', extensions: ['vue'] },
    { path: '~/shared/components', extensions: ['vue'] },
  ],

  // The default scan is `app/composables` and `app/utils`, and neither exists
  // any more: a composable belongs to the feature it serves. Auto-import stays
  // whole-app, so a page still calls `useStats()` with no import — what a
  // feature may reach for is a rule of its own, in `vite.config.ts` and
  // `test/architecture.spec.ts`.
  imports: {
    dirs: ['shared/composables', 'shared/utils', 'features/*/composables', 'features/*/utils'],
  },

  css: ['~/assets/tailwind.css'],

  // shadcn-vue toggles dark mode on a `.dark` class, so drop color-mode's
  // default `-mode` suffix.
  colorMode: {
    classSuffix: '',
    // Indigo Disk is the app's own look, not a concession to a dark-preferring
    // OS, so it is the preference rather than `system`. The light palette is
    // one toggle away and gets the same care; see app/assets/tailwind.css.
    preference: 'dark',
    fallback: 'dark',
  },

  // Both are public by design: the browser is the only thing that talks to
  // Supabase (see the design document §3), and the anon key is safe there
  // because RLS is what actually guards the data. Set them through
  // NUXT_PUBLIC_SUPABASE_URL / NUXT_PUBLIC_SUPABASE_ANON_KEY; see .env.example.
  runtimeConfig: {
    public: {
      supabaseUrl: '',
      supabaseAnonKey: '',
    },
  },

  // Pinned to IPv4 loopback. Left to itself the dev server binds [::1] only,
  // and then http://127.0.0.1:3000 refuses connections while
  // http://localhost:3000 works -- which breaks the OAuth round trip, because
  // redirectTo is built from whichever of the two the browser happens to be
  // on. Bound here, both names reach it: browsers fall back to IPv4 for
  // localhost, and 127.0.0.1 is literal.
  devServer: {
    host: '127.0.0.1',
  },

  compatibilityDate: '2026-08-18',

  // See docs/adr/0002-cloudflare-module-preset.md
  nitro: {
    preset: 'cloudflare_module',
  },

  // Tailwind v4 goes through its Vite plugin rather than @nuxtjs/tailwindcss.
  // See docs/adr/0004-tailwind-v4-through-vite-plugin.md.
  vite: {
    plugins: [tailwindcss()],
  },

  i18n: {
    defaultLocale: 'en',
    // English URLs stay bare (/about); other locales are prefixed
    // (/zh-TW/about). See docs/adr/0006-i18n-routing-strategy.md.
    strategy: 'prefix_except_default',
    locales: [
      { code: 'en', language: 'en', name: 'English', file: 'en.json' },
      { code: 'zh-TW', language: 'zh-TW', name: '繁體中文', file: 'zh-TW.json' },
    ],
  },
})
