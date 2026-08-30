<script setup lang="ts">
import { speciesName } from '../utils/speciesName'
import { partyOf } from '../utils/party'

/**
 * A team or a bring, as the row of Pokémon it is.
 *
 * `signature` is the stored form — base species ids joined by `|`. The names
 * are read out as one label on the group rather than one per icon, and they
 * stay English: a species name is an identifier, not copy (design document §3).
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

const { t } = useI18n()

const members = computed(() =>
  props.bring === undefined
    ? partyOf(props.signature, props.signature)
    : partyOf(props.signature, props.bring),
)

const nameOf = (member: { id: string; appeared: boolean }) =>
  member.appeared
    ? speciesName(member.id)
    : t('battle.absentPokemon', { pokemon: speciesName(member.id) })

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
