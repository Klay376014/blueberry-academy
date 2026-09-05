<script setup lang="ts">
/**
 * The shell behind the login: the dashboard and everything that reads or
 * writes the reader's own battles.
 *
 * It is a layout rather than a page's own markup because the composition layer
 * is where a feature may be reached for (ADR-0013) — signing out is
 * `features/identity`, and the pages under this shell belong to three other
 * features.
 */
const { t } = useI18n()
const localePath = useLocalePath()
const { signOut } = useAuth()
</script>

<template>
  <SiteShell>
    <template #nav>
      <SiteNavLink :to="localePath('/')">{{ t('nav.home') }}</SiteNavLink>
      <SiteNavLink :to="localePath('/about')">{{ t('nav.about') }}</SiteNavLink>
      <SiteNavLink :to="localePath('/import')">{{ t('nav.import') }}</SiteNavLink>
      <SiteNavLink :to="localePath('/settings')">{{ t('nav.settings') }}</SiteNavLink>
    </template>

    <template #actions>
      <UiButton variant="outline" size="sm" data-testid="sign-out" @click="() => signOut()">
        {{ t('nav.signOut') }}
      </UiButton>
    </template>

    <slot />
  </SiteShell>
</template>
