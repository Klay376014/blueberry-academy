<script setup lang="ts">
import { ExternalLink, X } from '@lucide/vue'
import { SheetDescription, SheetTitle } from '~/shared/components/ui/sheet'
import { drawerSides } from '../utils/drawerSides'
import type { DrawerSide } from '../utils/drawerSides'
import { sideSlot } from '../utils/sideSlots'
import { SIDE_TEXT } from '../utils/sideTones'
import { useSideMark } from '../composables/useSideName'
import type { DrawerBattle } from '../composables/useBattleDrawer'
import { bestOfLabel } from '~/shared/utils/formatLabel'
import { replayUrl } from '~/shared/utils/replayLink'

/**
 * Who played, what came of it, and the way to the other games of a series.
 *
 * Its own component rather than the top of `BattleDrawer.vue`: everything here
 * reads one battle and nothing here reads the drawer's state, so as part of
 * the drawer it could only be tested by standing up Supabase and the log
 * fetch. Which meant it was not tested, and the two columns being drawn in one
 * ink went unnoticed (#145).
 */
const props = defineProps<{ battle: DrawerBattle | null; games: DrawerBattle[] }>()

const emit = defineEmits<{ open: [replayId: string]; close: [] }>()

const { t, locale } = useI18n()

/** In the reader's own locale, and out of the template: see `import.vue`. */
const playedOn = computed(() =>
  props.battle ? new Date(props.battle.playedAt).toLocaleDateString(locale.value) : '',
)

/**
 * The two players, in the order the header draws them. One header for both
 * kinds of battle: see `utils/drawerSides.ts` for why it is not two.
 */
const sides = computed(() => (props.battle ? drawerSides(props.battle) : null))

const sideMarkOf = useSideMark()

/**
 * A column: what to call the player, what to call the side, and the hue both
 * take.
 *
 * The hue comes from the slot rather than from left-or-right, so the header
 * cannot drift out of step with the rows beneath it — they ask the same
 * question of the same function (#143).
 */
function column(at: string, side: DrawerSide | undefined, fallback: string) {
  const slot = sideSlot(side?.side ?? null, props.battle?.mySide ?? null)

  return {
    // Keyed on the position, not the slot: a battle that never parsed has no
    // side on either column, so both would answer `neutral` and the two of
    // them would key alike.
    at,
    // The fallback is where the two kinds of battle differ: a battle of mine
    // has a "you" and an "opponent" to fall back on, a spectated one has
    // neither — both players are somebody else, so neither column can be named
    // after the reader.
    name:
      side?.name ?? t(sides.value?.attributed === false ? 'battle.drawer.unknownPlayer' : fallback),
    // An unparsed row reaches here with no side at all, and a mark naming one
    // would claim the log identified a player it never did.
    sideMark: side?.side ? sideMarkOf(side.side, props.battle?.mySide ?? null) : null,
    tone: SIDE_TEXT[slot],
    won: side?.won ?? false,
    team: side?.team ?? null,
    bring: side?.bring ?? null,
  }
}

const left = computed(() => column('left', sides.value?.left, 'battle.drawer.you'))
const right = computed(() => column('right', sides.value?.right, 'battle.drawer.unknownOpponent'))

/** Both columns, so the template says each of them once. */
const columns = computed(() => [left.value, right.value])

const RESULT_TONE = {
  win: 'border-primary text-primary',
  loss: 'border-destructive text-destructive',
  tie: 'border-border text-muted-foreground',
}
</script>

