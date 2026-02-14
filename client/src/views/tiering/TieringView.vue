<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue';
import { useTieringStore } from '@/stores/tiering.store';
import { useSpacesStore } from '@/stores/spaces.store';
import PageHeader from '@/components/common/PageHeader.vue';
import DataTable from '@/components/common/DataTable.vue';
import ConfirmDialog from '@/components/common/ConfirmDialog.vue';
import SchedulerStatusCard from './components/SchedulerStatusCard.vue';
import TieringProgressCard from './components/TieringProgressCard.vue';
import TieringRuleDialog from './components/TieringRuleDialog.vue';
import TieringLogsPanel from './components/TieringLogsPanel.vue';
import { useResponsive } from '@/composables/useResponsive';
import type { ITieringRule, ICreateTieringRuleRequest, ISpaceSelector } from '@shared/types';

const store = useTieringStore();
const responsive = useResponsive();
const spacesStore = useSpacesStore();

// --- Filter ---
const spaceFilter = ref<string>('');

const filteredRules = computed(() => {
  if (!spaceFilter.value) return store.rules;
  const filterName = spaceFilter.value;
  return store.rules.filter((r) => {
    const sel = r.spaceSelector;
    if (!sel) return r.spaceName === filterName;
    switch (sel.mode) {
      case 'explicit': return sel.spaceNames.includes(filterName);
      case 'by_type': {
        const space = spacesStore.spaces.find((s) => s.name === filterName);
        return space ? sel.spaceTypes.includes(space.type as any) : false;
      }
      case 'pattern': {
        try { return new RegExp(sel.namePattern).test(filterName); } catch { return false; }
      }
      case 'all': return true;
      default: return false;
    }
  });
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
  { key: 'spaceSelector', title: 'Spaces', sortable: false, width: '180px' },
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

function timeUnitSuffix(operator: string): string {
  switch (operator) {
    case 'older_than_hours': return 'h';
    case 'older_than_days': return 'd';
    case 'older_than_weeks': return 'w';
    case 'older_than_months': return 'mo';
    default: return 'd';
  }
}

function conditionLabel(rule: ITieringRule): string {
  const unit = timeUnitSuffix(rule.operator);
  switch (rule.condition) {
    case 'last_access': return `Access > ${rule.value}${unit}`;
    case 'last_modified': return `Modified > ${rule.value}${unit}`;
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

function spaceSelectorLabel(sel?: ISpaceSelector): string {
  if (!sel) return '—';
  switch (sel.mode) {
    case 'explicit':
      if (sel.spaceNames.length === 1) return sel.spaceNames[0];
      return `${sel.spaceNames.length} spaces`;
    case 'by_type':
      return sel.spaceTypes.join(', ');
    case 'pattern':
      return `/${sel.namePattern}/`;
    case 'all':
      return 'All spaces';
    default:
      return '—';
  }
}

const SPACE_TYPE_LABELS: Record<string, string> = {
  avidstyle: 'Avid Style',
  avidmxf: 'Avid MXF',
  managed: 'Managed',
  unmanaged: 'Unmanaged',
  acl: 'ACL',
};

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
  store.startProgressPolling();
});

onUnmounted(() => {
  store.stopProgressPolling();
});

// Auto-refresh when a rule finishes (progress goes from non-null to null)
watch(() => store.progress, (newVal, oldVal) => {
  if (oldVal && !newVal) {
    store.fetchRecentLogs();
    store.fetchRules();
    store.fetchSchedulerStatus();
  }
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

    <!-- Live Progress (shown while a rule is executing) -->
    <TieringProgressCard v-if="store.progress" :progress="store.progress" />

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
      <template #item.spaceSelector="{ item }">
        <template v-if="(item as any).spaceSelector?.mode === 'explicit'">
          <span v-if="(item as any).spaceSelector.spaceNames.length === 1" class="text-caption">
            {{ (item as any).spaceSelector.spaceNames[0] }}
          </span>
          <v-chip v-else size="x-small" variant="tonal" color="primary" label>
            <v-icon start size="12">mdi-format-list-bulleted</v-icon>
            {{ (item as any).spaceSelector.spaceNames.length }} spaces
          </v-chip>
        </template>
        <v-chip v-else-if="(item as any).spaceSelector?.mode === 'by_type'" size="x-small" variant="tonal" color="blue" label>
          <v-icon start size="12">mdi-shape</v-icon>
          {{ (item as any).spaceSelector.spaceTypes.map((t: string) => SPACE_TYPE_LABELS[t] || t).join(', ') }}
        </v-chip>
        <v-chip v-else-if="(item as any).spaceSelector?.mode === 'pattern'" size="x-small" variant="tonal" color="teal" label>
          <v-icon start size="12">mdi-regex</v-icon>
          /{{ (item as any).spaceSelector.namePattern }}/
        </v-chip>
        <v-chip v-else-if="(item as any).spaceSelector?.mode === 'all'" size="x-small" variant="tonal" color="teal" label>
          <v-icon start size="12">mdi-select-all</v-icon>
          All spaces
        </v-chip>
        <span v-else class="text-caption">{{ (item as any).spaceName || '—' }}</span>
      </template>

      <template #item.condition="{ item }">
        <span class="text-caption">
          {{ conditionLabel(item as unknown as ITieringRule) }}
        </span>
      </template>

      <template #item.sourceGoal="{ item }">
        <template v-if="(item as any).targetType === 'archive'">
          <span class="text-caption text-medium-emphasis">—</span>
        </template>
        <v-chip v-else size="x-small" variant="tonal" label>{{ (item as any).sourceGoal }}</v-chip>
      </template>

      <template #item.targetGoal="{ item }">
        <template v-if="(item as any).targetType === 'archive'">
          <v-chip size="x-small" variant="tonal" color="deep-purple" label>
            <v-icon start size="12">mdi-archive</v-icon>
            {{ (item as any).archiveLocationName || 'Archive' }}
          </v-chip>
        </template>
        <v-chip v-else size="x-small" variant="tonal" color="info" label>{{ (item as any).targetGoal }}</v-chip>
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
        <span v-if="(item as any).lastRunErrors" class="text-error ml-1" style="font-size: 12px;">
          ({{ (item as any).lastRunErrors }} failed)
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
              <v-list-item-title>Spaces</v-list-item-title>
              <template #append>
                <template v-if="store.selectedRule.spaceSelector?.mode === 'explicit'">
                  <v-chip
                    v-for="name in store.selectedRule.spaceSelector.spaceNames"
                    :key="name"
                    size="small"
                    variant="tonal"
                    label
                    class="ml-1"
                  >{{ name }}</v-chip>
                </template>
                <v-chip v-else-if="store.selectedRule.spaceSelector?.mode === 'by_type'" size="small" variant="tonal" color="blue" label>
                  <v-icon start size="14">mdi-shape</v-icon>
                  {{ (store.selectedRule.spaceSelector as any).spaceTypes.map((t: string) => SPACE_TYPE_LABELS[t] || t).join(', ') }}
                </v-chip>
                <v-chip v-else-if="store.selectedRule.spaceSelector?.mode === 'pattern'" size="small" variant="tonal" color="teal" label>
                  <v-icon start size="14">mdi-regex</v-icon>
                  /{{ (store.selectedRule.spaceSelector as any).namePattern }}/
                </v-chip>
                <v-chip v-else-if="store.selectedRule.spaceSelector?.mode === 'all'" size="small" variant="tonal" color="teal" label>
                  <v-icon start size="14">mdi-select-all</v-icon>
                  All spaces
                </v-chip>
                <span v-else>{{ store.selectedRule.spaceName || '—' }}</span>
              </template>
            </v-list-item>
            <v-list-item v-if="store.selectedRule.description">
              <v-list-item-title>Description</v-list-item-title>
              <template #append>{{ store.selectedRule.description }}</template>
            </v-list-item>
            <v-list-item v-if="store.selectedRule.targetType === 'archive'">
              <v-list-item-title>Target</v-list-item-title>
              <template #append>
                <v-chip size="small" variant="tonal" color="deep-purple" label>
                  <v-icon start size="14">mdi-archive</v-icon>
                  {{ store.selectedRule.archiveLocationName || 'Archive' }}
                </v-chip>
              </template>
            </v-list-item>
            <template v-else>
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
            </template>
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
