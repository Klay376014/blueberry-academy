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
// The list counts what the format is counted in: a Bo3 account's "20" is
// twenty series, and the number beside the heading has to say the same.
const { aggregate } = useStats()
// Opening a battle is a query parameter, and the timeline is what reads it
// (issue #61).
const battleRoute = useBattleRoute()

const { t } = useI18n()

// The ids on screen move whenever a filter does, and their extra columns are
// fetched per id.
watch(recent, () => void hydrate(), { immediate: true })

const groups = computed(() => groupIntoSeries(recent.value))

/** One bordered run each: a series card, or the lone games between two of them. */
const blocks = computed(() => intoBlocks(groups.value))

const counted = computed(() =>
  aggregate.value === 'series' ? groups.value.length : recent.value.length,
)

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
      <p class="text-muted-foreground font-mono text-xs tabular-nums" data-testid="recent-count">
        {{ counted }}
      </p>
    </div>

    <div class="flex flex-col gap-2">
      <template v-for="block of blocks" :key="block.key">
        <StatsSeriesCard v-if="block.kind === 'series'" :group="block.group" />

        <div v-else class="border-border divide-border divide-y overflow-hidden rounded-lg border">
          <button
            v-for="battle of block.games"
            :key="battle.replayId"
            type="button"
            class="hover:bg-muted/50 focus-visible:ring-ring flex min-h-11 w-full items-center gap-2 border-l-2 px-3 py-2 text-left focus-visible:ring-2 focus-visible:outline-none"
            :class="
              battle.replayId === battleRoute.openId.value
                ? 'border-l-primary bg-primary/5'
                : 'border-l-transparent'
            "
            data-testid="recent-battle"
            @click="() => battleRoute.open(battle.replayId)"
          >
            <!-- The one column the row keeps: it is a symbol of a known width,
                 and it is what the list is scanned down. -->
            <span
              class="w-5 shrink-0 text-center font-mono text-lg"
              :class="battle.result ? RESULT_TONE[battle.result] : 'text-muted-foreground'"
              data-testid="battle-result-mark"
            >
              {{ battle.result ? t(`battle.resultShort.${battle.result}`) : '·' }}
            </span>

            <span class="flex min-w-0 flex-1 flex-col gap-1">
              <!-- What fits on this line is a username and a locale's date,
                   not a viewport — so it wraps rather than carrying a prefix. -->
              <span
                class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                data-testid="battle-meta"
              >
                <!-- `truncate` shortens nothing without this: a flex item's
                     floor is its content, so the name would push the row wider
                     instead of ending in an ellipsis. -->
                <span class="min-w-0 truncate font-medium">
                  {{ battle.opponentUsername ?? t('battle.drawer.unknownOpponent') }}
                </span>
                <span class="text-muted-foreground text-xs">
                  {{ day(battle.playedAt) }} · {{ bestOfLabel(battle.formatId) }}
                  <template v-if="battle.turnCount !== null">
                    · {{ t('battle.recent.turns', { count: battle.turnCount }) }}
                  </template>
                </span>
                <!-- On this line rather than trailing the row: as a column of
                     its own it took its width off the party beside it, and it
                     is the least of what the row says (#215). -->
                <span
                  v-if="battle.ratingDelta !== null"
                  class="text-muted-foreground font-mono text-xs tabular-nums"
                  data-testid="rating-change"
                >
                  {{ battle.ratingDelta > 0 ? '+' : '' }}{{ battle.ratingDelta }}
                </span>
              </span>

              <span class="flex flex-wrap items-center gap-1" data-testid="battle-teams">
                <!-- Each side is one group so that a wrap cannot move a party
                     across the separator that says whose it is. -->
                <span class="flex min-w-0 flex-wrap items-center gap-1" data-testid="battle-side">
                  <SpeciesParty :signature="battle.myTeam" :bring="battle.myBring" :size="33" />
                </span>
                <span
                  class="text-muted-foreground shrink-0 px-1 font-mono text-[10px]"
                  data-testid="battle-versus"
                >
                  {{ t('battle.drawer.versus') }}
                </span>
                <span class="flex min-w-0 flex-wrap items-center gap-1" data-testid="battle-side">
                  <SpeciesParty
                    :signature="battle.opponentTeam"
                    :bring="battle.opponentBring"
                    :size="33"
                  />
                </span>
              </span>
            </span>
          </button>
        </div>
      </template>
    </div>
  </section>
</template>
