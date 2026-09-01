<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'
import type { SideId, TimelineTurn } from 'replay-parser'
import type { FieldSnapshot } from '../utils/battleField'
import { rowsOf, sidelinedCount } from '../utils/timelineRows'

/**
 * One turn: the field it opened on, and the main line of what happened from
 * there. In that order, because that is the order it was played in — a turn
 * drawn over its own outcome tells the reader how it went before it says what
 * anybody did (#92).
 *
 * The supporting events — an ability announcing itself, a Protect holding, a
 * stat stage — are behind a switch. A turn of this game runs to nineteen
 * events, and a timeline nobody can scan is a replay player with extra steps.
 */
const props = defineProps<{
  turn: TimelineTurn
  snapshot: FieldSnapshot | null
  mySide: SideId | null
}>()

const detailed = ref(false)

function toggleDetails() {
  detailed.value = !detailed.value
}

const rows = computed(() => rowsOf(props.turn, { detailed: detailed.value }))
const held = computed(() => sidelinedCount(props.turn))

const { t } = useI18n()

/** The clock reading of the turn, in the reader's own timezone. */
const startedAt = computed(() =>
  props.turn.startedAt
    ? new Date(props.turn.startedAt).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null,
)
</script>

<template>
  <section class="flex flex-col gap-1" data-testid="timeline-turn">
    <div class="flex items-center gap-2 pt-2">
      <span class="font-mono text-[11px] tracking-widest uppercase">
        {{
          turn.number === 0
            ? t('battle.drawer.lead')
            : t('battle.drawer.turn', { number: turn.number })
        }}
      </span>
      <span class="bg-border h-px flex-1" />
      <span v-if="startedAt" class="text-muted-foreground font-mono text-[10px] tabular-nums">
        {{ startedAt }}
      </span>
    </div>

    <BattleFieldBar v-if="snapshot" :snapshot :my-side :caption="t('battle.drawer.turnOpening')" />

    <div class="flex flex-col">
      <BattleEventRow v-for="(row, index) of rows" :key="`${row.mark}-${index}`" :row :my-side />
    </div>

    <button
      v-if="held"
      type="button"
      class="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex items-center gap-1 self-start rounded px-2 py-0.5 text-[11px] focus-visible:ring-2 focus-visible:outline-none"
      :aria-expanded="detailed"
      data-testid="turn-details"
      @click="toggleDetails"
    >
      <ChevronDown
        class="size-3 transition-transform"
        :class="detailed ? 'rotate-180' : ''"
        aria-hidden="true"
      />
      {{
        detailed ? t('battle.drawer.fewerDetails') : t('battle.drawer.moreDetails', { count: held })
      }}
    </button>
  </section>
</template>
