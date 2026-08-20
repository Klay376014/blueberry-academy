<script setup lang="ts">
// Where Google sends the browser back to. Public, because it runs before a
// session exists — see app/middleware/auth.global.ts.
const { t } = useI18n()
const localePath = useLocalePath()
const { completeSignIn } = useAuth()

const failed = ref(false)

onMounted(async () => {
  try {
    await completeSignIn(window.location.href)
    await navigateTo(localePath('/'))
  } catch {
    // The code was missing, already spent, or refused. Saying so beats
    // leaving a spinner turning over nothing.
    failed.value = true
  }
})
</script>

<template>
  <main class="py-8">
    <h1 v-if="failed" class="text-3xl font-semibold tracking-tight">
      {{ t('login.failed') }}
    </h1>
    <p v-else class="text-muted-foreground" data-testid="callback-pending">
      {{ t('login.completing') }}
    </p>

    <NuxtLink
      v-if="failed"
      :to="localePath('/login')"
      class="mt-4 inline-block underline"
      data-testid="callback-retry"
    >
      {{ t('login.retry') }}
    </NuxtLink>
  </main>
</template>
