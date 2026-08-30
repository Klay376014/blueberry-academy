<script setup lang="ts">
import { bestOfLabel } from '~/shared/utils/formatLabel'
import type { RecentGroup } from '../utils/seriesGroups'

/**
 * The games of one Bo3 series, under a header that says what they share.
 *
 * The header carries the opponent, the score and the date so the game rows do
 * not repeat them three times over; what stays on a row is what differs between
 * the games — which game it was, how it went, what both sides brought.
 *
 * The header is not clickable. Three rows beside it each open a game, and
 * "which one would the header open" has no good answer; moving between the
 * games of a series is the drawer's job (design document §3).
 */
const props = defineProps<{ group: RecentGroup & { series: NonNullable<RecentGroup['series']> } }>()

const battleRoute = useBattleRoute()
const { t } = useI18n()

const day = (playedAt: string) => new Date(playedAt).toLocaleDateString()

const opponent = computed(
  () => props.group.series.opponentUsername ?? t('battle.drawer.unknownOpponent'),
)

const RESULT_TONE = {
  win: 'text-primary',
  loss: 'text-destructive',
  tie: 'text-muted-foreground',
}
</script>

<template>
  <div
    class="border-primary/30 bg-card overflow-hidden rounded-lg border"
    role="group"
    :aria-label="t('battle.recent.seriesLabel', { opponent, count: group.games.length })"
    data-testid="series-card"
  >
    <div
      class="border-border bg-primary/5 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b px-3 py-1.5"
    >
      <span class="truncate font-medium">{{ opponent }}</span>

      <!-- The games on screen, counted. Never "you won this series": what is on
           screen may be an unfinished series, or a finished one half imported. -->
      <span class="text-primary font-mono text-sm font-semibold tabular-nums">
        {{
          t('battle.recent.seriesScore', { wins: group.series.wins, losses: group.series.losses })
        }}
      </span>

      <span class="text-muted-foreground text-xs">
        {{ bestOfLabel(group.series.formatId) }} · {{ day(group.series.playedAt) }}
      </span>

      <span
        v-if="group.series.ratingDelta !== null"
        class="text-muted-foreground ml-auto font-mono text-xs tabular-nums"
      >
        {{ group.series.ratingDelta > 0 ? '+' : '' }}{{ group.series.ratingDelta }}
      </span>
    </div>

    <button
      v-for="(game, index) of group.games"
      :key="game.replayId"
      type="button"
      class="hover:bg-muted/50 focus-visible:ring-ring border-border flex w-full items-center gap-3 border-t border-l-2 px-3 py-2 text-left first:border-t-0 focus-visible:ring-2 focus-visible:outline-none"
      :class="
        game.replayId === battleRoute.openId.value
          ? 'border-l-primary bg-primary/5'
          : 'border-l-transparent'
      "
      data-testid="recent-battle"
      @click="() => battleRoute.open(game.replayId)"
    >
      <!-- Derived from the order, because the log has no game number: the
           drawer's switcher numbers the same games the same way. It reads the
           whole series from the database though, so the two agree only while
           the list holds the whole series — which the limit guarantees and a
           date filter can still break. -->
      <span
        class="border-border text-muted-foreground shrink-0 rounded-full border px-1.5 font-mono text-[10px]"
      >
        {{ t('battle.drawer.game', { number: index + 1 }) }}
      </span>

      <span
        class="w-5 shrink-0 text-center font-mono text-lg"
        :class="game.result ? RESULT_TONE[game.result] : 'text-muted-foreground'"
      >
        {{ game.result ? t(`battle.resultShort.${game.result}`) : '·' }}
      </span>

      <span class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        <SpeciesParty :signature="game.myBring" :size="33" />
        <span class="text-muted-foreground px-1 font-mono text-[10px]">
          {{ t('battle.drawer.versus') }}
        </span>
        <SpeciesParty :signature="game.opponentBring" :size="33" />
      </span>

      <span
        v-if="game.turnCount !== null"
        class="text-muted-foreground shrink-0 text-xs tabular-nums"
      >
        {{ t('battle.recent.turns', { count: game.turnCount }) }}
      </span>
    </button>
  </div>
</template>
