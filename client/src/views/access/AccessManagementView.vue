<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useAccessStore } from '@/stores/access.store';
import { useSpacesStore } from '@/stores/spaces.store';
import { useUsersStore } from '@/stores/users.store';
import { useGroupsStore } from '@/stores/groups.store';
import PageHeader from '@/components/common/PageHeader.vue';
import SpaceAccessPanel from './panels/SpaceAccessPanel.vue';
import UserAccessPanel from './panels/UserAccessPanel.vue';
import GroupAccessPanel from './panels/GroupAccessPanel.vue';

const store = useAccessStore();
const spacesStore = useSpacesStore();
const usersStore = useUsersStore();
const groupsStore = useGroupsStore();

const leftSearch = ref('');

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
  if (!leftSearch.value) return leftPanelItems.value;
  const q = leftSearch.value.toLowerCase();
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
</script>

<template>
  <div class="access-management-view">
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

    <v-row no-gutters class="access-management-view__content">
      <!-- Left Panel: Entity selector -->
      <v-col cols="3" class="access-management-view__left">
        <v-card variant="outlined" class="access-management-view__left-card">
          <div class="pa-3 pb-0">
            <v-text-field
              v-model="leftSearch"
              :placeholder="`Search ${perspectiveLabel}s...`"
              prepend-inner-icon="mdi-magnify"
              variant="outlined"
              density="compact"
              hide-details
              clearable
              single-line
            />
          </div>
          <v-list
            density="compact"
            class="access-management-view__list"
            nav
          >
            <v-list-item
              v-for="item in filteredItems"
              :key="item.key"
              :active="store.selectedEntity === item.key"
              :value="item.key"
              @click="handleSelect(item.key)"
              color="primary"
            >
              <template #prepend>
                <v-icon size="small">{{ item.icon }}</v-icon>
              </template>
              <v-list-item-title class="text-body-2">{{ item.label }}</v-list-item-title>
              <v-list-item-subtitle class="text-caption">{{ item.subtitle }}</v-list-item-subtitle>
            </v-list-item>
            <v-list-item v-if="filteredItems.length === 0" disabled>
              <v-list-item-title class="text-body-2 text-medium-emphasis">
                No {{ perspectiveLabel }}s found
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>

      <!-- Right Panel: Access details -->
      <v-col cols="9" class="access-management-view__right">
        <!-- Loading -->
        <div v-if="store.isLoading" class="access-management-view__empty">
          <v-progress-circular indeterminate color="primary" size="32" />
          <div class="text-body-2 text-medium-emphasis mt-3">Loading access data...</div>
        </div>

        <!-- Empty state -->
        <div v-else-if="!store.selectedEntity" class="access-management-view__empty">
          <v-icon size="48" color="grey-darken-1">mdi-shield-key-outline</v-icon>
          <div class="text-body-1 text-medium-emphasis mt-3">
            Select a {{ perspectiveLabel }} from the left to view access details
          </div>
        </div>

        <!-- Perspective panels -->
        <SpaceAccessPanel v-else-if="store.perspective === 'space'" />
        <UserAccessPanel v-else-if="store.perspective === 'user'" />
        <GroupAccessPanel v-else-if="store.perspective === 'group'" />
      </v-col>
    </v-row>
  </div>
</template>

<style scoped lang="scss">
.access-management-view {
  max-width: 1600px;

  &__content {
    flex-wrap: nowrap !important;
  }

  &__left-card {
    height: calc(100vh - 180px);
    display: flex;
    flex-direction: column;
    background: #22252d !important;
  }

  &__list {
    flex: 1;
    overflow-y: auto;
    background: transparent !important;
  }

  &__right {
    padding-left: 16px;
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    text-align: center;
  }
}
</style>
