<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useUsersStore } from '@/stores/users.store';
import PageHeader from '@/components/common/PageHeader.vue';
import DataTable from '@/components/common/DataTable.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import type { IUser, IUserDetail } from '@shared/types';

const store = useUsersStore();

const columns = [
  { key: 'username', title: 'Username', sortable: true },
  { key: 'identitySource', title: 'Identity Source', sortable: true },
  { key: 'isMaintenance', title: 'Maintenance', sortable: true, width: '140px' },
  { key: 'actions', title: '', width: '120px', sortable: false },
];

// --- Multi-select ---
const selectedUsers = ref<string[]>([]);

// --- Dialogs ---
const showCreateDialog = ref(false);
const showDetailDialog = ref(false);
const showPasswordDialog = ref(false);
const showDeleteConfirm = ref(false);

// --- Create User ---
const newUsername = ref('');
const newPassword = ref('');
const isCreating = ref(false);

async function handleCreate(): Promise<void> {
  if (!newUsername.value || !newPassword.value) return;
  isCreating.value = true;
  const success = await store.createUser(newUsername.value, newPassword.value);
  isCreating.value = false;
  if (success) {
    showCreateDialog.value = false;
    newUsername.value = '';
    newPassword.value = '';
  }
}

// --- User Detail ---
const detailUser = ref<IUserDetail | null>(null);

async function openDetail(item: Record<string, unknown>): Promise<void> {
  const username = item.username as string;
  detailUser.value = await store.fetchUserDetail(username);
  if (detailUser.value) {
    showDetailDialog.value = true;
  }
}

// --- Change Password ---
const passwordUsername = ref('');
const newPasswordValue = ref('');
const isChangingPassword = ref(false);

function openPasswordDialog(username: string): void {
  passwordUsername.value = username;
  newPasswordValue.value = '';
  showPasswordDialog.value = true;
}

async function handlePasswordChange(): Promise<void> {
  if (!newPasswordValue.value) return;
  isChangingPassword.value = true;
  const success = await store.updatePassword(passwordUsername.value, newPasswordValue.value);
  isChangingPassword.value = false;
  if (success) {
    showPasswordDialog.value = false;
  }
}

// --- Delete User ---
const deleteUsername = ref('');

function openDeleteConfirm(username: string): void {
  deleteUsername.value = username;
  showDeleteConfirm.value = true;
}

async function handleDelete(): Promise<void> {
  await store.deleteUser(deleteUsername.value);
  showDeleteConfirm.value = false;
  showDetailDialog.value = false;
}

// --- Bulk Delete ---
const showBulkDeleteConfirm = ref(false);
const isBulkDeleting = ref(false);

async function handleBulkDelete(): Promise<void> {
  isBulkDeleting.value = true;
  for (const username of selectedUsers.value) {
    await store.deleteUser(username);
  }
  isBulkDeleting.value = false;
  showBulkDeleteConfirm.value = false;
  selectedUsers.value = [];
}

// Load users on mount
onMounted(() => {
  store.fetchUsers();
});
</script>

