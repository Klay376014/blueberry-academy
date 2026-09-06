<script setup lang="ts">
// The shape every page's tab title takes (issue #139). Here rather than in a
// layout: the two shells are chosen per page, and a title is not a shell.
useSiteTitle()
</script>

<template>
  <!--
    No markup of its own: the shell is a layout, and each page says which of
    the two it wants (issue #125). `<NuxtLayout>` reads that off the route, so
    nothing here has to know about it.
  -->
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
