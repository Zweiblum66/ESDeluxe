<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAccessStore } from '@/stores/access.store';
import { useUsersStore } from '@/stores/users.store';
import { useGroupsStore } from '@/stores/groups.store';
import EffectiveAccessChip from '../components/EffectiveAccessChip.vue';
import AccessSourceLabel from '../components/AccessSourceLabel.vue';
import InlineMultiSelect from '@/components/common/InlineMultiSelect.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import type { InlineMultiSelectItem } from '@/components/common/InlineMultiSelect.vue';

const store = useAccessStore();
const usersStore = useUsersStore();
const groupsStore = useGroupsStore();

const spaceName = computed(() => store.selectedEntity ?? '');

// --- Add Users ---
const showAddUserPanel = ref(false);
const addUserReadonly = ref(false);
const isAddingUsers = ref(false);
const addUserPanelRef = ref<InstanceType<typeof InlineMultiSelect> | null>(null);

function toggleAddUserPanel(): void {
  showAddUserPanel.value = !showAddUserPanel.value;
  if (showAddUserPanel.value) {
    addUserReadonly.value = false;
    if (usersStore.users.length === 0) usersStore.fetchUsers();
    addUserPanelRef.value?.reset();
  }
}

function availableUsers(): InlineMultiSelectItem[] {
  if (!store.spaceDetail) return [];
  const currentUsers = new Set(store.spaceDetail.users.map((u) => u.username));
  return usersStore.users
    .filter((u) => !currentUsers.has(u.username))
    .map((u) => ({ value: u.username, title: u.username }));
}

async function handleAddUsers(usernames: string[]): Promise<void> {
  isAddingUsers.value = true;
  for (const username of usernames) {
    await store.addUserToSpace(spaceName.value, username, addUserReadonly.value);
  }
  isAddingUsers.value = false;
  showAddUserPanel.value = false;
}

// --- Add Groups ---
const showAddGroupPanel = ref(false);
const addGroupReadonly = ref(false);
const isAddingGroups = ref(false);
const addGroupPanelRef = ref<InstanceType<typeof InlineMultiSelect> | null>(null);

function toggleAddGroupPanel(): void {
  showAddGroupPanel.value = !showAddGroupPanel.value;
  if (showAddGroupPanel.value) {
    addGroupReadonly.value = false;
    if (groupsStore.groups.length === 0) groupsStore.fetchGroups();
    addGroupPanelRef.value?.reset();
  }
}

function availableGroups(): InlineMultiSelectItem[] {
  if (!store.spaceDetail) return [];
  const currentGroups = new Set(store.spaceDetail.groups.map((g) => g.groupName));
  return groupsStore.groups
    .filter((g) => !currentGroups.has(g.name))
    .map((g) => ({ value: g.name, title: g.name }));
}

async function handleAddGroups(groupNames: string[]): Promise<void> {
  isAddingGroups.value = true;
  for (const groupName of groupNames) {
    await store.addGroupToSpace(spaceName.value, groupName, addGroupReadonly.value);
  }
  isAddingGroups.value = false;
  showAddGroupPanel.value = false;
}

// --- Toggle Access ---
async function handleToggleUserAccess(username: string, currentAccess: string): Promise<void> {
  const newReadonly = currentAccess !== 'readonly';
  await store.setUserAccess(spaceName.value, username, newReadonly);
}

async function handleToggleGroupAccess(groupName: string, currentAccess: string): Promise<void> {
  const newReadonly = currentAccess !== 'readonly';
  await store.setGroupAccess(spaceName.value, groupName, newReadonly);
}

// --- Remove User ---
const showRemoveUserConfirm = ref(false);
const removeUserTarget = ref('');

function confirmRemoveUser(username: string): void {
  removeUserTarget.value = username;
  showRemoveUserConfirm.value = true;
}

async function handleRemoveUser(): Promise<void> {
  await store.removeUserFromSpace(spaceName.value, removeUserTarget.value);
  showRemoveUserConfirm.value = false;
}

// --- Remove Group ---
const showRemoveGroupConfirm = ref(false);
const removeGroupTarget = ref('');

function confirmRemoveGroup(groupName: string): void {
  removeGroupTarget.value = groupName;
  showRemoveGroupConfirm.value = true;
}

async function handleRemoveGroup(): Promise<void> {
  await store.removeGroupFromSpace(spaceName.value, removeGroupTarget.value);
  showRemoveGroupConfirm.value = false;
}

// --- Reset Override ---
async function handleResetOverride(username: string): Promise<void> {
  await store.resetUserOverride(spaceName.value, username);
}

