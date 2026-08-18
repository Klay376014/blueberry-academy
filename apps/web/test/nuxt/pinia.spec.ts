import { describe, expect, it } from 'vitest'
import { defineStore } from 'pinia'

// The old src/main.ts called `app.use(createPinia())`. Nothing uses a store
// yet, so this guards the wiring itself: without @pinia/nuxt registered,
// `useStore()` throws for want of an active Pinia instance.
describe('pinia', () => {
  it('is registered on the Nuxt app', () => {
    const useCounter = defineStore('counter', {
      state: () => ({ count: 0 }),
    })

    const counter = useCounter()
    counter.count++

    expect(counter.count).toBe(1)
  })
})
