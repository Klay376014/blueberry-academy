<script setup lang="ts">
/**
 * The bar at the top of both shells: the product's name, whatever navigation
 * the shell has, and the reader's own controls on the right.
 *
 * One component rather than a header in each layout, because the part that
 * breaks at 375px is the row itself — it is answered here, once, instead of in
 * two places that can disagree (issue #128).
 *
 * What answers it is now a `sm:` prefix rather than the bare wrap it was
 * (issue #213, §4 of docs/specs/2026-09-18-responsive-baseline.md): below `sm`
 * the nav takes a row of its own under the brand, and from `sm` up it sits
 * back between the brand and the controls. `basis-full` is what puts it there
 * — the row it lands on is declared, not whatever the overflow happened to
 * fold, which is the difference the ticket asked for.
 *
 * The reordering is on the phone side rather than the other way round, and
 * only there: source order is the reading order, so from `sm` up — where a
 * keyboard is most of the traffic — what is tabbed is what is seen. Below
 * `sm` the page is a column top to bottom anyway, and `order-last` is what
 * lets the controls keep the first row while the nav takes the second.
 *
 * A menu was the other candidate and is what §4 expected. It was not taken
 * for a width reason: its trigger is another 44px control in the one row that
 * is already short at 320, and it would hide three links that fit a row of
 * their own with room to spare.
 *
 * The nav is a landmark with a name: a page with two `<nav>` elements in it —
 * this one and the footer's — is two identical stops in a screen reader's
 * landmark list unless each says which it is.
 */
const { t } = useI18n()
</script>

<template>
  <header
    class="flex flex-wrap items-center gap-2 border-b border-border py-2"
    data-testid="site-header"
  >
    <SiteBrand />

    <nav
      v-if="$slots.nav"
      class="order-last flex basis-full flex-wrap items-center gap-2 sm:order-none sm:basis-auto"
      :aria-label="t('a11y.mainNav')"
      data-testid="site-nav"
    >
      <slot name="nav" />
    </nav>

    <div class="ml-auto flex items-center gap-2" data-testid="site-header-controls">
      <SiteThemeToggle />
      <slot name="actions" />
    </div>
  </header>
</template>
