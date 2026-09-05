<script setup lang="ts">
const { whenLoaded } = useStats()
const { aliases, loaded, load } = useProfile()

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
await Promise.all([whenLoaded(), load().catch(() => {})])
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
  <main class="flex flex-col gap-6 py-8">
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
</template>
