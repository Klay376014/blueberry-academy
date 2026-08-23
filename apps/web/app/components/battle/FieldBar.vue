<script setup lang="ts">
import { toID } from 'replay-parser'
import type { SideId } from 'replay-parser'
import type { FieldSnapshot } from '../../utils/battleField'
import { speciesName } from '../../utils/speciesName'

/**
 * How the field stood at the end of one turn: who was out, on how much HP, and
 * what each of them was carrying.
 *
 * One of these per turn is the answer to "was Garchomp still burning here?"
 * without reading back up the log for the turn it caught it.
 */
const props = defineProps<{ snapshot: FieldSnapshot; mySide: SideId | null }>()

/** Mine first when either side is mine, and p1 first when neither is. */
const sides = computed<SideId[]>(() => (props.mySide === 'p2' ? ['p2', 'p1'] : ['p1', 'p2']))

function slotsOf(side: SideId) {
  return props.snapshot.slots.filter((slot) => slot.side === side)
}

const { t } = useI18n()

function label(side: SideId) {
  if (props.mySide === null) return side.toUpperCase()

  return side === props.mySide ? t('battle.drawer.you') : t('battle.drawer.opponent')
}
</script>

<template>
  <div
    class="bg-muted/40 border-border flex flex-col gap-1 rounded-md border px-2 py-1"
    data-testid="field-bar"
  >
    <div v-for="side of sides" :key="side" class="flex flex-wrap items-center gap-2">
      <span
        class="w-8 font-mono text-[9px] tracking-widest"
        :class="side === mySide ? 'text-primary' : 'text-foreground'"
      >
        {{ label(side) }}
      </span>

      <span
        v-for="pokemon of slotsOf(side)"
        :key="pokemon.position"
        class="flex items-center gap-1"
        :class="pokemon.fainted ? 'opacity-45' : ''"
      >
        <SpeciesIcon
          :id="toID(pokemon.species)"
          :label="speciesName(toID(pokemon.species))"
          :size="26"
        />
        <span
          class="font-mono text-[11px] tabular-nums"
          :class="
            !pokemon.fainted && pokemon.hp !== null && pokemon.hp <= 33
              ? 'text-destructive'
              : 'text-muted-foreground'
          "
        >
          {{
            pokemon.fainted
              ? t('battle.drawer.knockedOut')
              : pokemon.hp === null
                ? '—'
                : `${pokemon.hp}%`
          }}
        </span>
        <BattleStateChips :pokemon />
      </span>

      <span
        v-for="screen of snapshot.screens[side]"
        :key="screen"
        class="border-primary/50 text-primary rounded border px-1 font-mono text-[9px]"
      >
        {{ screen }}
      </span>
    </div>
  </div>
</template>