<template>
  <header class="border-border flex flex-col gap-2 border-b p-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <span class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
          {{ playedOn }}
          {{ battle ? `· ${battle.formatId}` : '' }}
        </span>

        <!-- Each name in its own side's hue, so a reader who has learned the
             two hues from the rows can match them here. -->
        <SheetTitle class="truncate text-base">
          <span :class="left.tone" data-testid="side-name">{{ left.name }}</span>
          <span class="text-muted-foreground">{{ t('battle.drawer.versus') }}</span>
          <span :class="right.tone" data-testid="side-name">{{ right.name }}</span>
        </SheetTitle>
        <SheetDescription class="sr-only">{{ t('battle.drawer.about') }}</SheetDescription>
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <span
          v-if="battle?.result"
          class="rounded border px-2 py-0.5 font-mono text-[10px] tracking-widest uppercase"
          :class="RESULT_TONE[battle.result]"
          data-testid="battle-result"
        >
          {{ t(`battle.result.${battle.result}`) }}
        </span>
        <!-- A spectated battle has no `result`: that column is win or loss
             relative to a "me" this battle has none of. A draw is the one
             verdict that reads the same from either side, so it is the
             badge's own word rather than a second one. -->
        <span
          v-else-if="sides?.tie"
          class="rounded border px-2 py-0.5 font-mono text-[10px] tracking-widest uppercase"
          :class="RESULT_TONE.tie"
          data-testid="battle-result"
        >
          {{ t('battle.result.tie') }}
        </span>
        <a
          v-if="battle"
          :href="replayUrl(battle.replayId)"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary flex items-center gap-1 text-xs underline"
          data-testid="replay-link"
        >
          {{ t('battle.drawer.replay') }}
          <ExternalLink class="size-3" aria-hidden="true" />
        </a>
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded p-1 focus-visible:ring-2 focus-visible:outline-none"
          :aria-label="t('battle.drawer.close')"
          data-testid="drawer-close"
          @click="() => emit('close')"
        >
          <X class="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>

    <!-- The winner is marked on this row rather than beside the name it
         belongs to: the title truncates, and on a phone two ordinary
         Showdown names already fill it — the mark would be the first thing
         the ellipsis ate, and for a spectated battle it is the only thing
         on screen that says who won. This row wraps instead of clipping,
         and it is in the same left-to-right order as the names above it. -->
    <div v-if="battle && sides" class="flex flex-wrap items-center gap-2">
      <template v-for="(column, index) of columns" :key="column.at">
        <span class="text-muted-foreground font-mono text-[10px]" v-if="index > 0">
          {{ t('battle.drawer.versus') }}
        </span>

        <!-- The side in words, in the same hue and the same wording the rows
             use, so the header and the timeline name a side alike. -->
        <span
          v-if="column.sideMark"
          class="rounded border px-0.5 font-mono text-[9px] tracking-tight uppercase"
          :class="column.sideMark.tone"
          data-testid="side-mark"
        >
          {{ column.sideMark.label }}
        </span>

        <SpeciesParty :signature="column.team" :bring="column.bring" :size="36" />

        <span
          v-if="column.won"
          class="font-mono text-[10px] tracking-widest uppercase"
          :class="column.tone"
          data-testid="side-won"
        >
          {{ t('battle.drawer.won') }}
        </span>
      </template>

      <span class="text-muted-foreground ml-auto font-mono text-[10px] tracking-widest">
        {{ bestOfLabel(battle.formatId) }}
        <template v-if="battle.turnCount !== null">
          · {{ t('battle.recent.turns', { count: battle.turnCount }) }}
        </template>
      </span>
    </div>

    <!-- Only a series has other games to move between; a ladder game is on its own. -->
    <div v-if="games.length" class="flex flex-wrap gap-1.5" role="group">
      <button
        v-for="(game, index) of games"
        :key="game.replayId"
        type="button"
        class="rounded-md border px-2.5 py-1 text-xs"
        :class="
          game.replayId === battle?.replayId
            ? 'border-primary bg-primary/10 text-foreground'
            : 'border-border text-muted-foreground hover:text-foreground'
        "
        :aria-current="game.replayId === battle?.replayId"
        data-testid="series-game"
        @click="() => emit('open', game.replayId)"
      >
        {{ t('battle.drawer.game', { number: index + 1 }) }}
      </button>
    </div>
  </header>
</template>
