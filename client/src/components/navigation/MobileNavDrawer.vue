<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useUiStore } from '@/stores/ui.store';
import type { ActiveSection } from '@/stores/ui.store';

const route = useRoute();
const uiStore = useUiStore();

interface NavItem {
  title: string;
  icon: string;
  to: string;
  routeName: string;
}

interface SectionDef {
  id: ActiveSection;
  icon: string;
  label: string;
  items: NavItem[];
}

const sections: SectionDef[] = [
  {
    id: 'management',
    icon: 'mdi-view-dashboard',
    label: 'Management',
    items: [
      { title: 'Users', icon: 'mdi-account-multiple', to: '/users', routeName: 'users' },
      { title: 'Groups', icon: 'mdi-account-group', to: '/groups', routeName: 'groups' },
      { title: 'Media Spaces', icon: 'mdi-folder-multiple', to: '/spaces', routeName: 'spaces' },
      { title: 'File Browser', icon: 'mdi-file-tree', to: '/files', routeName: 'files' },
      { title: 'Tiering', icon: 'mdi-swap-vertical-bold', to: '/tiering', routeName: 'tiering' },
      { title: 'Access', icon: 'mdi-shield-key', to: '/access', routeName: 'access' },
      { title: 'QoS', icon: 'mdi-speedometer', to: '/qos', routeName: 'qos' },
      { title: 'Trash', icon: 'mdi-delete', to: '/trash', routeName: 'trash' },
    ],
  },
  {
    id: 'synchronization',
    icon: 'mdi-sync',
    label: 'Sync',
    items: [
      { title: 'Sync Status', icon: 'mdi-sync', to: '/sync', routeName: 'sync' },
    ],
  },
  {
    id: 'system',
    icon: 'mdi-cog',
    label: 'System',
    items: [
      { title: 'Dashboard', icon: 'mdi-monitor-dashboard', to: '/dashboard', routeName: 'dashboard' },
      { title: 'Settings', icon: 'mdi-cog', to: '/settings', routeName: 'settings' },
    ],
  },
];

const currentItems = computed(() => {
  const section = sections.find((s) => s.id === uiStore.activeSection);
  return section?.items || [];
});

function isActive(item: NavItem): boolean {
  const name = route.name as string | undefined;
  if (!name) return false;
  return name === item.routeName || name.startsWith(item.routeName + '-');
}

function handleSectionClick(sectionId: ActiveSection): void {
  uiStore.setActiveSection(sectionId);
}
</script>

<template>
  <div class="mobile-nav">
    <!-- Header -->
    <div class="mobile-nav__header">
      <v-icon size="24" color="primary">mdi-server</v-icon>
      <span class="mobile-nav__brand">EFS Control</span>
      <v-spacer />
      <v-btn icon="mdi-close" variant="text" size="small" @click="uiStore.closeMobileDrawer()" />
    </div>

    <!-- Section tabs -->
    <div class="mobile-nav__sections">
      <button
        v-for="section in sections"
        :key="section.id"
        class="mobile-nav__section-btn"
        :class="{ 'mobile-nav__section-btn--active': uiStore.activeSection === section.id }"
        @click="handleSectionClick(section.id)"
      >
        <v-icon size="18">{{ section.icon }}</v-icon>
        <span>{{ section.label }}</span>
      </button>
    </div>

    <!-- Nav items -->
    <nav class="mobile-nav__items">
      <router-link
        v-for="item in currentItems"
        :key="item.routeName"
        :to="item.to"
        class="mobile-nav__item"
        :class="{ 'mobile-nav__item--active': isActive(item) }"
      >
        <v-icon size="20" class="mobile-nav__item-icon">{{ item.icon }}</v-icon>
        <span>{{ item.title }}</span>
      </router-link>
    </nav>
  </div>
</template>

<style scoped lang="scss">
.mobile-nav {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: $es-bg-dark;

  &__header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(55, 65, 81, 0.3);
  }

  &__brand {
    font-size: 16px;
    font-weight: 600;
    color: $es-text-primary;
  }

  &__sections {
    display: flex;
    gap: 4px;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(55, 65, 81, 0.3);
  }

  &__section-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: none;
    border-radius: $es-radius-md;
    background: transparent;
    color: $es-text-muted;
    font-size: 13px;
    cursor: pointer;
    transition: all $es-transition-fast;
    white-space: nowrap;

    &:hover {
      color: $es-text-primary;
      background-color: rgba(255, 255, 255, 0.05);
    }

    &--active {
      color: $es-text-primary;
      background-color: rgba($es-primary, 0.12);

      .v-icon {
        color: $es-primary;
      }
    }
  }

  &__items {
    display: flex;
    flex-direction: column;
    padding: 8px 0;
    gap: 2px;
    overflow-y: auto;
    flex: 1;
  }

  &__item {
    display: flex;
    align-items: center;
    min-height: 48px;
    padding: 0 20px;
    color: $es-text-secondary;
    text-decoration: none;
    font-size: 15px;
    transition: all $es-transition-fast;

    &:hover {
      color: $es-text-primary;
      background-color: rgba(255, 255, 255, 0.04);
    }

    &--active {
      color: $es-text-primary;
      background-color: rgba($es-primary, 0.08);
    }
  }

  &__item-icon {
    margin-right: 14px;
    flex-shrink: 0;
  }
}
</style>
