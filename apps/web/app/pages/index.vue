<script setup lang="ts">
/**
 * One address, two readers (issue #126). A stranger is told what this is; a
 * signed-in reader gets the dashboard, at the same URL as before — so a
 * `?battle=` link opens the drawer it names for anyone who has a session.
 * Somebody who does not is shown the landing page and the battle in the
 * address is dropped: signing in returns to a bare `/`, which is a round trip
 * nothing carries a destination through yet.
 *
 * The shell is chosen by the `shell` middleware rather than drawn here, which
 * is what `app/error.vue` has to do differently because it is not a route.
 * Drawn here, the header, the nav and both switchers would be inside this
 * page's Suspense boundary — a cold load of the dashboard would show an empty
 * window until the battles came back, rather than the shell with the body
 * still filling in.
 */
definePageMeta({
  layout: 'public',
  middleware: ['shell'],
})

const user = useCurrentUser()

const { whenLoaded } = useStats()
const { aliases, loaded, load } = useProfile()

// Only for somebody signed in. A stranger has no session, so both reads would
// be refused by RLS anyway — and a landing page that waits on two refusals
// before it can say what this product is has no reason to exist.
//
// Both reads in the air at once, and the page waits for both.
//
// Awaited, because the reader this page has something new to say to is the one
// whose alias list is empty: settling that after the first paint would show
// them the old "go and import" wording and swap it out underneath them, which
// is the wording that sent them to import thirty replays in the first place
// (#129). Started together rather than one after the other, because
// `whenLoaded()` is idempotent and safe to call from any page's setup — the
// dashboard's own await of it then finds the read already settled instead of
// queueing behind this one.
//
// The failure is swallowed: a profile that could not be read leaves `loaded`
// false, and an unread list is not an empty one. Nothing else here needs it.
if (user.value) await Promise.all([whenLoaded(), load().catch(() => {})])

// A session can also arrive while this page is open — signing in on another
// tab is one auth state change away, and the template below swaps the landing
// content for the dashboard the moment it does. `useStats` re-reads on its own
// (it watches the user id); the alias list has no such watcher, and without it
// `loaded` would stay false for the rest of the session, quietly taking #129's
// "none of this is yours because no name is bound" off the empty dashboard.
watch(user, (who) => {
  if (who) void load().catch(() => {})
})
</script>

<template>
  <!--
    The dashboard, and the drawer it opens. Two features meet here and nowhere
    else: the numbers are `features/stats`, the timeline behind one battle is
    `features/timeline`, and a page is where they are allowed to (issue #61).

    The alias list is `features/identity`, and the dashboard needs one bit of
    it: attribution is the alias list re-derived (ADR-0012), so an account with
    no name bound has imported nothing it can call its own, however many
    replays it imported (#129).
  -->
  <main v-if="user" class="flex flex-col gap-6 py-8">
    <StatsDashboardPage :no-name-bound="loaded && aliases.length === 0" />

    <!--
      Outside the dashboard, not inside it: `StatsDashboardPage` collapses to
      "nothing here yet" when no battle of the reader's own survives the
      filters, and an account holding only other people's replays is exactly
      that account (issue #66).
    -->
    <SpectatedSection />

    <!-- Bound to `?battle=`, so it is open on arrival when the address says so. -->
    <BattleDrawer />
  </main>

  <!--
    What a stranger is shown, and the only thing they are shown: nothing in
    it reads a battle (issue #126).
  -->
  <MarketingLandingPage v-else />
</template>
