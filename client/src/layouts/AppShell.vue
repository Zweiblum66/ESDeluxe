<script setup lang="ts">
import IconSidebar from '@/components/navigation/IconSidebar.vue';
import NavSidebar from '@/components/navigation/NavSidebar.vue';
import MobileNavDrawer from '@/components/navigation/MobileNavDrawer.vue';
import TopBar from '@/components/navigation/TopBar.vue';
import { useUiStore } from '@/stores/ui.store';

const uiStore = useUiStore();
</script>

<template>
  <div class="app-shell">
    <!-- Desktop: fixed sidebars (hidden on tablet-down via CSS) -->
    <IconSidebar class="app-shell__desktop-only" />
    <NavSidebar class="app-shell__desktop-only" />

    <!-- Mobile/Tablet: overlay drawer (hidden on desktop-up via CSS) -->
    <v-navigation-drawer
      v-model="uiStore.mobileDrawerOpen"
      temporary
      width="280"
      class="app-shell__mobile-only"
    >
      <MobileNavDrawer />
    </v-navigation-drawer>

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
  background-color: $es-bg-dark;

  &__desktop-only {
    @include tablet-down {
      display: none !important;
    }
  }

  &__mobile-only {
    @include desktop-up {
      display: none !important;
    }
  }

  &__main {
    flex: 1;
    margin-left: $es-total-sidebar-width;
    display: flex;
    flex-direction: column;
    min-height: 100vh;

    @include tablet-down {
      margin-left: 0;
    }
  }

  &__content {
    flex: 1;
    padding: $es-spacing-lg;
    overflow-y: auto;

    @include tablet {
      padding: $es-spacing-md;
    }

    @include phone {
      padding: 12px;
    }
  }
}
</style>
