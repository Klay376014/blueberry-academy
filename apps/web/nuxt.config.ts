// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-08-18',

  // SPA — see docs/adr/0001-spa-only-rendering.md.
  // The dashboard lives behind a login, so it has no SEO value, and
  // server-rendering chart-heavy pages would very likely blow the 10ms CPU
  // budget of the Workers free plan. Individual routes can opt back into SSR
  // through route rules later.
  ssr: false,

  css: ['~/assets/tailwind.css'],

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

  // @pinia/nuxt: Pinia was registered by hand in the old src/main.ts; the
  // module keeps that capability wired up now that the entry file is gone.
  // @nuxt/fonts: self-hosts Inter, see docs/adr/0007-self-hosted-inter.md.
  modules: ['@pinia/nuxt', '@nuxt/fonts', '@nuxtjs/i18n', '@nuxtjs/color-mode'],

  // See docs/adr/0005-shadcn-vue-without-nuxt-module.md — shadcn ships an
  // index.ts barrel beside each component, and Nuxt's default scan would
  // register both files under the same name (NUXT_B3011).
  components: [{ path: '~/components', extensions: ['vue'] }],

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

  // shadcn-vue toggles dark mode on a `.dark` class, so drop color-mode's
  // default `-mode` suffix.
  colorMode: {
    classSuffix: '',
  },

  // See docs/adr/0002-cloudflare-module-preset.md
  nitro: {
    preset: 'cloudflare_module',
  },
})
