<script setup lang="ts">
import type { NuxtError } from '#app'

/**
 * A wrong address, kept inside the site (issue #125).
 *
 * Without this file Nuxt draws its own error page, which carries none of the
 * theme, none of the reader's language and no way back — a mistyped URL then
 * reads as having fallen out of the site rather than as having mistyped it.
 *
 * The shell follows whoever is reading: somebody signed in keeps the nav they
 * had, rather than being shown a stranger's header on top of the mistake.
 */
const props = defineProps<{ error: NuxtError }>()

const { t } = useI18n()
const localePath = useLocalePath()
const user = useCurrentUser()

const notFound = computed(() => props.error.statusCode === 404)
const home = computed(() => localePath('/'))

/**
 * The error is app-level state, so leaving this page is two things: the
 * navigation, and clearing the error that would otherwise keep this page on
 * screen over the next one.
 *
 * The link does the first and this does the second — rather than
 * `clearError({ redirect })` on a prevented click, which would be a second
 * navigation: a handler put on `<NuxtLink>` is merged after the one it binds
 * itself, so `.prevent` lands too late to stop the push it already made.
 */
function leave() {
  void clearError()
}
</script>

<template>
  <NuxtLayout :name="user ? 'app' : 'public'">
    <main class="py-8">
      <h1 class="text-3xl font-semibold tracking-tight">
        {{ notFound ? t('error.notFound.title') : t('error.unexpected.title') }}
      </h1>
      <p class="mt-2 text-muted-foreground">
        {{ notFound ? t('error.notFound.body') : t('error.unexpected.body') }}
      </p>

      <NuxtLink
        :to="home"
        class="mt-6 inline-block text-primary underline"
        data-testid="error-home"
        @click="leave"
      >
        {{ t('error.home') }}
      </NuxtLink>
    </main>
  </NuxtLayout>
</template>
