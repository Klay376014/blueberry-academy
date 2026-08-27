<template>
  <!--
    The dashboard, and the drawer it opens. Two features meet here and nowhere
    else: the numbers are `features/stats`, the timeline behind one battle is
    `features/timeline`, and a page is where they are allowed to (issue #61).
  -->
  <main class="flex flex-col gap-6 py-8">
    <StatsDashboardPage />

    <!-- Bound to `?battle=`, so it is open on arrival when the address says so. -->
    <BattleDrawer />
  </main>
</template>
