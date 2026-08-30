<script setup lang="ts">
import { bestOfLabel } from '~/shared/utils/formatLabel'
import { groupIntoSeries, intoBlocks } from '../utils/seriesGroups'

/**
 * The games behind the numbers, newest first.
 *
 * Both brings are on the row rather than only the opponent's name: "what did I
 * bring against that team last time" is the question this list is scanned for,
 * and answering it should not need the drawer open.
 *
 * The games of one Bo3 are drawn under one header, because on the row they are
 * indistinguishable from three separate ladder games against the same player
 * (design document 2026-08-30, series grouping).
 */
const { recent, hydrate } = useRecentBattles()
// Opening a battle is a query parameter, and the timeline is what reads it
// (issue #61).
const battleRoute = useBattleRoute()

const { t } = useI18n()

// The ids on screen move whenever a filter does, and their extra columns are
// fetched per id.
watch(recent, () => void hydrate(), { immediate: true })

/** One bordered run each: a series card, or the lone games between two of them. */
const blocks = computed(() => intoBlocks(groupIntoSeries(recent.value)))

const day = (playedAt: string) => new Date(playedAt).toLocaleDateString()

const RESULT_TONE = {
  win: 'text-primary',
  loss: 'text-destructive',
  tie: 'text-muted-foreground',
}
</script>

<template>
  <section class="flex flex-col gap-3" :aria-label="t('battle.recent.title')">
    <div class="flex items-baseline justify-between gap-3">
      <h2 class="text-xl font-semibold tracking-tight">{{ t('battle.recent.title') }}</h2>
      <p class="text-muted-foreground font-mono text-xs tabular-nums">{{ recent.length }}</p>
    </div>

    <div class="flex flex-col gap-2">
      <template v-for="block of blocks" :key="block.key">
        <StatsSeriesCard v-if="block.kind === 'series'" :group="block.group" />

        <div v-else class="border-border divide-border divide-y overflow-hidden rounded-lg border">
          <button
            v-for="battle of block.games"
            :key="battle.replayId"
            type="button"
            class="hover:bg-muted/50 focus-visible:ring-ring flex w-full items-center gap-3 border-l-2 px-3 py-2 text-left focus-visible:ring-2 focus-visible:outline-none"
            :class="
              battle.replayId === battleRoute.openId.value
                ? 'border-l-primary bg-primary/5'
                : 'border-l-transparent'
            "
            data-testid="recent-battle"
            @click="() => battleRoute.open(battle.replayId)"
          >
            <span
              class="w-5 shrink-0 text-center font-mono text-lg"
              :class="battle.result ? RESULT_TONE[battle.result] : 'text-muted-foreground'"
            >
              {{ battle.result ? t(`battle.resultShort.${battle.result}`) : '·' }}
            </span>

            <span class="flex min-w-0 flex-1 flex-col gap-1">
              <span class="flex flex-wrap items-baseline gap-2">
                <span class="truncate font-medium">
                  {{ battle.opponentUsername ?? t('battle.drawer.unknownOpponent') }}
                </span>
                <span class="text-muted-foreground text-xs">
                  {{ day(battle.playedAt) }} · {{ bestOfLabel(battle.formatId) }}
                  <template v-if="battle.turnCount !== null">
                    · {{ t('battle.recent.turns', { count: battle.turnCount }) }}
                  </template>
                </span>
              </span>

              <span class="flex flex-wrap items-center gap-1">
                <SpeciesParty :signature="battle.myBring" :size="33" />
                <span class="text-muted-foreground px-1 font-mono text-[10px]">
                  {{ t('battle.drawer.versus') }}
                </span>
                <SpeciesParty :signature="battle.opponentBring" :size="33" />
              </span>
            </span>

            <span
              v-if="battle.ratingDelta !== null"
              class="text-muted-foreground shrink-0 font-mono text-xs tabular-nums"
            >
              {{ battle.ratingDelta > 0 ? '+' : '' }}{{ battle.ratingDelta }}
            </span>
          </button>
        </div>
      </template>
    </div>
  </section>
</template>
