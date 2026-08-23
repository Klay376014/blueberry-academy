import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    // jsdom has no layout engine, and the chart library measures text. See
    // the file for what it fills in and why it is safe.
    setupFiles: ['./test/setup.ts'],
    environment: 'nuxt',
    environmentOptions: {
      nuxt: {
        domEnvironment: 'jsdom',
      },
    },
  },
})
