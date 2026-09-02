<script setup lang="ts">
import { speciesDisplayName } from '../utils/speciesName'
import { partyOf } from '../utils/party'

/**
 * A team or a bring, as the row of Pokémon it is.
 *
 * `signature` is the stored form — base species ids joined by `|` — and it
 * stays that way: what this component localises is the label it says out loud,
 * not the signature, the ids, or anything team grouping is keyed on
 * (docs/adr/0014-localised-species-names.md).
 *
 * The names are read out as one label on the group rather than one per icon.
 * They follow the reader's locale because `BattleDrawer` draws this row
 * directly above the timeline: English here would have a zh-TW reader hear the
 * same six Pokémon under two sets of names in one screen.
 *
 * Pass `bring` as well and `signature` is read as the registered six, with the
 * ones that did not appear drawn faded in their own places — which two a player
 * left at home is the thing a six-into-four format is played on, and it can only
 * be seen against the six. Fading is never the only signal: the group's label
 * and every icon's tooltip say it in words.
 */
const props = withDefaults(
  defineProps<{ signature: string | null; size?: number; bring?: string | null }>(),
  { size: 36, bring: undefined },
)

const { t, locale } = useI18n()

const members = computed(() =>
  props.bring === undefined
    ? partyOf(props.signature, props.signature)
    : partyOf(props.signature, props.bring),
)

const nameOf = (member: { id: string; appeared: boolean }) => {
  const name = speciesDisplayName(member.id, locale.value)

  return member.appeared ? name : t('battle.absentPokemon', { pokemon: name })
}

const label = computed(() => members.value.map(nameOf).join(', '))
</script>

<template>
  <span class="flex items-center gap-px" role="img" :aria-label="label">
    <SpeciesIcon
      v-for="member of members"
      :key="member.id"
      :id="member.id"
      :size
      :title="nameOf(member)"
      :class="member.appeared ? undefined : 'opacity-40 grayscale'"
      :data-absent="member.appeared ? undefined : 'true'"
    />
  </span>
</template>
