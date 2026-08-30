<script setup lang="ts">
import { ExternalLink, X } from '@lucide/vue'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '~/shared/components/ui/sheet'
import { drawerSides } from '../utils/drawerSides'
import type { DrawerSide } from '../utils/drawerSides'
import { bestOfLabel } from '~/shared/utils/formatLabel'
import { replayUrl } from '~/shared/utils/replayLink'

/**
 * One game, flattened: every turn on one page rather than one action at a time.
 *
 * The opposite of Showdown's own player, on purpose. That is built to re-enact
 * a battle — one animation at a time, and "what happened on turn 3" means
 * playing or scrubbing to it. This is built to be read at a glance, and the
 * link back to Showdown is right there for when the animation is the point
 * (design document §1).
 */
const drawer = useBattleDrawer()
const user = useCurrentUser()
const { battle, series, snapshots, timeline, loading, failure, logError, openId } = drawer

/**
 * The one watcher on the address, here rather than in the composable: the list
 * uses the same composable for `open()`, and a watcher per caller would read
 * the battle, its series and its log once per caller.
 *
 * Who is signed in is watched alongside it, because the address survives a
 * change of user and the battle behind it does not: the Supabase plugin
 * empties the drawer's state, and without this the panel would sit open over
 * nothing at all.
 */
watch(
  [openId, () => user.value?.id],
  ([replayId, signedIn]) => drawer.follow(signedIn ? replayId : null),
  { immediate: true },
)

const { t, locale } = useI18n()

/** In the reader's own locale, and out of the template: see `import.vue`. */
const playedOn = computed(() =>
  battle.value ? new Date(battle.value.playedAt).toLocaleDateString(locale.value) : '',
)

function openGame(replayId: string) {
  drawer.open(replayId)
}

function closeDrawer() {
  drawer.close()
}

const isOpen = computed(() => openId.value !== null)

/**
 * The two players, in the order the header draws them. One header for both
 * kinds of battle: see `utils/drawerSides.ts` for why it is not two.
 */
const sides = computed(() => (battle.value ? drawerSides(battle.value) : null))

/**
 * A side's name, or what to call it when the row has none.
 *
 * The fallback is where the two kinds of battle differ: a battle of mine has a
 * "you" and an "opponent" to fall back on, a spectated one has neither — both
 * players are somebody else, so neither column can be named after the reader.
 */
function nameOf(side: DrawerSide | undefined, mine: string): string {
  if (side?.name) return side.name

  return t(sides.value?.attributed === false ? 'battle.drawer.unknownPlayer' : mine)
}

const leftName = computed(() => nameOf(sides.value?.left, 'battle.drawer.you'))
const rightName = computed(() => nameOf(sides.value?.right, 'battle.drawer.unknownOpponent'))

/** The other games of this series, oldest first, only when there is a series. */
const games = computed(() => (series.value.length > 1 ? series.value : []))

const snapshotOf = (index: number) => snapshots.value[index] ?? null

const RESULT_TONE = {
  win: 'border-primary text-primary',
  loss: 'border-destructive text-destructive',
  tie: 'border-border text-muted-foreground',
}
</script>

<template>
  <Sheet :open="isOpen" @update:open="(next: boolean) => !next && closeDrawer()">
    <!-- `[&>button:last-child]:hidden` hides the close button SheetContent
         draws for itself, which sits absolutely positioned over the header's.
         Hidden from here rather than deleted there: that file is the shadcn CLI's
         output (ADR-0005), and the button kept is the one whose label is
         translated. -->
    <SheetContent
      side="right"
      class="w-full gap-0 p-0 sm:max-w-2xl [&>button:last-child]:hidden"
      data-testid="battle-drawer"
      @escape-key-down="closeDrawer"
    >
      <header class="border-border flex flex-col gap-2 border-b p-3">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <span class="text-muted-foreground font-mono text-[10px] tracking-widest uppercase">
              {{ playedOn }}
              {{ battle ? `· ${battle.formatId}` : '' }}
            </span>
            <SheetTitle class="truncate text-base">
              {{ leftName }}
              <span class="text-muted-foreground">{{ t('battle.drawer.versus') }}</span>
              {{ rightName }}
            </SheetTitle>
            <SheetDescription class="sr-only">{{ t('battle.drawer.about') }}</SheetDescription>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <span
              v-if="battle?.result"
              class="rounded border px-2 py-0.5 font-mono text-[10px] tracking-widest uppercase"
              :class="RESULT_TONE[battle.result]"
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
              @click="closeDrawer"
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
          <SpeciesParty :signature="sides.left.team" :bring="sides.left.bring" :size="36" />
          <span
            v-if="sides.left.won"
            class="text-primary font-mono text-[10px] tracking-widest uppercase"
            data-testid="side-won"
          >
            {{ t('battle.drawer.won') }}
          </span>
          <span class="text-muted-foreground font-mono text-[10px]">
            {{ t('battle.drawer.versus') }}
          </span>
          <SpeciesParty :signature="sides.right.team" :bring="sides.right.bring" :size="36" />
          <span
            v-if="sides.right.won"
            class="text-primary font-mono text-[10px] tracking-widest uppercase"
            data-testid="side-won"
          >
            {{ t('battle.drawer.won') }}
          </span>
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
            @click="() => openGame(game.replayId)"
          >
            {{ t('battle.drawer.game', { number: index + 1 }) }}
          </button>
        </div>
      </header>

      <div class="flex-1 overflow-y-auto px-3 pb-6">
        <p v-if="loading" class="text-muted-foreground py-6 text-sm" data-testid="timeline-loading">
          {{ t('battle.drawer.loading') }}
        </p>

        <p
          v-else-if="failure === 'missing'"
          class="text-muted-foreground py-6 text-sm"
          data-testid="battle-missing"
        >
          {{ t('battle.drawer.missing') }}
        </p>

        <p v-else-if="failure" class="text-destructive py-6 text-sm" data-testid="timeline-error">
          {{ failure === 'log' ? t('battle.drawer.logFailed') : t('battle.drawer.rowFailed') }}
          <span v-if="logError" class="text-muted-foreground block">{{ logError.message }}</span>
        </p>

        <p
          v-else-if="battle?.parseError"
          class="text-muted-foreground py-6 text-sm"
          data-testid="timeline-unparsed"
        >
          {{ t('battle.drawer.unparsed', { message: battle.parseError }) }}
        </p>

        <div v-else-if="timeline" class="flex flex-col">
          <BattleTurn
            v-for="(turn, index) of timeline.turns"
            :key="`${battle?.replayId}-${turn.number}`"
            :turn
            :snapshot="snapshotOf(index)"
            :my-side="battle?.mySide ?? null"
          />

          <BattleOutcome v-if="battle" :battle />
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
