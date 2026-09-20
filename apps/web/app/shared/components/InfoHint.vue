<script setup lang="ts">
/**
 * The long version of something the screen already shows short.
 *
 * Tapped open rather than hovered: a phone has no hover, and the things worth
 * explaining here are exactly the ones a phone reader also runs into.
 *
 * The circle stays 16px and the `::before` is the 44px touch target — the
 * drawn size and the pressable size are two different things
 * (docs/specs/2026-09-18-responsive-baseline.md §5).
 */
defineProps<{ label: string }>()

const open = ref(false)
const bodyId = useId()
</script>

<template>
  <div class="inline-flex flex-col items-start gap-1">
    <button
      type="button"
      class="relative inline-flex size-4 cursor-pointer items-center justify-center rounded-full border border-border text-[10px] leading-none text-muted-foreground transition-colors before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] hover:border-ring hover:text-foreground"
      :aria-label="label"
      :aria-expanded="open"
      :aria-controls="bodyId"
      data-testid="info-hint"
      @click="() => (open = !open)"
    >
      ?
    </button>
    <p v-if="open" :id="bodyId" class="max-w-prose text-sm text-muted-foreground">
      <slot />
    </p>
  </div>
</template>
