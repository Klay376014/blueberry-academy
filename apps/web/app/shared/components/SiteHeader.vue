<script setup lang="ts">
/**
 * The bar at the top of both shells: the product's name, whatever navigation
 * the shell has, and the reader's own controls on the right.
 *
 * One component rather than a header in each layout, because the part that
 * breaks at 375px is the row itself — it wraps here, once, instead of in two
 * places that can disagree (issue #128).
 *
 * The nav is a landmark with a name: a page with two `<nav>` elements in it —
 * this one and the footer's — is two identical stops in a screen reader's
 * landmark list unless each says which it is.
 */
const { t } = useI18n()
</script>

<template>
  <header
    class="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-border py-2"
    data-testid="site-header"
  >
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
      <SiteBrand />

      <nav
        v-if="$slots.nav"
        class="flex flex-wrap items-center gap-x-1 gap-y-1"
        :aria-label="t('a11y.mainNav')"
        data-testid="site-nav"
      >
        <slot name="nav" />
      </nav>
    </div>

    <div class="flex items-center gap-1">
      <SiteThemeToggle />
      <slot name="actions" />
    </div>
  </header>
</template>
