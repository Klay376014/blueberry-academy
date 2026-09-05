<script setup lang="ts">
/**
 * One heading and the prose under it — the shape both public content pages are
 * made of (issue #127).
 *
 * It exists for the label as much as for the spacing: a page of unlabelled
 * `<section>` landmarks is a page of indistinguishable stops in a screen
 * reader's list, and the heading each one already has is the label.
 */
defineProps<{ title: string }>()

const headingId = useId()
</script>

<template>
  <section class="flex max-w-2xl flex-col gap-3" :aria-labelledby="headingId">
    <h2 :id="headingId" class="text-2xl font-semibold tracking-tight">{{ title }}</h2>
    <slot />
  </section>
</template>
