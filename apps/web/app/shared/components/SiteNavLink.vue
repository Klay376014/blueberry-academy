<script setup lang="ts">
/**
 * One link in the header bar or the footer. Two shells draw both, so the look
 * is here.
 *
 * `min-h-11` is 44 CSS pixels: the box a finger has to land on, rather than
 * the size of the text in it (issue #128).
 */
defineProps<{ to: string }>()
</script>

<template>
  <NuxtLink
    :to
    class="inline-flex min-h-11 items-center rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&.router-link-exact-active]:text-foreground"
  >
    <slot />
  </NuxtLink>
</template>
