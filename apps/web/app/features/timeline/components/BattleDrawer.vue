<script setup lang="ts">
import { Sheet, SheetContent } from '~/shared/components/ui/sheet'

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

const { t } = useI18n()

function openGame(replayId: string) {
  drawer.open(replayId)
}

function closeDrawer() {
  drawer.close()
}

const isOpen = computed(() => openId.value !== null)

/** The other games of this series, oldest first, only when there is a series. */
const games = computed(() => (series.value.length > 1 ? series.value : []))

/**
 * The field a turn opened on: the snapshot the turn before it left behind.
 *
 * `fieldSnapshots` reports the end of each turn, and a turn drawn over its own
 * end reads its result before its events (#92). The lead has no turn before it
 * and gets `null` — its own events are who came in.
 */
const openingOf = (index: number) => snapshots.value[index - 1] ?? null

/**
 * The field the game finished on — the last turn's own end, which no turn
 * draws now that each of them draws its opening.
 *
 * It is also the only field a game that never reached a turn has: a forfeit at
 * team preview is the lead and nothing else (#93).
 */
const closingField = computed(() => snapshots.value.at(-1) ?? null)
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
      <BattleDrawerHeader :battle :games @open="openGame" @close="closeDrawer" />

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
            :snapshot="openingOf(index)"
            :my-side="battle?.mySide ?? null"
          />

          <BattleFieldBar
            v-if="closingField"
            class="mt-2"
            :snapshot="closingField"
            :my-side="battle?.mySide ?? null"
            :caption="t('battle.drawer.closingField')"
          />

          <BattleOutcome v-if="battle" :battle />
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
