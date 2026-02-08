<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useTieringStore } from '@/stores/tiering.store';
import { useSpacesStore } from '@/stores/spaces.store';
import PageHeader from '@/components/common/PageHeader.vue';
import DataTable from '@/components/common/DataTable.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import SchedulerStatusCard from './components/SchedulerStatusCard.vue';
import TieringRuleDialog from './components/TieringRuleDialog.vue';
import TieringLogsPanel from './components/TieringLogsPanel.vue';
import { useResponsive } from '@/composables/useResponsive';
import type { ITieringRule, ICreateTieringRuleRequest } from '@shared/types';

const store = useTieringStore();
const responsive = useResponsive();
const spacesStore = useSpacesStore();

// --- Filter ---
const spaceFilter = ref<string>('');

const filteredRules = computed(() => {
  if (!spaceFilter.value) return store.rules;
  return store.rules.filter((r) => r.spaceName === spaceFilter.value);
});

// --- Dialogs ---
const showCreateDialog = ref(false);
const showDetailDialog = ref(false);
const showDeleteConfirm = ref(false);
const editRule = ref<ITieringRule | null>(null);
const deleteTarget = ref<ITieringRule | null>(null);

// --- Saving state ---
const isSaving = ref(false);
const isTriggering = ref(false);

// --- Table columns ---
const columns = [
  { key: 'name', title: 'Name', sortable: true },
  { key: 'spaceName', title: 'Space', sortable: true, width: '140px' },
  { key: 'condition', title: 'Condition', sortable: true, width: '160px' },
  { key: 'sourceGoal', title: 'From', sortable: true, width: '140px' },
  { key: 'targetGoal', title: 'To', sortable: true, width: '140px' },
  { key: 'status', title: 'Status', sortable: true, width: '100px' },
  { key: 'lastRunAt', title: 'Last Run', sortable: true, width: '150px' },
  { key: 'actions', title: '', width: '120px', sortable: false },
];

