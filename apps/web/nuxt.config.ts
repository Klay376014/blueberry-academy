// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-08-18',

  // SPA. The dashboard lives behind a login, so it has no SEO value, and
  // server-rendering chart-heavy pages would very likely blow the 10ms CPU
  // budget of the Workers free plan. Individual routes can opt back into SSR
  // through route rules later.
  ssr: false,

  css: ['~/assets/main.css'],

  // Pinia was registered by hand in the old src/main.ts; the module keeps that
  // capability wired up now that the entry file is gone.
  modules: ['@pinia/nuxt'],

  nitro: {
    preset: 'cloudflare_module',
  },
})
