import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    // jsdom has no layout engine, and the chart library measures text. See
    // the file for what it fills in and why it is safe.
    setupFiles: ['./test/setup.ts'],

    // The trend charts group battles by the reader's own calendar day, which
    // is the day the axis labels name. Pinned so a fixture written as
    // `T17:00:00Z` lands on the day it reads as, wherever the suite is run.
    env: { TZ: 'UTC' },
    environment: 'nuxt',
    environmentOptions: {
      nuxt: {
        domEnvironment: 'jsdom',
      },
    },
  },
})
