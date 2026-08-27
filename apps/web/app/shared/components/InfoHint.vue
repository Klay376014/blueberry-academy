<script setup lang="ts">
/**
 * The long version of something the screen already shows short.
 *
 * Tapped open rather than hovered: a phone has no hover, and the things worth
 * explaining here are exactly the ones a phone reader also runs into.
 */
defineProps<{ label: string }>()

const open = ref(false)
const bodyId = useId()
</script>

<template>
  <div class="inline-flex flex-col items-start gap-1">
    <button
      type="button"
      class="inline-flex size-4 cursor-pointer items-center justify-center rounded-full border border-border text-[10px] leading-none text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
      :aria-label="label"
      :aria-expanded="open"
      :aria-controls="bodyId"
      data-testid="info-hint"
      @click="() => (open = !open)"
    >
      ?
    </button>
    <p v-if="open" :id="bodyId" class="max-w-prose text-xs text-muted-foreground">
      <slot />
    </p>
  </div>
</template>
