<script setup lang="ts">
import IconSidebar from '@/components/navigation/IconSidebar.vue';
import NavSidebar from '@/components/navigation/NavSidebar.vue';
import TopBar from '@/components/navigation/TopBar.vue';
</script>

<template>
  <div class="app-shell">
    <!-- Icon sidebar: 56px fixed left -->
    <IconSidebar />

    <!-- Nav sidebar: 220px fixed, offset by icon sidebar -->
    <NavSidebar />

    <!-- Main content area -->
    <div class="app-shell__main">
      <TopBar />
      <div class="app-shell__content">
        <router-view />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.app-shell {
  display: flex;
  min-height: 100vh;
  background-color: #1a1d23;

  &__main {
    flex: 1;
    margin-left: 276px; // 56px icon sidebar + 220px nav sidebar
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  &__content {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
  }
}
</style>
