<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRolesStore } from '@/stores/roles.store';
import { useSpacesStore } from '@/stores/spaces.store';
import PageHeader from '@/components/common/PageHeader.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import ManagerAssignDialog from './components/ManagerAssignDialog.vue';

const rolesStore = useRolesStore();
const spacesStore = useSpacesStore();

// ── State ──
const selectedSpaceName = ref<string>('');
const spaceSearch = ref('');
const showAssignDialog = ref(false);
const showRemoveConfirm = ref(false);
const removeTarget = ref<{ type: 'user' | 'group'; name: string } | null>(null);

// ── Computed ──
const filteredSpaces = computed(() => {
  let spaces = spacesStore.spaces || [];
  if (spaceSearch.value) {
    const q = spaceSearch.value.toLowerCase();
    spaces = spaces.filter((s) => s.name.toLowerCase().includes(q));
  }
  return spaces;
});

const currentManagers = computed(() => {
  return rolesStore.selectedSpace;
});

const existingUsers = computed(() =>
  currentManagers.value?.users.map((u) => u.username) ?? [],
);

const existingGroups = computed(() =>
  currentManagers.value?.groups.map((g) => g.groupName) ?? [],
);

const managerCount = computed(() => {
  return (spaceName: string) => {
    const assignment = rolesStore.assignments.find((a) => a.spaceName === spaceName);
    if (!assignment) return 0;
    return assignment.users.length + assignment.groups.length;
  };
});

// ── Actions ──
async function selectSpace(spaceName: string): Promise<void> {
  selectedSpaceName.value = spaceName;
  await rolesStore.fetchForSpace(spaceName);
}

async function handleAssign(payload: { type: 'user' | 'group'; name: string }): Promise<void> {
  if (!selectedSpaceName.value) return;
  await rolesStore.assignManager(selectedSpaceName.value, payload.type, payload.name);
  // Refresh the full list to update badges
  await rolesStore.fetchAll();
}

function openRemoveConfirm(type: 'user' | 'group', name: string): void {
  removeTarget.value = { type, name };
  showRemoveConfirm.value = true;
}

