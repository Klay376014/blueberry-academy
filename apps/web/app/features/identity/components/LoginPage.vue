<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const { signInWithGoogle } = useAuth()

const failed = ref(false)

async function signIn() {
  failed.value = false
  try {
    await signInWithGoogle()
  } catch {
    failed.value = true
  }
}
</script>

<template>
  <main class="py-8">
    <h1 class="text-3xl font-semibold tracking-tight">{{ t('login.title') }}</h1>
    <p class="mt-2 text-muted-foreground">{{ t('login.tagline') }}</p>

    <UiButton class="mt-6" data-testid="sign-in-google" @click="signIn">
      {{ t('login.google') }}
    </UiButton>

    <p v-if="failed" class="mt-4 text-sm text-destructive" data-testid="sign-in-error">
      {{ t('login.failed') }}
    </p>

    <!--
      What signing in hands over, reachable from the page where it is handed
      over rather than only from About (issue #127).
    -->
    <NuxtLink
      :to="localePath('/privacy')"
      class="mt-6 inline-block text-sm text-primary underline"
      data-testid="login-privacy"
    >
      {{ t('privacy.title') }}
    </NuxtLink>
  </main>
</template>
