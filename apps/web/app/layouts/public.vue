<script setup lang="ts">
/**
 * The shell a stranger sees: the landing page, about, privacy and terms, and
 * the login. No account menu, and no link to the two pages that need an
 * account (issue #125).
 *
 * The header says two things and no more — what this is called, and where to
 * sign in (issue #128). Everything else a stranger might want to read before
 * handing anything over is in the footer, which is where they will look for
 * it. `/` is the product's name here rather than a nav item: it answers each
 * reader in its own way — landing content for a stranger, the dashboard for
 * somebody signed in (issue #126).
 */
const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <SiteShell>
    <template #header>
      <SiteHeader>
        <template #actions>
          <UiButton as-child size="sm" class="min-h-11 min-w-11">
            <NuxtLink :to="localePath('/login')" data-testid="sign-in">
              {{ t('nav.signIn') }}
            </NuxtLink>
          </UiButton>
        </template>
      </SiteHeader>
    </template>

    <slot />
  </SiteShell>
</template>
