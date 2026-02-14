<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRolesStore } from '@/stores/roles.store';
import { useSpacesStore } from '@/stores/spaces.store';
import PageHeader from '@/components/common/PageHeader.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import ManagerAssignDialog from './components/ManagerAssignDialog.vue';
import CapabilitiesDialog from './components/CapabilitiesDialog.vue';
import type { ISpaceManagerCapabilities } from '@shared/types';

const rolesStore = useRolesStore();
const spacesStore = useSpacesStore();

// ── State ──
const selectedSpaceName = ref<string>('');
const spaceSearch = ref('');
const showAssignDialog = ref(false);
const showRemoveConfirm = ref(false);
const removeTarget = ref<{ type: 'user' | 'group'; name: string } | null>(null);

// Capabilities dialog state
const showCapsDialog = ref(false);
const capsTarget = ref<{ username: string; capabilities: ISpaceManagerCapabilities } | null>(null);

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

function openCapsDialog(username: string, capabilities: ISpaceManagerCapabilities): void {
  capsTarget.value = { username, capabilities };
  showCapsDialog.value = true;
}

async function handleCapsSaved(): Promise<void> {
  // Also refresh the full list to update any capability-dependent UI
  await rolesStore.fetchAll();
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatCapsSummary(caps: ISpaceManagerCapabilities): string {
  const parts: string[] = [];
  parts.push(caps.canManageUsers ? 'Users' : '');
  parts.push(caps.canManageGroups ? 'Groups' : '');
  if (caps.canManageQuota) {
    if (caps.maxQuotaBytes != null) {
      const gb = caps.maxQuotaBytes / (1024 * 1024 * 1024);
      const label = gb >= 1024 ? `${Math.round(gb / 1024)} TB` : `${Math.round(gb)} GB`;
      parts.push(`Quota (max ${label})`);
    } else {
      parts.push('Quota');
    }
  }
  const active = parts.filter(Boolean);
  if (active.length === 0) return 'No capabilities';
  return active.join(', ');
}

function allCapsEnabled(caps: ISpaceManagerCapabilities): boolean {
  return caps.canManageUsers && caps.canManageGroups && caps.canManageQuota && caps.maxQuotaBytes == null;
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

    <div class="roles-view__content">
      <!-- Left panel: Space list -->
      <div class="roles-view__sidebar">
        <div class="roles-view__sidebar-header">Spaces</div>
        <div class="roles-view__sidebar-search">
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
        <div class="roles-view__space-list">
          <div
            v-for="space in filteredSpaces"
            :key="space.name"
            class="roles-view__space-item"
            :class="{ 'roles-view__space-item--active': selectedSpaceName === space.name }"
            @click="selectSpace(space.name)"
          >
            <v-icon size="18" class="mr-2">mdi-folder</v-icon>
            <span class="roles-view__space-name">{{ space.name }}</span>
            <v-badge
              v-if="managerCount(space.name) > 0"
              :content="managerCount(space.name)"
              color="primary"
              inline
            />
          </div>
          <div v-if="filteredSpaces.length === 0" class="roles-view__space-empty">
            No spaces found
          </div>
        </div>
      </div>

      <!-- Right panel: Managers for selected space -->
      <div class="roles-view__main">
        <!-- Empty state -->
        <div v-if="!selectedSpaceName" class="roles-view__empty">
          <v-icon size="48" class="mb-3 opacity-40">mdi-shield-account</v-icon>
          <div class="text-body-1">Select a space to manage its permissions</div>
          <div class="text-caption mt-1 text-medium-emphasis">Space managers can manage users, groups, quotas, goals, and trash for their assigned spaces</div>
        </div>

        <template v-else>
          <!-- Header -->
          <div class="roles-view__main-header">
            <v-icon class="mr-2" size="20">mdi-folder</v-icon>
            <span class="font-weight-medium">{{ selectedSpaceName }}</span>
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
          </div>

          <!-- Loading -->
          <div v-if="rolesStore.isLoading" class="text-center py-8">
            <v-progress-circular indeterminate color="primary" />
          </div>

          <div v-else class="roles-view__tables">
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
                    <th>Capabilities</th>
                    <th>Assigned</th>
                    <th class="text-end" style="width: 90px;"></th>
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
                    <td>
                      <div class="d-flex align-center ga-1 flex-wrap">
                        <v-chip v-if="allCapsEnabled(u.capabilities)" size="x-small" variant="tonal" color="success">
                          Full Access
                        </v-chip>
                        <template v-else>
                          <v-chip size="x-small" variant="tonal" :color="u.capabilities.canManageUsers ? 'success' : 'default'">
                            <v-icon start size="12">{{ u.capabilities.canManageUsers ? 'mdi-check' : 'mdi-close' }}</v-icon>
                            Users
                          </v-chip>
                          <v-chip size="x-small" variant="tonal" :color="u.capabilities.canManageGroups ? 'success' : 'default'">
                            <v-icon start size="12">{{ u.capabilities.canManageGroups ? 'mdi-check' : 'mdi-close' }}</v-icon>
                            Groups
                          </v-chip>
                          <v-chip size="x-small" variant="tonal" :color="u.capabilities.canManageQuota ? 'success' : 'default'">
                            <v-icon start size="12">{{ u.capabilities.canManageQuota ? 'mdi-check' : 'mdi-close' }}</v-icon>
                            Quota
                          </v-chip>
                          <v-chip v-if="u.capabilities.canManageQuota && u.capabilities.maxQuotaBytes" size="x-small" variant="outlined" color="warning">
                            max {{ u.capabilities.maxQuotaBytes >= 1024 * 1024 * 1024 * 1024 ? Math.round(u.capabilities.maxQuotaBytes / (1024 * 1024 * 1024 * 1024)) + ' TB' : Math.round(u.capabilities.maxQuotaBytes / (1024 * 1024 * 1024)) + ' GB' }}
                          </v-chip>
                        </template>
                      </div>
                    </td>
                    <td class="text-medium-emphasis">{{ formatDate(u.assignedAt) }}</td>
                    <td class="text-end">
                      <div class="d-flex ga-1 justify-end">
                        <v-btn
                          size="x-small"
                          variant="tonal"
                          color="primary"
                          icon="mdi-shield-lock-outline"
                          @click="openCapsDialog(u.username, u.capabilities)"
                        />
                        <v-btn
                          size="x-small"
                          variant="tonal"
                          color="error"
                          icon="mdi-close"
                          @click="openRemoveConfirm('user', u.username)"
                        />
                      </div>
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
          </div>
        </template>
      </div>
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

    <!-- Capabilities Dialog -->
    <CapabilitiesDialog
      v-if="capsTarget"
      v-model="showCapsDialog"
      :space-name="selectedSpaceName"
      :username="capsTarget.username"
      :capabilities="capsTarget.capabilities"
      @saved="handleCapsSaved"
    />
  </div>
</template>

<style scoped lang="scss">
.roles-view {
  &__content {
    display: flex;
    background-color: #22252d;
    border: 1px solid rgba(55, 65, 81, 0.3);
    border-radius: 8px;
    overflow: hidden;
    min-height: calc(100vh - 160px);
  }

  // ── Left sidebar ──
  &__sidebar {
    width: 280px;
    flex-shrink: 0;
    border-right: 1px solid rgba(55, 65, 81, 0.3);
    display: flex;
    flex-direction: column;
  }

  &__sidebar-header {
    padding: 14px 16px 8px;
    font-size: 14px;
    font-weight: 600;
    color: #e5e7eb;
  }

  &__sidebar-search {
    padding: 0 12px 8px;
  }

  &__space-list {
    flex: 1;
    overflow-y: auto;
  }

  &__space-item {
    display: flex;
    align-items: center;
    padding: 8px 16px;
    font-size: 13px;
    color: #9ca3af;
    cursor: pointer;
    transition: all 150ms ease;

    &:hover {
      color: #e5e7eb;
      background-color: rgba(59, 130, 246, 0.06);
    }

    &--active {
      color: #e5e7eb;
      background-color: rgba(59, 130, 246, 0.12);
    }
  }

  &__space-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__space-empty {
    padding: 16px;
    text-align: center;
    color: #6b7280;
    font-size: 13px;
  }

  // ── Right main panel ──
  &__main {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    max-height: calc(100vh - 160px);
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    text-align: center;
    color: #6b7280;
  }

  &__main-header {
    display: flex;
    align-items: center;
    padding: 12px 20px;
    border-bottom: 1px solid rgba(55, 65, 81, 0.3);
    color: #e5e7eb;
    font-size: 15px;
  }

  &__tables {
    padding: 16px 20px;
  }
}

// Responsive: stack on small screens
@media (max-width: 960px) {
  .roles-view {
    &__content {
      flex-direction: column;
      min-height: auto;
    }

    &__sidebar {
      width: 100%;
      border-right: none;
      border-bottom: 1px solid rgba(55, 65, 81, 0.3);
    }

    &__space-list {
      max-height: 200px;
    }

    &__main {
      max-height: none;
    }
  }
}
</style>
