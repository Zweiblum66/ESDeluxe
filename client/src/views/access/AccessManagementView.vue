<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAccessStore } from '@/stores/access.store';
import { useSpacesStore } from '@/stores/spaces.store';
import { useUsersStore } from '@/stores/users.store';
import { useGroupsStore } from '@/stores/groups.store';
import PageHeader from '@/components/common/PageHeader.vue';
import ContextMenu from '@/components/common/ContextMenu.vue';
import type { ContextMenuItem } from '@/components/common/ContextMenu.vue';
import SpaceAccessPanel from './panels/SpaceAccessPanel.vue';
import UserAccessPanel from './panels/UserAccessPanel.vue';
import GroupAccessPanel from './panels/GroupAccessPanel.vue';

const router = useRouter();
const store = useAccessStore();
const spacesStore = useSpacesStore();
const usersStore = useUsersStore();
const groupsStore = useGroupsStore();

const leftSearch = ref<string | null>('');

// --- Context menu ---
const contextMenu = ref({ show: false, x: 0, y: 0, items: [] as ContextMenuItem[] });
const contextItemKey = ref<string | null>(null);

// Load all entity lists on mount
onMounted(async () => {
  await Promise.all([
    spacesStore.fetchSpaces(),
    usersStore.fetchUsers(),
    groupsStore.fetchGroups(),
  ]);
});

// Left panel items based on current perspective
const leftPanelItems = computed(() => {
  switch (store.perspective) {
    case 'space':
      return spacesStore.spaces.map((s) => ({
        key: s.name,
        label: s.name,
        subtitle: s.type,
        icon: 'mdi-folder-network',
      }));
    case 'user':
      return usersStore.users.map((u) => ({
        key: u.username,
        label: u.username,
        subtitle: u.identitySource,
        icon: 'mdi-account',
      }));
    case 'group':
      return groupsStore.groups.map((g) => ({
        key: g.name,
        label: g.name,
        subtitle: `${(g as Record<string, unknown>).memberCount ?? 0} members`,
        icon: 'mdi-account-group',
      }));
    default:
      return [];
  }
});

// Filtered left panel items
const filteredItems = computed(() => {
  const q = (leftSearch.value || '').trim().toLowerCase();
  if (!q) return leftPanelItems.value;
  return leftPanelItems.value.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.subtitle.toLowerCase().includes(q),
  );
});

const perspectiveLabel = computed(() => {
  switch (store.perspective) {
    case 'space': return 'space';
    case 'user': return 'user';
    case 'group': return 'group';
    default: return 'item';
  }
});

function handlePerspectiveChange(value: string): void {
  leftSearch.value = '';
  store.setPerspective(value as 'space' | 'user' | 'group');
}

function handleSelect(key: string): void {
  store.selectEntity(key);
}

function subtitleColor(subtitle: string): string {
  switch (subtitle) {
    case 'avidstyle': return 'primary';
    case 'avidmxf': return 'warning';
    case 'managed': return 'info';
    default: return 'default';
  }
}

function handleSidebarContextMenu(event: MouseEvent, item: { key: string; label: string }): void {
  contextItemKey.value = item.key;

  const items: ContextMenuItem[] = [];

  switch (store.perspective) {
    case 'space':
      items.push({ label: 'View Access', icon: 'mdi-shield-key', action: 'view-access' });
      items.push({ label: 'Browse Files', icon: 'mdi-folder-open', action: 'browse-files' });
      break;
    case 'user':
      items.push({ label: 'View Access', icon: 'mdi-shield-key', action: 'view-access' });
      items.push({ label: 'Edit User', icon: 'mdi-account-edit', action: 'edit-user' });
      break;
    case 'group':
      items.push({ label: 'View Access', icon: 'mdi-shield-key', action: 'view-access' });
      items.push({ label: 'Edit Group', icon: 'mdi-account-group', action: 'edit-group' });
      break;
  }

  contextMenu.value = { show: true, x: event.clientX, y: event.clientY, items };
}

function handleContextAction(action: string): void {
  if (!contextItemKey.value) return;
  switch (action) {
    case 'view-access':
      handleSelect(contextItemKey.value);
      break;
    case 'browse-files':
      router.push(`/files/${encodeURIComponent(contextItemKey.value)}`);
      break;
    case 'edit-user':
      router.push(`/users?highlight=${encodeURIComponent(contextItemKey.value)}`);
      break;
    case 'edit-group':
      router.push(`/groups?highlight=${encodeURIComponent(contextItemKey.value)}`);
      break;
  }
}
</script>

