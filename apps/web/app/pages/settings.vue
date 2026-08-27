<script setup lang="ts">
const { refresh: refreshStats } = useStats()

// Not awaited: the rows the dashboard holds are session state this route never
// touched, and battles just claimed by a newly bound name are not in them —
// but nothing on this page is waiting to hear how that read went.
function onReattributed() {
  void refreshStats()
}
</script>

<template>
  <!--
    Binding a name is `features/identity`; the dashboard it invalidates is
    `features/stats`. Two features meet here because a page is the only place
    they may (ADR-0011).
  -->
  <IdentitySettingsPage @reattributed="onReattributed" />
</template>