// Check if user has an override (source shows Direct + Group)
function hasOverride(row: typeof store.spaceAccessRows[number]): boolean {
  return row.source.type === 'multiple' && row.source.hasDirect === true;
}

</script>

<template>
  <div class="space-access-panel">
    <!-- Header -->
    <div class="d-flex align-center mb-4">
      <v-icon class="mr-2">mdi-folder-network</v-icon>
      <span class="text-h6">{{ spaceName }}</span>
      <v-chip v-if="store.spaceDetail" size="small" variant="tonal" label class="ml-2">
        {{ store.spaceDetail.type }}
      </v-chip>
    </div>

    <!-- Section 1: Effective User Access -->
    <div class="d-flex align-center mb-2">
      <div class="text-subtitle-2">
        <v-icon size="small" class="mr-1">mdi-account-multiple</v-icon>
        Effective User Access ({{ store.spaceAccessRows.length }})
      </div>
      <v-spacer />
      <v-btn
        size="small"
        variant="tonal"
        :color="showAddUserPanel ? undefined : 'primary'"
        :prepend-icon="showAddUserPanel ? 'mdi-close' : 'mdi-account-plus'"
        @click="toggleAddUserPanel"
      >
        {{ showAddUserPanel ? 'Cancel' : 'Add User' }}
      </v-btn>
    </div>

    <!-- Add Users Panel -->
    <InlineMultiSelect
      v-if="showAddUserPanel"
      ref="addUserPanelRef"
      :items="availableUsers()"
      :loading="usersStore.isLoading"
      search-placeholder="Filter users..."
      no-data-text="No available users"
      icon="mdi-account"
      :is-adding="isAddingUsers"
      class="mb-4"
      @add="handleAddUsers"
      @cancel="showAddUserPanel = false"
    >
      <template #actions-prepend>
        <v-switch
          v-model="addUserReadonly"
          label="Read-only"
          color="warning"
          density="compact"
          hide-details
          class="mr-4"
        />
      </template>
    </InlineMultiSelect>

    <!-- User Access Table -->
    <v-data-table
      v-if="store.spaceAccessRows.length"
      :headers="[
        { title: 'Username', key: 'username', sortable: true },
        { title: 'Effective', key: 'effectiveAccess', sortable: true },
        { title: 'Source', key: 'source', sortable: true, sort: (a, b) => {
          const getSourcePriority = (source: any) => {
            if (source.type === 'multiple' && source.hasDirect) return 1; // Override (Direct + Group)
            if (source.type === 'direct') return 2; // Direct only
            if (source.type === 'group') return 3; // Group only
            if (source.type === 'multiple') return 4; // Multiple groups
            return 5;
          };
          return getSourcePriority(a) - getSourcePriority(b);
        }},
        { title: 'Direct Access', key: 'directAccess', sortable: true },
        { title: 'Actions', key: 'actions', sortable: false, align: 'end' },
      ]"
      :items="store.spaceAccessRows"
      item-value="username"
      density="compact"
      class="mb-6 access-table"
      :items-per-page="-1"
      hide-default-footer
    >
      <template #item.username="{ item }">
        <v-icon size="small" class="mr-1">mdi-account</v-icon>
        {{ item.username }}
      </template>
      <template #item.effectiveAccess="{ item }">
        <EffectiveAccessChip :effective-access="item.effectiveAccess" />
      </template>
      <template #item.source="{ item }">
        <AccessSourceLabel :source="item.source" />
      </template>
      <template #item.directAccess="{ item }">
        <div class="d-flex align-center gap-1">
          <template v-if="item.directAccess">
            <v-btn
              size="x-small"
              variant="tonal"
              :color="item.directAccess === 'readonly' ? 'warning' : 'success'"
              @click="handleToggleUserAccess(item.username, item.directAccess!)"
            >
              <v-icon size="x-small" class="mr-1">
                {{ item.directAccess === 'readonly' ? 'mdi-eye-outline' : 'mdi-pencil' }}
              </v-icon>
              {{ item.directAccess === 'admin' ? 'readwrite' : item.directAccess }}
            </v-btn>
            <v-tooltip v-if="hasOverride(item)" location="top" text="Reset to group default">
              <template #activator="{ props: tp }">
                <v-btn
                  v-bind="tp"
                  icon="mdi-restore"
                  size="x-small"
                  variant="text"
                  color="grey"
                  @click="handleResetOverride(item.username)"
                />
              </template>
            </v-tooltip>
          </template>
          <span v-else class="text-caption text-medium-emphasis">--</span>
        </div>
      </template>
      <template #item.actions="{ item }">
        <v-btn
          v-if="item.directAccess && item.groupAccesses.length === 0"
          icon="mdi-close"
          size="x-small"
          variant="text"
          color="error"
          title="Remove direct access"
          @click="confirmRemoveUser(item.username)"
        />
        <v-tooltip
          v-else-if="item.directAccess && item.groupAccesses.length > 0"
          location="top"
          text="Cannot remove — user also has access via group"
        >
          <template #activator="{ props: tp }">
            <v-icon v-bind="tp" size="x-small" color="grey">mdi-lock-outline</v-icon>
          </template>
        </v-tooltip>
      </template>
    </v-data-table>
    <div v-else class="text-body-2 text-medium-emphasis mb-6">No user access</div>

    <v-divider class="mb-4" />

    <!-- Section 2: Groups with Access -->
    <div class="d-flex align-center mb-2">
      <div class="text-subtitle-2">
        <v-icon size="small" class="mr-1">mdi-account-group</v-icon>
        Groups ({{ store.spaceDetail?.groups.length ?? 0 }})
      </div>
      <v-spacer />
      <v-btn
        size="small"
        variant="tonal"
        :color="showAddGroupPanel ? undefined : 'primary'"
        :prepend-icon="showAddGroupPanel ? 'mdi-close' : 'mdi-account-group'"
        @click="toggleAddGroupPanel"
      >
        {{ showAddGroupPanel ? 'Cancel' : 'Add Group' }}
      </v-btn>
    </div>

    <!-- Add Groups Panel -->
    <InlineMultiSelect
      v-if="showAddGroupPanel"
      ref="addGroupPanelRef"
      :items="availableGroups()"
      :loading="groupsStore.isLoading"
      search-placeholder="Filter groups..."
      no-data-text="No available groups"
      icon="mdi-account-group"
      :is-adding="isAddingGroups"
      class="mb-4"
      @add="handleAddGroups"
      @cancel="showAddGroupPanel = false"
    >
      <template #actions-prepend>
        <v-switch
          v-model="addGroupReadonly"
          label="Read-only"
          color="warning"
          density="compact"
          hide-details
          class="mr-4"
        />
      </template>
    </InlineMultiSelect>

    <div v-if="store.spaceDetail?.groups.length">
      <v-chip
        v-for="group in store.spaceDetail.groups"
        :key="group.groupName"
        size="small"
        variant="tonal"
        label
        class="mr-2 mb-1"
        :color="group.accessType === 'readwrite' ? 'success' : 'warning'"
      >
        <v-icon start size="small">mdi-account-group</v-icon>
        {{ group.groupName }}
        <v-tooltip location="top" text="Click to toggle access">
          <template #activator="{ props: tooltipProps }">
            <span
              v-bind="tooltipProps"
              class="ml-1 text-caption access-toggle"
              @click.stop="handleToggleGroupAccess(group.groupName, group.accessType)"
            >
              <v-icon size="x-small" class="mr-1">
                {{ group.accessType === 'readonly' ? 'mdi-eye-outline' : 'mdi-pencil' }}
              </v-icon>
              {{ group.accessType }}
            </span>
          </template>
        </v-tooltip>
        <template #append>
          <v-icon
            size="x-small"
            class="ml-1 chip-close-icon"
            @click.stop="confirmRemoveGroup(group.groupName)"
          >mdi-close-circle</v-icon>
        </template>
      </v-chip>
    </div>
    <div v-else class="text-body-2 text-medium-emphasis">No group access</div>

    <!-- Remove User Confirm -->
    <ConfirmDialog
      v-model="showRemoveUserConfirm"
      title="Remove User Access"
      :message="`Remove direct access for user '${removeUserTarget}' from space '${spaceName}'?`"
      confirm-text="Remove"
      confirm-color="error"
      @confirm="handleRemoveUser"
    />

    <!-- Remove Group Confirm -->
    <ConfirmDialog
      v-model="showRemoveGroupConfirm"
      title="Remove Group Access"
      :message="`Remove group '${removeGroupTarget}' from space '${spaceName}'?`"
      confirm-text="Remove"
      confirm-color="error"
      @confirm="handleRemoveGroup"
    />
  </div>
</template>

<style scoped lang="scss">
.space-access-panel {
  padding: 4px;
}

.access-table {
  background: #22252d !important;
  border-radius: 8px;

  :deep(th) {
    color: #9ca3af !important;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
}

.chip-close-icon {
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s;

  &:hover {
    opacity: 1;
  }
}

.access-toggle {
  cursor: pointer;
  border-radius: 3px;
  padding: 0 3px;
  transition: background-color 0.15s;

  &:hover {
    background-color: rgba(255, 255, 255, 0.12);
  }
}
</style>
