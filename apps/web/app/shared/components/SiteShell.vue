<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue'

/**
 * The frame every page is drawn in: the container, the header bar, and the two
 * switchers that are the same on both sides of the login.
 *
 * What goes in the header differs by shell — `layouts/app.vue` has an account
 * to sign out of and pages a stranger cannot reach — so the links come in
 * through the slots. The container used to be a `#__nuxt` rule in
 * tailwind.css, which no layout could restate and the error page could not
 * reach; it lives here now (issue #125).
 */
const { t, locale, locales, setLocale } = useI18n()
const colorMode = useColorMode()

// The nav's own <a> hrefs are asserted in test/nuxt/routing.spec.ts, so the
// locale and theme switchers deliberately sit outside <nav>.
const otherLocale = computed(() =>
  locales.value.find((candidate) => candidate.code !== locale.value),
)

// A method rather than an inline handler: inside an arrow function in the
// template, `v-if="otherLocale"` no longer narrows it, and vue-tsc rightly
// says it may be undefined.
function switchLocale() {
  if (otherLocale.value) setLocale(otherLocale.value.code)
}

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <div class="mx-auto max-w-[1280px] px-8" data-testid="site-shell">
    <header class="flex items-center justify-between border-b border-border">
      <nav class="flex gap-4 py-4">
        <slot name="nav" />
      </nav>

      <div class="flex items-center gap-2">
        <slot name="actions" />

        <UiButton
          v-if="otherLocale"
          variant="outline"
          size="sm"
          :aria-label="t('a11y.switchLanguage')"
          data-testid="locale-switcher"
          @click="switchLocale"
        >
          {{ otherLocale.name }}
        </UiButton>
        <UiButton
          variant="ghost"
          size="icon"
          :aria-label="t('a11y.toggleTheme')"
          data-testid="theme-toggle"
          @click="toggleTheme"
        >
          <Moon v-if="colorMode.value === 'dark'" />
          <Sun v-else />
        </UiButton>
      </div>
    </header>

    <slot />
  </div>
</template>
