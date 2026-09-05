// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

// The key order is not editorial: vize's nuxt/nuxt-config-keys-order enforces
// it. The rule reports one key at a time and does not publish the order it
// wants, so it was found by asking repeatedly:
//
//   modules, ssr, components, css, colorMode, runtimeConfig, routeRules,
//   devServer, compatibilityDate, nitro, vite, i18n
//
// Adding a key means running `vp lint` until it stops answering.
export default defineNuxtConfig({
  // @pinia/nuxt: Pinia was registered by hand in the old src/main.ts; the
  // module keeps that capability wired up now that the entry file is gone.
  // @nuxt/fonts: self-hosts Inter, see docs/adr/0007-self-hosted-inter.md.
  modules: ['@pinia/nuxt', '@nuxt/fonts', '@nuxtjs/i18n', '@nuxtjs/color-mode'],

  // Still SPA everywhere that matters — see docs/adr/0001-spa-only-rendering.md
  // and its follow-up note. The dashboard lives behind a login, so it has no
  // SEO value, and server-rendering chart-heavy pages would very likely blow
  // the 10ms CPU budget of the Workers free plan.
  //
  // `true` here with `'/**': { ssr: false }` below rather than `ssr: false`
  // outright, which is the same delivery by a different switch: with the flag
  // off, Nuxt leaves the app's renderer out of the build entirely, and a
  // `prerender` rule then writes the empty SPA shell to the page's address
  // instead of the page (measured on this repo, issue #130). Nothing is
  // rendered per request either way — the two prose pages are rendered once,
  // at build time.
  ssr: true,

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

  // The two pages of public prose are built into HTML at build time; every
  // other address is still the empty SPA shell of ADR-0001, whose follow-up
  // note says why `/` is not on this list (issue #130).
  //
  // `prerender` rather than `ssr` alone: the 10ms CPU budget of the Workers
  // free plan is what ADR-0001 turned SSR down over, and a page rendered on a
  // build machine spends none of it per request. Both keys, because `ssr` is
  // false for the app as a whole and a route has to opt back in to be
  // rendered at all.
  //
  // One entry per address rather than per page: `prefix_except_default` gives
  // each locale its own URL, and a prerender is of an address.
  routeRules: {
    // Everything, including every address that does not exist: the SPA shell,
    // rendered by nobody. The four exceptions below are more specific, and a
    // more specific rule wins.
    '/**': { ssr: false },

    '/about': { ssr: true, prerender: true },
    '/zh-TW/about': { ssr: true, prerender: true },
    '/privacy': { ssr: true, prerender: true },
    '/zh-TW/privacy': { ssr: true, prerender: true },
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
    // The origin those prerendered pages claim to live at, in the canonical
    // link and in og:url — both of which a crawler reads from another host, so
    // a relative address is no answer (issue #130). The domain itself belongs
    // to wrangler.jsonc, which is what actually serves it; `test/prerender.spec.ts`
    // holds the two together.
    baseUrl: 'https://blueberry-academy.ivy-cudgel.com',
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
