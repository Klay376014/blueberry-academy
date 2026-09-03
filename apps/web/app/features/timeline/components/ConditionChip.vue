<script setup lang="ts">
/**
 * One thing standing on the field, drawn as a chip: something on the whole
 * field, the weather, an ability holding the field up, one side's screen, or a
 * lasting effect on one Pokémon.
 *
 * Four kinds share one row, so the kind is what the colour says — there is no
 * room beside a 9px chip for a label saying which it is, and "重力" next to
 * "下雪" next to "妖精氣場" is three different questions under one paint.
 *
 * The kind rather than the caller decides the colour: the same thing has to
 * read the same way wherever the bar puts it.
 */
const props = defineProps<{ kind: 'field' | 'weather' | 'ability' | 'screen' | 'volatile' }>()

const TONE: Record<typeof props.kind, string> = {
  field: 'border-chart-3/50 text-chart-3',
  // The one there is exactly one of, so it is the one that is filled.
  weather: 'border-chart-1/50 text-chart-1 bg-chart-1/10',
  // Dashed, not just orange: `chart-4` is also a paralysis and a stat drop one
  // row below on this same bar, and the palette has no sixth hue to spend. The
  // dash is what this kind is — an effect propped up by a Pokémon standing
  // there rather than by the field itself.
  ability: 'border-chart-4/60 border-dashed text-chart-4',
  screen: 'border-primary/50 text-primary',
  // Filled and uncoloured: these sit beside the condition and stat chips, and
  // there is no hue left that does not already mean a warning there. A
  // Substitute is not a warning — it is a fact about what is standing there.
  volatile: 'border-border bg-muted text-foreground',
}
</script>

<template>
  <span class="rounded border px-1 font-mono text-[9px]" :class="TONE[kind]" :data-condition="kind">
    <slot />
  </span>
</template>
