<script setup lang="ts">
/**
 * The shell behind the login: the dashboard and everything that reads or
 * writes the reader's own battles.
 *
 * It is a layout rather than a page's own markup because the composition layer
 * is where a feature may be reached for (ADR-0013) — the account menu is
 * `features/identity`, and the pages under this shell belong to three other
 * features.
 *
 * The header is two things rather than one row of seven (issue #128):
 * navigation on the left, and the reader's own account on the right, behind a
 * menu. Settings and signing out are in that menu because they are about the
 * account rather than about where you are.
 */
const { t } = useI18n()
const localePath = useLocalePath()
</script>

<template>
  <SiteShell>
    <template #header>
      <SiteHeader>
        <template #nav>
          <SiteNavLink :to="localePath('/')">{{ t('nav.home') }}</SiteNavLink>
          <SiteNavLink :to="localePath('/about')">{{ t('nav.about') }}</SiteNavLink>
          <SiteNavLink :to="localePath('/import')">{{ t('nav.import') }}</SiteNavLink>
        </template>

        <template #actions>
          <IdentityUserMenu />
        </template>
      </SiteHeader>
    </template>

    <slot />
  </SiteShell>
</template>
