<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue'

const { t, locale, locales, setLocale } = useI18n()
const localePath = useLocalePath()
const colorMode = useColorMode()
const { user, signOut } = useAuth()

// The nav's own <a> hrefs are asserted in test/nuxt/routing.spec.ts, so the
// locale and theme switchers deliberately sit outside <nav>.
const otherLocale = computed(() =>
  locales.value.find((candidate) => candidate.code !== locale.value),
)

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <header class="flex items-center justify-between border-b border-border">
    <nav class="flex gap-4 py-4">
      <NuxtLink
        :to="localePath('/')"
        class="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&.router-link-exact-active]:text-foreground"
      >
        {{ t('nav.home') }}
      </NuxtLink>
      <NuxtLink
        :to="localePath('/about')"
        class="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&.router-link-exact-active]:text-foreground"
      >
        {{ t('nav.about') }}
      </NuxtLink>
    </nav>

    <div class="flex items-center gap-2">
      <UiButton v-if="user" variant="outline" size="sm" data-testid="sign-out" @click="signOut()">
        {{ t('nav.signOut') }}
      </UiButton>
      <UiButton
        v-if="otherLocale"
        variant="outline"
        size="sm"
        :aria-label="t('a11y.switchLanguage')"
        data-testid="locale-switcher"
        @click="setLocale(otherLocale.code)"
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

  <NuxtPage />
</template>