<template>
  <div class="users-list-view">
    <PageHeader title="Users" :item-count="store.users.length">
      <template #actions>
        <v-btn
          color="primary"
          prepend-icon="mdi-plus"
          @click="showCreateDialog = true"
        >
          Create User
        </v-btn>
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

    <DataTable
      :columns="columns"
      :items="(store.users as unknown as Record<string, unknown>[])"
      :loading="store.isLoading"
      item-key="username"
      selectable
      v-model:selected="selectedUsers"
      search-placeholder="Search users..."
      no-data-text="No users found"
      @click:row="openDetail"
    >
      <!-- Bulk actions -->
      <template #bulk-actions="{ count }">
        <v-btn
          size="small"
          variant="tonal"
          color="error"
          prepend-icon="mdi-delete"
          @click="showBulkDeleteConfirm = true"
        >
          Delete {{ count }}
        </v-btn>
      </template>
      <!-- Custom column: maintenance user -->
      <template #item.isMaintenance="{ item }">
        <v-chip
          :color="item.isMaintenance ? 'success' : 'default'"
          size="small"
          variant="tonal"
          label
        >
          {{ item.isMaintenance ? 'Yes' : 'No' }}
        </v-chip>
      </template>

      <!-- Custom column: identity source -->
      <template #item.identitySource="{ item }">
        <v-chip
          size="small"
          variant="tonal"
          label
          :color="item.identitySource === 'LOCAL' ? 'primary' : 'warning'"
        >
          {{ item.identitySource }}
        </v-chip>
      </template>

      <!-- Custom column: actions -->
      <template #item.actions="{ item }">
        <v-btn
          icon="mdi-key"
          size="small"
          variant="text"
          @click.stop="openPasswordDialog(item.username as string)"
          title="Change password"
        />
        <v-btn
          icon="mdi-delete"
          size="small"
          variant="text"
          color="error"
          @click.stop="openDeleteConfirm(item.username as string)"
          title="Delete user"
        />
      </template>
    </DataTable>

    <!-- Create User Dialog -->
    <v-dialog v-model="showCreateDialog" max-width="480" persistent>
      <v-card>
        <v-card-title>Create New User</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newUsername"
            label="Username"
            variant="outlined"
            density="compact"
            class="mb-3"
            autofocus
            :rules="[v => !!v || 'Username is required']"
          />
          <v-text-field
            v-model="newPassword"
            label="Password"
            variant="outlined"
            density="compact"
            type="password"
            :rules="[v => !!v && v.length >= 4 || 'Min 4 characters']"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showCreateDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :loading="isCreating"
            :disabled="!newUsername || !newPassword || newPassword.length < 4"
            @click="handleCreate"
          >
            Create
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- User Detail Dialog -->
    <v-dialog v-model="showDetailDialog" max-width="640">
      <v-card v-if="detailUser">
        <v-card-title class="d-flex align-center">
          <v-icon class="mr-2">mdi-account</v-icon>
          {{ detailUser.username }}
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="showDetailDialog = false" />
        </v-card-title>
        <v-card-text>
          <!-- User Info -->
          <v-list density="compact" class="mb-4">
            <v-list-item>
              <template #prepend><v-icon size="small">mdi-identifier</v-icon></template>
              <v-list-item-title>Identity Source</v-list-item-title>
              <template #append>
                <v-chip size="small" variant="tonal" label>{{ detailUser.identitySource }}</v-chip>
              </template>
            </v-list-item>
            <v-list-item>
              <template #prepend><v-icon size="small">mdi-numeric</v-icon></template>
              <v-list-item-title>UID</v-list-item-title>
              <template #append>{{ detailUser.uid || 'N/A' }}</template>
            </v-list-item>
            <v-list-item>
              <template #prepend><v-icon size="small">mdi-wrench</v-icon></template>
              <v-list-item-title>Maintenance User</v-list-item-title>
              <template #append>
                <v-chip :color="detailUser.isMaintenance ? 'success' : 'default'" size="small" variant="tonal" label>
                  {{ detailUser.isMaintenance ? 'Yes' : 'No' }}
                </v-chip>
              </template>
            </v-list-item>
          </v-list>

          <!-- Media Spaces -->
          <div class="text-subtitle-2 mb-2">
            <v-icon size="small" class="mr-1">mdi-folder-network</v-icon>
            Media Spaces ({{ detailUser.spaces.length }})
          </div>
          <div v-if="detailUser.spaces.length" class="mb-4">
            <v-chip
              v-for="space in detailUser.spaces"
              :key="space.spaceName"
              size="small"
              variant="tonal"
              label
              class="mr-2 mb-1"
              :color="space.accessType === 'readwrite' ? 'success' : space.accessType === 'admin' ? 'primary' : 'warning'"
            >
              {{ space.spaceName }}
              <span class="ml-1 text-caption">({{ space.accessType }})</span>
            </v-chip>
          </div>
          <div v-else class="text-body-2 text-medium-emphasis mb-4">No space access</div>

          <!-- Groups -->
          <div class="text-subtitle-2 mb-2">
            <v-icon size="small" class="mr-1">mdi-account-group</v-icon>
            Groups ({{ detailUser.groups.length }})
          </div>
          <div v-if="detailUser.groups.length">
            <v-chip
              v-for="group in detailUser.groups"
              :key="group"
              size="small"
              variant="tonal"
              label
              class="mr-2 mb-1"
            >
              {{ group }}
            </v-chip>
          </div>
          <div v-else class="text-body-2 text-medium-emphasis">No group memberships</div>
        </v-card-text>
        <v-card-actions>
          <v-btn
            color="error"
            variant="tonal"
            prepend-icon="mdi-delete"
            @click="openDeleteConfirm(detailUser.username)"
          >
            Delete
          </v-btn>
          <v-spacer />
          <v-btn
            variant="tonal"
            prepend-icon="mdi-key"
            @click="openPasswordDialog(detailUser.username)"
          >
            Change Password
          </v-btn>
          <v-btn @click="showDetailDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Change Password Dialog -->
    <v-dialog v-model="showPasswordDialog" max-width="420" persistent>
      <v-card>
        <v-card-title>Change Password</v-card-title>
        <v-card-subtitle>{{ passwordUsername }}</v-card-subtitle>
        <v-card-text>
          <v-text-field
            v-model="newPasswordValue"
            label="New Password"
            variant="outlined"
            density="compact"
            type="password"
            autofocus
            :rules="[v => !!v && v.length >= 4 || 'Min 4 characters']"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showPasswordDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            :loading="isChangingPassword"
            :disabled="!newPasswordValue || newPasswordValue.length < 4"
            @click="handlePasswordChange"
          >
            Change Password
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirm -->
    <ConfirmDialog
      v-model="showDeleteConfirm"
      title="Delete User"
      :message="`Are you sure you want to delete user '${deleteUsername}'? This action cannot be undone.`"
      confirm-text="Delete"
      confirm-color="error"
      @confirm="handleDelete"
    />

    <!-- Bulk Delete Confirm -->
    <ConfirmDialog
      v-model="showBulkDeleteConfirm"
      title="Delete Multiple Users"
      :message="`Are you sure you want to delete ${selectedUsers.length} users? This action cannot be undone.`"
      confirm-text="Delete All"
      confirm-color="error"
      @confirm="handleBulkDelete"
    />
  </div>
</template>

<style scoped lang="scss">
.users-list-view {
  max-width: 1200px;
}
</style>