// --- Formatting ---
function formatDate(ts?: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function conditionLabel(rule: ITieringRule): string {
  switch (rule.condition) {
    case 'last_access': return `Access > ${rule.value}d`;
    case 'last_modified': return `Modified > ${rule.value}d`;
    case 'file_size': return `Size > ${rule.value}B`;
    case 'file_extension': return `Ext ${rule.operator === 'matches' ? '=' : '!='} ${rule.value}`;
    default: return rule.condition;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'active': return 'success';
    case 'paused': return 'warning';
    case 'error': return 'error';
    default: return 'grey';
  }
}

// --- CRUD ---
function openCreate(): void {
  editRule.value = null;
  showCreateDialog.value = true;
}

function openEdit(rule: ITieringRule): void {
  editRule.value = rule;
  showCreateDialog.value = true;
}

async function handleSave(request: ICreateTieringRuleRequest): Promise<void> {
  isSaving.value = true;
  let success: boolean;

  if (editRule.value) {
    success = await store.updateRule(editRule.value.id, request);
  } else {
    success = await store.createRule(request);
  }

  isSaving.value = false;
  if (success) {
    showCreateDialog.value = false;
  }
}

function confirmDelete(rule: ITieringRule): void {
  deleteTarget.value = rule;
  showDeleteConfirm.value = true;
}

async function handleDelete(): Promise<void> {
  if (!deleteTarget.value) return;
  await store.deleteRule(deleteTarget.value.id);
  showDeleteConfirm.value = false;
  showDetailDialog.value = false;
}

async function handleToggleStatus(rule: ITieringRule): Promise<void> {
  const newStatus = rule.status === 'active' ? 'paused' : 'active';
  await store.updateRule(rule.id, { status: newStatus });
}

async function handleTrigger(rule: ITieringRule): Promise<void> {
  isTriggering.value = true;
  await store.triggerRule(rule.id);
  isTriggering.value = false;
  // Refresh logs
  await store.fetchRuleLogs(rule.id);
}

// --- Detail dialog ---
async function openDetail(item: Record<string, unknown>): Promise<void> {
  const rule = item as unknown as ITieringRule;
  store.selectedRule = rule;
  await store.fetchRuleLogs(rule.id);
  showDetailDialog.value = true;
}

// --- Spaces for dropdown ---
const spaceItems = computed(() => {
  return spacesStore.spaces.map((s) => ({ name: s.name, type: s.type }));
});

// --- Init ---
onMounted(async () => {
  await Promise.all([
    store.fetchRules(),
    store.fetchSchedulerStatus(),
    store.fetchRecentLogs(),
    spacesStore.fetchSpaces(),
  ]);
});
</script>

<template>
  <div class="tiering-view">
    <PageHeader title="Automated Tiering" :item-count="filteredRules.length">
      <template #actions>
        <v-select
          v-model="spaceFilter"
          :items="[{ title: 'All Spaces', value: '' }, ...spaceItems.map(s => ({ title: s.name, value: s.name }))]"
          item-title="title"
          item-value="value"
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 200px"
          class="mr-2"
        />
        <v-btn
          color="primary"
          prepend-icon="mdi-plus"
          @click="openCreate"
        >
          Create Rule
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

    <!-- Scheduler Status -->
    <SchedulerStatusCard :status="store.schedulerStatus" />

    <!-- Rules Table -->
    <DataTable
      :columns="columns"
      :items="(filteredRules as unknown as Record<string, unknown>[])"
      :loading="store.isLoading"
      item-key="id"
      search-placeholder="Search rules..."
      no-data-text="No tiering rules configured"
      @click:row="openDetail"
    >
      <template #item.condition="{ item }">
        <span class="text-caption">
          {{ conditionLabel(item as unknown as ITieringRule) }}
        </span>
      </template>

      <template #item.sourceGoal="{ item }">
        <v-chip size="x-small" variant="tonal" label>{{ (item as any).sourceGoal }}</v-chip>
      </template>

      <template #item.targetGoal="{ item }">
        <v-chip size="x-small" variant="tonal" color="info" label>{{ (item as any).targetGoal }}</v-chip>
      </template>

      <template #item.status="{ item }">
        <v-chip
          :color="statusColor((item as any).status)"
          size="x-small"
          variant="tonal"
          label
        >
          {{ (item as any).status }}
        </v-chip>
      </template>

      <template #item.lastRunAt="{ item }">
        <span class="text-caption text-medium-emphasis">
          {{ formatDate((item as any).lastRunAt) }}
        </span>
      </template>

      <template #item.actions="{ item }">
        <v-btn
          :icon="(item as any).status === 'active' ? 'mdi-pause' : 'mdi-play'"
          size="small"
          variant="text"
          @click.stop="handleToggleStatus(item as unknown as ITieringRule)"
          :title="(item as any).status === 'active' ? 'Pause' : 'Resume'"
        />
        <v-btn
          icon="mdi-delete"
          size="small"
          variant="text"
          color="error"
          @click.stop="confirmDelete(item as unknown as ITieringRule)"
          title="Delete"
        />
      </template>
    </DataTable>

    <!-- Recent Logs -->
    <div v-if="store.recentLogs.length > 0" class="mt-6">
      <TieringLogsPanel :logs="store.recentLogs" title="Recent Executions" />
    </div>

    <!-- Create/Edit Rule Dialog -->
    <TieringRuleDialog
      v-model="showCreateDialog"
      :rule="editRule"
      :spaces="spaceItems"
      :is-saving="isSaving"
      @save="handleSave"
    />

    <!-- Rule Detail Dialog -->
    <v-dialog v-model="showDetailDialog" max-width="700" scrollable :fullscreen="responsive.dialogFullscreen.value">
      <v-card v-if="store.selectedRule">
        <v-card-title class="d-flex align-center">
          <v-icon class="mr-2">mdi-swap-vertical-bold</v-icon>
          {{ store.selectedRule.name }}
          <v-chip
            :color="statusColor(store.selectedRule.status)"
            size="small"
            variant="tonal"
            label
            class="ml-2"
          >
            {{ store.selectedRule.status }}
          </v-chip>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="showDetailDialog = false" />
        </v-card-title>

        <v-card-text>
          <v-list density="compact" class="mb-4">
            <v-list-item>
              <v-list-item-title>Space</v-list-item-title>
              <template #append>{{ store.selectedRule.spaceName }}</template>
            </v-list-item>
            <v-list-item v-if="store.selectedRule.description">
              <v-list-item-title>Description</v-list-item-title>
              <template #append>{{ store.selectedRule.description }}</template>
            </v-list-item>
            <v-list-item>
              <v-list-item-title>Source Goal</v-list-item-title>
              <template #append>
                <v-chip size="small" variant="tonal" label>{{ store.selectedRule.sourceGoal }}</v-chip>
              </template>
            </v-list-item>
            <v-list-item>
              <v-list-item-title>Target Goal</v-list-item-title>
              <template #append>
                <v-chip size="small" variant="tonal" color="info" label>{{ store.selectedRule.targetGoal }}</v-chip>
              </template>
            </v-list-item>
            <v-list-item>
              <v-list-item-title>Condition</v-list-item-title>
              <template #append>{{ conditionLabel(store.selectedRule) }}</template>
            </v-list-item>
            <v-list-item v-if="store.selectedRule.pathPattern">
              <v-list-item-title>Path Pattern</v-list-item-title>
              <template #append>{{ store.selectedRule.pathPattern }}</template>
            </v-list-item>
            <v-list-item>
              <v-list-item-title>Last Run</v-list-item-title>
              <template #append>
                {{ formatDate(store.selectedRule.lastRunAt) }}
                <span v-if="store.selectedRule.lastRunFiles !== undefined" class="ml-2 text-caption">
                  ({{ store.selectedRule.lastRunFiles }} files)
                </span>
              </template>
            </v-list-item>
          </v-list>

          <!-- Rule execution logs -->
          <TieringLogsPanel :logs="store.ruleLogs" title="Execution History" />
        </v-card-text>

        <v-card-actions>
          <v-btn
            color="primary"
            variant="tonal"
            prepend-icon="mdi-play"
            :loading="isTriggering"
            @click="handleTrigger(store.selectedRule!)"
          >
            Run Now
          </v-btn>
          <v-btn
            variant="tonal"
            prepend-icon="mdi-pencil"
            @click="openEdit(store.selectedRule!); showDetailDialog = false"
          >
            Edit
          </v-btn>
          <v-btn
            color="error"
            variant="tonal"
            prepend-icon="mdi-delete"
            @click="confirmDelete(store.selectedRule!)"
          >
            Delete
          </v-btn>
          <v-spacer />
          <v-btn @click="showDetailDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirm -->
    <ConfirmDialog
      v-model="showDeleteConfirm"
      title="Delete Tiering Rule"
      :message="`Are you sure you want to delete rule '${deleteTarget?.name}'? This will also remove all execution logs.`"
      confirm-text="Delete"
      confirm-color="error"
      @confirm="handleDelete"
    />
  </div>
</template>

<style scoped lang="scss">
.tiering-view {
  max-width: 1400px;

  @include phone {
    max-width: 100%;

    // Hide Condition, Source Goal, Target Goal, Last Run, Actions on phone
    // With select checkbox: 1=checkbox, 2=name, 3=space, 4=condition, 5=sourceGoal, 6=targetGoal, 7=status, 8=lastRun, 9=actions
    :deep(thead th:nth-child(4)),
    :deep(.v-data-table__tr td:nth-child(4)),
    :deep(thead th:nth-child(5)),
    :deep(.v-data-table__tr td:nth-child(5)),
    :deep(thead th:nth-child(6)),
    :deep(.v-data-table__tr td:nth-child(6)),
    :deep(thead th:nth-child(8)),
    :deep(.v-data-table__tr td:nth-child(8)),
    :deep(thead th:nth-child(9)),
    :deep(.v-data-table__tr td:nth-child(9)) {
      display: none;
    }
  }
}
</style>
