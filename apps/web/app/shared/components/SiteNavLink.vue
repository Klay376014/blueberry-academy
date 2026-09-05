<script setup lang="ts">
/** One link in the header bar. Two shells draw the bar, so the look is here. */
defineProps<{ to: string }>()
</script>

<template>
  <NuxtLink
    :to
    class="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground [&.router-link-exact-active]:text-foreground"
  >
    <slot />
  </NuxtLink>
</template>
