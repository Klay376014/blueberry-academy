<template>
  <!--
    The dashboard, and the drawer it opens. Two features meet here and nowhere
    else: the numbers are `features/stats`, the timeline behind one battle is
    `features/timeline`, and a page is where they are allowed to (issue #61).
  -->
  <main class="flex flex-col gap-6 py-8">
    <StatsDashboardPage />

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
