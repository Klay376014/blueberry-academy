<script setup lang="ts">
 /**
 * The frame every page is drawn in: the container, the header the layout
 * fills, and the footer both shells share.
 *
 * What goes in the header differs by shell — `layouts/app.vue` has an account
 * to reach, `layouts/public.vue` has a way in to offer — so the header comes
 * in through a slot. The footer does not: the legal reading and the source are
 * the same for both readers, and putting it here is what keeps the two shells
 * from drifting apart (issue #128).
 *
 * The container used to be a `#__nuxt` rule in tailwind.css, which no layout
 * could restate and the error page could not reach; it lives here now
 * (issue #125). `px-4` below `sm` rather than `px-8`: at 375px the wider
 * padding leaves the header row nothing to wrap into.
 */
</script>

<template>
  <div class="mx-auto flex min-h-dvh max-w-[1280px] flex-col px-4 sm:px-8" data-testid="site-shell">
    <slot name="header" />

    <div class="flex-1">
      <slot />
    </div>

    <SiteFooter />
  </div>
</template>