<template>
  <div class="access-view">
    <PageHeader title="Access Management">
      <template #actions>
        <v-btn-toggle
          :model-value="store.perspective"
          @update:model-value="handlePerspectiveChange"
          mandatory
          density="compact"
          variant="outlined"
          divided
          color="primary"
        >
          <v-btn value="space" size="small" prepend-icon="mdi-folder-multiple">
            By Space
          </v-btn>
          <v-btn value="user" size="small" prepend-icon="mdi-account">
            By User
          </v-btn>
          <v-btn value="group" size="small" prepend-icon="mdi-account-group">
            By Group
          </v-btn>
        </v-btn-toggle>
      </template>
    </PageHeader>

    <!-- Error Alert -->
    <v-alert
      v-if="store.error"
      type="error"
      variant="tonal"
      class="mb-4"
      closable
      @click:close="store.error = null"
    >
      {{ store.error }}
    </v-alert>

    <!-- Main content area (matches file browser layout) -->
    <div class="access-view__content">
      <!-- Left sidebar -->
      <div class="access-view__sidebar">
        <div class="access-view__sidebar-header">
          <v-icon size="16" class="mr-1">
            {{ store.perspective === 'space' ? 'mdi-folder-multiple' : store.perspective === 'user' ? 'mdi-account-multiple' : 'mdi-account-group' }}
          </v-icon>
          <span class="text-caption font-weight-medium">
            {{ store.perspective === 'space' ? 'Spaces' : store.perspective === 'user' ? 'Users' : 'Groups' }}
          </span>
          <span class="text-caption text-medium-emphasis ml-1">({{ leftPanelItems.length }})</span>
        </div>

        <div class="access-view__sidebar-search">
          <v-text-field
            v-model="leftSearch"
            :placeholder="`Filter ${perspectiveLabel}s...`"
            prepend-inner-icon="mdi-magnify"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            single-line
            class="access-view__search-field"
          />
        </div>

        <div class="access-view__sidebar-list">
          <div
            v-for="item in filteredItems"
            :key="item.key"
            class="access-view__sidebar-item"
            :class="{ 'access-view__sidebar-item--active': store.selectedEntity === item.key }"
            @click="handleSelect(item.key)"
            @contextmenu.prevent="handleSidebarContextMenu($event, item)"
          >
            <v-icon size="18" :color="store.selectedEntity === item.key ? '#60a5fa' : '#6b7280'" class="mr-2">
              {{ item.icon }}
            </v-icon>
            <span class="access-view__sidebar-label">{{ item.label }}</span>
            <v-chip
              v-if="store.perspective === 'space'"
              size="x-small"
              variant="tonal"
              label
              :color="subtitleColor(item.subtitle)"
              class="ml-auto access-view__sidebar-type"
            >
              {{ item.subtitle }}
            </v-chip>
            <span v-else class="ml-auto text-caption text-medium-emphasis access-view__sidebar-sub">
              {{ item.subtitle }}
            </span>
          </div>

          <div v-if="filteredItems.length === 0" class="access-view__sidebar-empty">
            No {{ perspectiveLabel }}s found
          </div>
        </div>
      </div>

      <!-- Right panel: Access details -->
      <div class="access-view__main">
        <!-- Loading -->
        <div v-if="store.isLoading" class="access-view__empty">
          <v-progress-circular indeterminate color="primary" size="32" />
          <div class="text-body-2 text-medium-emphasis mt-3">Loading access data...</div>
        </div>

        <!-- Empty state -->
        <div v-else-if="!store.selectedEntity" class="access-view__empty">
          <v-icon size="48" color="grey-darken-1">mdi-shield-key-outline</v-icon>
          <div class="text-body-1 text-medium-emphasis mt-3">
            Select a {{ perspectiveLabel }} to view access details
          </div>
        </div>

        <!-- Perspective panels -->
        <SpaceAccessPanel v-else-if="store.perspective === 'space'" />
        <UserAccessPanel v-else-if="store.perspective === 'user'" />
        <GroupAccessPanel v-else-if="store.perspective === 'group'" />
      </div>
    </div>

    <!-- Context Menu -->
    <ContextMenu
      v-model="contextMenu.show"
      :position="{ x: contextMenu.x, y: contextMenu.y }"
      :items="contextMenu.items"
      @action="handleContextAction"
    />
  </div>
</template>

<style scoped lang="scss">
.access-view {
  max-width: 1600px;

  @include phone {
    max-width: 100%;
  }

  &__content {
    display: flex;
    gap: 0;
    border: 1px solid rgba(55, 65, 81, 0.3);
    border-radius: 8px;
    overflow: hidden;
    background-color: #22252d;
    min-height: 500px;

    @include phone {
      flex-direction: column;
      min-height: 300px;
    }
  }

  &__sidebar {
    width: 280px;
    min-width: 280px;
    border-right: 1px solid rgba(55, 65, 81, 0.3);
    display: flex;
    flex-direction: column;
    overflow: hidden;

    @include phone {
      width: 100%;
      min-width: 100%;
      max-height: 250px;
      border-right: none;
      border-bottom: 1px solid rgba(55, 65, 81, 0.3);
    }
  }

  &__sidebar-header {
    display: flex;
    align-items: center;
    padding: 10px 12px 6px;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &__sidebar-search {
    padding: 4px 8px 2px;

    .access-view__search-field {
      :deep(.v-field) {
        min-height: 32px;
        font-size: 12px;
      }

      :deep(.v-field__input) {
        padding-top: 4px;
        padding-bottom: 4px;
        min-height: 32px;
      }

      :deep(.v-field__prepend-inner) {
        padding-top: 4px;

        .v-icon {
          font-size: 16px;
          opacity: 0.5;
        }
      }

      :deep(.v-field__clearable) {
        padding-top: 4px;

        .v-icon {
          font-size: 16px;
        }
      }
    }
  }

  &__sidebar-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0 8px;
  }

  &__sidebar-item {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    cursor: pointer;
    transition: background-color 0.12s;
    min-height: 36px;
    user-select: none;

    &:hover {
      background-color: rgba(59, 130, 246, 0.06);
    }

    &--active {
      background-color: rgba(59, 130, 246, 0.12) !important;

      .access-view__sidebar-label {
        color: #60a5fa;
        font-weight: 500;
      }
    }
  }

  &__sidebar-label {
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  &__sidebar-type {
    font-size: 10px !important;
    flex-shrink: 0;
  }

  &__sidebar-sub {
    font-size: 11px;
    flex-shrink: 0;
  }

  &__sidebar-empty {
    padding: 16px 12px;
    font-size: 13px;
    color: #6b7280;
    text-align: center;
  }

  &__main {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 16px 20px;
    min-width: 0;
    overflow-y: auto;
    max-height: calc(100vh - 180px);

    @include phone {
      padding: 12px;
      max-height: none;
    }
  }

  &__empty {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;

    @include phone {
      min-height: 200px;
    }
  }
}
</style>
