<script setup lang="ts">
import type { RowNote } from '../utils/timelineRows'

/**
 * What an action did to one Pokémon, in a few words beside its icon: a hit that
 * was resisted, a Protect that held, a move that missed.
 *
 * Words and not colour alone, and drawn immediately after the icon they belong
 * to — the icon carries the species as its label, so a screen reader reading
 * straight through hears whose result this is (issue #96).
 */
defineProps<{ notes: RowNote[] }>()

const { t } = useI18n()
</script>

<template>
  <span
    v-for="(note, index) of notes"
    :key="`${note.key}-${index}`"
    class="text-muted-foreground border-border/70 rounded border px-1 text-[10px] whitespace-nowrap"
    :class="note.quiet ? 'sr-only' : ''"
    data-testid="row-note"
  >
    {{ t(`battle.event.${note.key}`, note.params ?? {}) }}
  </span>
</template>
