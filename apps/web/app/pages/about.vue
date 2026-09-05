<script setup lang="ts">
/**
 * About sits on both sides of the login, and the two readers want different
 * shells: a stranger has no account to sign out of, and somebody signed in
 * should not watch their nav disappear for one page.
 *
 * So the shell is chosen here, as `app/error.vue` does it, rather than fixed
 * in the page's meta: `definePageMeta({ layout })` is read once, before the
 * page renders, and `setPageLayout` from setup arrives after `<NuxtLayout>`
 * has already mounted the other one — the stranger's header would paint and
 * then be swapped out under a signed-in reader. Drawing the layout from here
 * settles it in the same render, and it follows the session afterwards
 * (issue #125).
 */
definePageMeta({ layout: false })

const { t } = useI18n()
const user = useCurrentUser()
</script>

<template>
  <NuxtLayout :name="user ? 'app' : 'public'">
    <main class="py-8">
      <h1 class="text-3xl font-semibold tracking-tight">{{ t('about.title') }}</h1>
    </main>
  </NuxtLayout>
</template>
