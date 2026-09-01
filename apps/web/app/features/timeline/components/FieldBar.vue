<script setup lang="ts">
import { toID } from 'replay-parser'
import type { SideId } from 'replay-parser'
import type { FieldSnapshot, PokemonState } from '../utils/battleField'
import { speciesName } from '~/shared/utils/speciesName'

/**
 * How the field stood at one moment: who was out, on how much HP, and what each
 * of them was carrying — and, on a second line, the ones that are no longer out
 * but have been.
 *
 * One of these per turn is the answer to "was Garchomp still burning here?"
 * without reading back up the log for the turn it caught it, and to "how many
 * has he got left?" without counting the faints (#90).
 *
 * Which moment it is belongs to whoever draws it, and is said in `caption`
 * rather than left to the reader: the same bar is a turn's opening field and,
 * at the foot of the timeline, the field the game finished on.
 */
const props = defineProps<{ snapshot: FieldSnapshot; mySide: SideId | null; caption: string }>()

/** Mine first when either side is mine, and p1 first when neither is. */
const sides = computed<SideId[]>(() => (props.mySide === 'p2' ? ['p2', 'p1'] : ['p1', 'p2']))

const { t } = useI18n()

function label(side: SideId) {
  if (props.mySide === null) return side.toUpperCase()

  return side === props.mySide ? t('battle.drawer.you') : t('battle.drawer.opponent')
}

/**
 * The lines one side takes. The second one is only there when somebody has
 * left the field, so a lead does not carry an empty row under it.
 *
 * Off the field is a smaller icon and its own label rather than a fainter one:
 * dimming alone would leave the difference to whoever can see it, and the
 * numbers on that line are the point of it.
 */
function linesOf(side: SideId) {
  const off = props.snapshot.offField.filter((pokemon) => pokemon.side === side)

  return [
    {
      label: label(side),
      tone: side === props.mySide ? 'text-primary' : 'text-foreground',
      // Keyed by the square, which is the one thing about a Pokémon on the
      // field that a Mega or an Ally Switch does not change.
      pokemon: props.snapshot.slots
        .filter((slot) => slot.side === side)
        .map((slot) => ({ key: slot.position, state: slot as PokemonState })),
      size: 40,
      screens: props.snapshot.screens[side],
    },
    ...(off.length
      ? [
          {
            label: t('battle.drawer.offField'),
            tone: 'text-muted-foreground',
            // Nothing off the field is standing anywhere, and the order is the
            // order they first appeared in, so their place in it is the key.
            pokemon: off.map((pokemon, index) => ({ key: `off-${index}`, state: pokemon })),
            size: 28,
            screens: [] as string[],
          },
        ]
      : []),
  ]
}

/** What is left of a Pokémon, or that there is nothing left of it. */
function hpLabel(pokemon: PokemonState) {
  if (pokemon.fainted) return t('battle.drawer.knockedOut')

  return pokemon.hp === null ? '—' : `${pokemon.hp}%`
}
</script>

<template>
  <div
    class="bg-muted/40 border-border flex flex-col gap-1 rounded-md border px-2 py-1"
    data-testid="field-bar"
  >
    <span class="text-muted-foreground font-mono text-[9px] tracking-widest uppercase">
      {{ caption }}
    </span>

    <template v-for="side of sides" :key="side">
      <div
        v-for="line of linesOf(side)"
        :key="`${side}-${line.label}`"
        class="flex flex-wrap items-center gap-2"
      >
        <span class="w-8 font-mono text-[9px] tracking-widest" :class="line.tone">
          {{ line.label }}
        </span>

        <span
          v-for="{ key, state } of line.pokemon"
          :key="key"
          class="flex items-center gap-1"
          :class="state.fainted ? 'opacity-45' : ''"
        >
          <SpeciesIcon
            :id="toID(state.species)"
            :label="speciesName(toID(state.species))"
            :size="line.size"
          />
          <span
            class="font-mono text-[11px] tabular-nums"
            :class="
              !state.fainted && state.hp !== null && state.hp <= 33
                ? 'text-destructive'
                : 'text-muted-foreground'
            "
          >
            {{ hpLabel(state) }}
          </span>
          <BattleStateChips :pokemon="state" />
        </span>

        <span
          v-for="screen of line.screens"
          :key="screen"
          class="border-primary/50 text-primary rounded border px-1 font-mono text-[9px]"
        >
          {{ screen }}
        </span>
      </div>
    </template>
  </div>
</template>
