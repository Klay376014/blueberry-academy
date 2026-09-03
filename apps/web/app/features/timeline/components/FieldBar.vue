<script setup lang="ts">
import { toID } from 'replay-parser'
import type { SideId } from 'replay-parser'
import type { FieldSnapshot, PokemonState } from '../utils/battleField'
import { speciesLabel } from '~/shared/utils/speciesName'
import { abilityDisplayName, fieldConditionDisplayName } from '~/shared/utils/battleTerms'

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

const { t, locale } = useI18n()

/**
 * The icon says the whole name here — there is no room beside it for one — so
 * it says it in the reader's language with the English name Showdown shows
 * kept alongside (docs/adr/0014-localised-species-names.md).
 */
const labelled = (species: string) => speciesLabel(toID(species), locale.value)

/**
 * A screen, a terrain or a room, under the reader's name for it. Every one of
 * these strings is a move's name — the log spells a side condition the way it
 * spells the move that put it there — and the ones that are not are the
 * weather's, which has a state name of its own
 * (docs/adr/0016-localised-battle-vocabulary.md).
 */
const condition = (name: string) => fieldConditionDisplayName(name, locale.value)

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

/** An ability standing over the whole field, under the reader's name for it. */
const ability = (name: string) => abilityDisplayName(name, locale.value)

/**
 * What is standing on the whole field, on a line of their own above the two
 * sides: Trick Room belongs to neither of them, and under one side's label it
 * would read as that side's (#104). The weather and an aura are the same
 * argument — an aura is held up by one Pokémon but applies to everyone, so it
 * is here rather than beside its holder (#119).
 *
 * Three kinds on one row, told apart by the chip's colour.
 */
const field = computed(() => ({
  effects: props.snapshot.fieldEffects,
  weather: props.snapshot.weather,
  abilities: props.snapshot.fieldAbilities,
}))

/** Whether the row has anything to say at all. */
const hasField = computed(
  () =>
    field.value.effects.length > 0 ||
    field.value.weather !== null ||
    field.value.abilities.length > 0,
)

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

    <div v-if="hasField" class="flex flex-wrap items-center gap-2">
      <span class="text-muted-foreground w-8 font-mono text-[9px] tracking-widest">
        {{ t('battle.drawer.field') }}
      </span>

      <BattleConditionChip v-for="effect of field.effects" :key="effect" kind="field">
        {{ condition(effect) }}
      </BattleConditionChip>

      <BattleConditionChip v-if="field.weather !== null" kind="weather">
        {{ condition(field.weather) }}
      </BattleConditionChip>

      <BattleConditionChip v-for="name of field.abilities" :key="name" kind="ability">
        {{ ability(name) }}
      </BattleConditionChip>
    </div>

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
            :label="labelled(state.species)"
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

        <BattleConditionChip v-for="screen of line.screens" :key="screen" kind="screen">
          {{ condition(screen) }}
        </BattleConditionChip>
      </div>
    </template>
  </div>
</template>
