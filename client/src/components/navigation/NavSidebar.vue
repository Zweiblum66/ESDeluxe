<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useUiStore } from '@/stores/ui.store';

const route = useRoute();
const uiStore = useUiStore();

interface NavItem {
  title: string;
  icon: string;
  to: string;
  routeName: string;
}

interface SectionNav {
  [key: string]: NavItem[];
}

const sectionNavItems: SectionNav = {
  management: [
    { title: 'Users', icon: 'mdi-account-multiple', to: '/users', routeName: 'users' },
    { title: 'Groups', icon: 'mdi-account-group', to: '/groups', routeName: 'groups' },
    { title: 'Media Spaces', icon: 'mdi-folder-multiple', to: '/spaces', routeName: 'spaces' },
    { title: 'File Browser', icon: 'mdi-file-tree', to: '/files', routeName: 'files' },
    { title: 'Tiering', icon: 'mdi-swap-vertical-bold', to: '/tiering', routeName: 'tiering' },
    { title: 'Access', icon: 'mdi-shield-key', to: '/access', routeName: 'access' },
    { title: 'QoS', icon: 'mdi-speedometer', to: '/qos', routeName: 'qos' },
    { title: 'Trash', icon: 'mdi-delete', to: '/trash', routeName: 'trash' },
  ],
  synchronization: [
    { title: 'Sync Status', icon: 'mdi-sync', to: '/sync', routeName: 'sync' },
  ],
  system: [
    { title: 'Dashboard', icon: 'mdi-monitor-dashboard', to: '/dashboard', routeName: 'dashboard' },
    { title: 'Settings', icon: 'mdi-cog', to: '/settings', routeName: 'settings' },
  ],
};

const currentNavItems = computed(() => {
  return sectionNavItems[uiStore.activeSection] || [];
});

const sectionTitle = computed(() => {
  const titles: Record<string, string> = {
    management: 'EFS Control',
    synchronization: 'Synchronization',
    system: 'System',
  };
  return titles[uiStore.activeSection] || 'EFS Control';
});

function isActive(item: NavItem): boolean {
  const name = route.name as string | undefined;
  if (!name) return false;
  // Support prefix matching (e.g., 'files' matches 'files', 'files-space', 'files-path')
  return name === item.routeName || name.startsWith(item.routeName + '-');
}
</script>

<template>
  <div class="nav-sidebar">
    <!-- Section title -->
    <div class="nav-sidebar__header">
      <span class="nav-sidebar__title">{{ sectionTitle }}</span>
    </div>

    <!-- Navigation items -->
    <nav class="nav-sidebar__nav">
      <router-link
        v-for="item in currentNavItems"
        :key="item.routeName"
        :to="item.to"
        class="nav-sidebar__item"
        :class="{ 'nav-sidebar__item--active': isActive(item) }"
      >
        <span class="nav-sidebar__indicator" />
        <v-icon size="20" class="nav-sidebar__icon">{{ item.icon }}</v-icon>
        <span class="nav-sidebar__label">{{ item.title }}</span>
      </router-link>
    </nav>
  </div>
</template>

<style scoped lang="scss">
.nav-sidebar {
  width: 220px;
  height: 100vh;
  background-color: #1a1d23;
  border-right: 1px solid rgba(55, 65, 81, 0.3);
  position: fixed;
  left: 56px;
  top: 0;
  z-index: 1005;
  display: flex;
  flex-direction: column;

  &__header {
    height: 52px;
    display: flex;
    align-items: center;
    padding: 0 20px;
    border-bottom: 1px solid rgba(55, 65, 81, 0.3);
  }

  &__title {
    font-size: 15px;
    font-weight: 600;
    color: #e5e7eb;
    letter-spacing: 0.02em;
  }

  &__nav {
    display: flex;
    flex-direction: column;
    padding: 8px 0;
    gap: 2px;
  }

  &__item {
    position: relative;
    display: flex;
    align-items: center;
    height: 40px;
    padding: 0 20px;
    color: #9ca3af;
    text-decoration: none;
    transition: all 150ms ease;
    font-size: 14px;

    &:hover {
      color: #e5e7eb;
      background-color: rgba(255, 255, 255, 0.04);
    }

    &--active {
      color: #e5e7eb;
      background-color: rgba(59, 130, 246, 0.08);

      .nav-sidebar__indicator {
        opacity: 1;
      }

      .nav-sidebar__icon {
        color: #3b82f6;
      }
    }
  }

  &__indicator {
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background-color: #3b82f6;
    opacity: 0;
    transition: opacity 150ms ease;
  }

  &__icon {
    margin-right: 12px;
    flex-shrink: 0;
  }

  &__label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