async function handleRemove(): Promise<void> {
  if (!selectedSpaceName.value || !removeTarget.value) return;
  await rolesStore.removeManager(
    selectedSpaceName.value,
    removeTarget.value.type,
    removeTarget.value.name,
  );
  showRemoveConfirm.value = false;
  removeTarget.value = null;
  // Refresh the full list to update badges
  await rolesStore.fetchAll();
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ── Lifecycle ──
onMounted(async () => {
  await Promise.all([
    spacesStore.fetchSpaces(),
    rolesStore.fetchAll(),
  ]);
});
</script>

<template>
  <div class="roles-view">
    <PageHeader
      title="Limited Admin"
      subtitle="Delegate space management to users and groups"
      icon="mdi-shield-account"
    />

    <!-- Error banner -->
    <v-alert v-if="rolesStore.error" type="error" variant="tonal" closable class="mx-4 mb-4" @click:close="rolesStore.error = null">
      {{ rolesStore.error }}
    </v-alert>

    <div class="roles-view__content mx-4">
      <v-row>
        <!-- Left panel: Space list -->
        <v-col cols="12" md="4" lg="3">
          <v-card variant="outlined" class="roles-view__sidebar">
            <v-card-title class="text-body-1 font-weight-medium pb-2">
              Spaces
            </v-card-title>
            <div class="px-3 pb-2">
              <v-text-field
                v-model="spaceSearch"
                density="compact"
                variant="outlined"
                placeholder="Search spaces..."
                prepend-inner-icon="mdi-magnify"
                hide-details
                clearable
              />
            </div>
            <v-list density="compact" class="roles-view__space-list">
              <v-list-item
                v-for="space in filteredSpaces"
                :key="space.name"
                :active="selectedSpaceName === space.name"
                @click="selectSpace(space.name)"
              >
                <template #prepend>
                  <v-icon size="20">mdi-folder</v-icon>
                </template>
                <v-list-item-title>{{ space.name }}</v-list-item-title>
                <template #append>
                  <v-badge
                    v-if="managerCount(space.name) > 0"
                    :content="managerCount(space.name)"
                    color="primary"
                    inline
                  />
                </template>
              </v-list-item>
              <v-list-item v-if="filteredSpaces.length === 0">
                <v-list-item-title class="text-medium-emphasis text-center">
                  No spaces found
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>

        <!-- Right panel: Managers for selected space -->
        <v-col cols="12" md="8" lg="9">
          <v-card v-if="!selectedSpaceName" variant="outlined" class="d-flex align-center justify-center" style="min-height: 300px;">
            <div class="text-center text-medium-emphasis">
              <v-icon size="48" class="mb-3 opacity-40">mdi-shield-account</v-icon>
              <div class="text-body-1">Select a space to manage its permissions</div>
              <div class="text-caption mt-1">Space managers can manage users, groups, quotas, goals, and trash for their assigned spaces</div>
            </div>
          </v-card>

          <v-card v-else variant="outlined">
            <v-card-title class="d-flex align-center">
              <v-icon class="mr-2">mdi-folder</v-icon>
              {{ selectedSpaceName }}
              <v-spacer />
              <v-btn
                color="primary"
                size="small"
                variant="tonal"
                prepend-icon="mdi-plus"
                @click="showAssignDialog = true"
              >
                Add Manager
              </v-btn>
            </v-card-title>

            <v-card-text v-if="rolesStore.isLoading" class="text-center py-8">
              <v-progress-circular indeterminate color="primary" />
            </v-card-text>

            <v-card-text v-else>
              <!-- User managers -->
              <div class="mb-6">
                <div class="text-subtitle-2 font-weight-medium mb-2 d-flex align-center ga-2">
                  <v-icon size="18">mdi-account</v-icon>
                  User Managers
                  <v-chip size="x-small" variant="tonal">{{ currentManagers?.users.length ?? 0 }}</v-chip>
                </div>

                <v-table v-if="currentManagers?.users.length" density="compact">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Assigned</th>
                      <th class="text-end" style="width: 60px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="u in currentManagers.users" :key="u.username">
                      <td>
                        <div class="d-flex align-center ga-2">
                          <v-icon size="18" color="primary">mdi-account</v-icon>
                          {{ u.username }}
                        </div>
                      </td>
                      <td class="text-medium-emphasis">{{ formatDate(u.assignedAt) }}</td>
                      <td class="text-end">
                        <v-btn
                          size="x-small"
                          variant="tonal"
                          color="error"
                          icon="mdi-close"
                          @click="openRemoveConfirm('user', u.username)"
                        />
                      </td>
                    </tr>
                  </tbody>
                </v-table>

                <div v-else class="text-medium-emphasis text-body-2 pa-3">
                  No user managers assigned
                </div>
              </div>

              <!-- Group managers -->
              <div>
                <div class="text-subtitle-2 font-weight-medium mb-2 d-flex align-center ga-2">
                  <v-icon size="18">mdi-account-group</v-icon>
                  Group Managers
                  <v-chip size="x-small" variant="tonal">{{ currentManagers?.groups.length ?? 0 }}</v-chip>
                </div>

                <v-table v-if="currentManagers?.groups.length" density="compact">
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th>Members</th>
                      <th>Assigned</th>
                      <th class="text-end" style="width: 60px;"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="g in currentManagers.groups" :key="g.groupName">
                      <td>
                        <div class="d-flex align-center ga-2">
                          <v-icon size="18" color="info">mdi-account-group</v-icon>
                          {{ g.groupName }}
                        </div>
                      </td>
                      <td class="text-medium-emphasis">{{ g.memberCount ?? '—' }}</td>
                      <td class="text-medium-emphasis">{{ formatDate(g.assignedAt) }}</td>
                      <td class="text-end">
                        <v-btn
                          size="x-small"
                          variant="tonal"
                          color="error"
                          icon="mdi-close"
                          @click="openRemoveConfirm('group', g.groupName)"
                        />
                      </td>
                    </tr>
                  </tbody>
                </v-table>

                <div v-else class="text-medium-emphasis text-body-2 pa-3">
                  No group managers assigned
                </div>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </div>

    <!-- Assign Manager Dialog -->
    <ManagerAssignDialog
      v-model="showAssignDialog"
      :space-name="selectedSpaceName"
      :existing-users="existingUsers"
      :existing-groups="existingGroups"
      @assign="handleAssign"
    />

    <!-- Remove Confirm Dialog -->
    <ConfirmDialog
      v-model="showRemoveConfirm"
      title="Remove Manager"
      :message="`Remove ${removeTarget?.type} '${removeTarget?.name}' as manager of '${selectedSpaceName}'?`"
      confirm-text="Remove"
      confirm-color="error"
      @confirm="handleRemove"
    />
  </div>
</template>

<style scoped lang="scss">
.roles-view {
  &__sidebar {
    position: sticky;
    top: 16px;
  }

  &__space-list {
    max-height: calc(100vh - 300px);
    overflow-y: auto;
  }
}
</style>
