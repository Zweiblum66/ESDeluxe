<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue';
import { useArchiveStore } from '@/stores/archive.store';
import { useGoalsStore } from '@/stores/goals.store';
import type {
  ITieringRule,
  ICreateTieringRuleRequest,
  TieringCondition,
  TieringOperator,
  TieringTargetType,
  SpaceSelectorMode,
  ISpaceSelector,
} from '@shared/types';

interface Props {
  modelValue: boolean;
  rule?: ITieringRule | null;
  spaces: { name: string; type: string }[];
  isSaving?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  rule: null,
  isSaving: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [request: ICreateTieringRuleRequest];
}>();

const archiveStore = useArchiveStore();
const goalsStore = useGoalsStore();
const isEdit = computed(() => !!props.rule);

const form = ref<{
  selectorMode: SpaceSelectorMode;
  selectedSpaceNames: string[];
  selectedSpaceTypes: string[];
  namePattern: string;
  name: string;
  description: string;
  targetType: TieringTargetType;
  sourceGoal: string;
  targetGoal: string;
  archiveLocationId: number | null;
  condition: TieringCondition;
  operator: TieringOperator;
  value: string;
  recursive: boolean;
  pathPattern: string;
}>({
  selectorMode: 'explicit',
  selectedSpaceNames: [],
  selectedSpaceTypes: [],
  namePattern: '',
  name: '',
  description: '',
  targetType: 'goal_change',
  sourceGoal: '',
  targetGoal: '',
  archiveLocationId: null,
  condition: 'last_access',
  operator: 'older_than_days',
  value: '',
  recursive: true,
  pathPattern: '',
});

const enabledLocations = computed(() =>
  archiveStore.locations.filter((l) => l.enabled),
);

const goalItems = computed(() =>
  goalsStore.goals.map((g) => ({ title: g.name, value: g.name })),
);

onMounted(() => {
  if (archiveStore.locations.length === 0) {
    archiveStore.fetchLocations();
  }
  if (goalsStore.goals.length === 0) {
    goalsStore.fetchGoals();
  }
});

const spaceTypeItems = [
  { title: 'Avid Style', value: 'avidstyle' },
  { title: 'Avid MXF', value: 'avidmxf' },
  { title: 'Managed', value: 'managed' },
  { title: 'Unmanaged', value: 'unmanaged' },
  { title: 'ACL', value: 'acl' },
];

const conditions = [
  { title: 'Last Access Time', value: 'last_access' },
  { title: 'Last Modified Time', value: 'last_modified' },
  { title: 'File Size', value: 'file_size' },
  { title: 'File Extension', value: 'file_extension' },
];

const timeOperators = [
  { title: 'Older than (hours)', value: 'older_than_hours' },
  { title: 'Older than (days)', value: 'older_than_days' },
  { title: 'Older than (weeks)', value: 'older_than_weeks' },
  { title: 'Older than (months)', value: 'older_than_months' },
];

const operatorsByCondition: Record<string, { title: string; value: string }[]> = {
  last_access: timeOperators,
  last_modified: timeOperators,
  file_size: [{ title: 'Larger than (bytes)', value: 'larger_than_bytes' }],
  file_extension: [
    { title: 'Matches', value: 'matches' },
    { title: 'Does not match', value: 'not_matches' },
  ],
};

const availableOperators = computed(() => {
  return operatorsByCondition[form.value.condition] || [];
});

const valueHint = computed(() => {
  switch (form.value.operator) {
    case 'older_than_hours': return 'Number of hours (e.g., 24)';
    case 'older_than_days': return 'Number of days (e.g., 30)';
    case 'older_than_weeks': return 'Number of weeks (e.g., 4)';
    case 'older_than_months': return 'Number of months (e.g., 6)';
    case 'larger_than_bytes': return 'Size in bytes (e.g., 1073741824 for 1GB)';
    case 'matches':
    case 'not_matches':
      return 'Comma-separated extensions (e.g., mxf,mov,mp4)';
    default: return '';
  }
});

// --- Pattern matching preview ---
const patternMatchingSpaces = computed(() => {
  if (form.value.selectorMode !== 'pattern' || !form.value.namePattern) return [];
  try {
    const re = new RegExp(form.value.namePattern);
    return props.spaces.filter((s) => re.test(s.name));
  } catch {
    return [];
  }
});

const isPatternValid = computed(() => {
  if (!form.value.namePattern) return false;
  try {
    new RegExp(form.value.namePattern);
    return true;
  } catch {
    return false;
  }
});

// --- Space label for rule preview ---
function spaceSelectorLabel(): string {
  const c = form.value;
  switch (c.selectorMode) {
    case 'explicit':
      if (c.selectedSpaceNames.length === 1) return `In "${c.selectedSpaceNames[0]}"`;
      if (c.selectedSpaceNames.length > 1) return `In ${c.selectedSpaceNames.length} spaces`;
      return '';
    case 'by_type':
      if (c.selectedSpaceTypes.length > 0) return `In all ${c.selectedSpaceTypes.join(', ')} spaces`;
      return '';
    case 'pattern':
      if (c.namePattern) return `In spaces matching /${c.namePattern}/`;
      return '';
    case 'all':
      return 'In all spaces';
    default:
      return '';
  }
}

const rulePreview = computed(() => {
  const c = form.value;
  const spaceLabel = spaceSelectorLabel();
  if (!spaceLabel || !c.value) return '';

  const timeUnit = c.operator === 'older_than_hours' ? 'hours'
    : c.operator === 'older_than_weeks' ? 'weeks'
    : c.operator === 'older_than_months' ? 'months' : 'days';

  let condStr = '';
  switch (c.condition) {
    case 'last_access':
      condStr = `not accessed in ${c.value} ${timeUnit}`;
      break;
    case 'last_modified':
      condStr = `not modified in ${c.value} ${timeUnit}`;
      break;
    case 'file_size':
      condStr = `larger than ${c.value} bytes`;
      break;
    case 'file_extension':
      condStr = c.operator === 'matches' ? `extension is ${c.value}` : `extension is not ${c.value}`;
      break;
  }

  if (c.targetType === 'archive') {
    const locName = enabledLocations.value.find((l) => l.id === c.archiveLocationId)?.name || '?';
    return `${spaceLabel}, archive files ${condStr} to "${locName}"`;
  }

  if (!c.sourceGoal || !c.targetGoal) return '';
  return `${spaceLabel}, move files ${condStr} from "${c.sourceGoal}" to "${c.targetGoal}"`;
});

watch(
  () => props.modelValue,
  (open) => {
    if (open && props.rule) {
      // Populate from existing rule
      const sel = props.rule.spaceSelector;
      form.value = {
        selectorMode: sel?.mode || 'explicit',
        selectedSpaceNames: sel?.mode === 'explicit' ? sel.spaceNames : [],
        selectedSpaceTypes: sel?.mode === 'by_type' ? sel.spaceTypes : [],
        namePattern: sel?.mode === 'pattern' ? sel.namePattern : '',
        name: props.rule.name,
        description: props.rule.description || '',
        targetType: props.rule.targetType || 'goal_change',
        sourceGoal: props.rule.sourceGoal || '',
        targetGoal: props.rule.targetGoal || '',
        archiveLocationId: props.rule.archiveLocationId || null,
        condition: props.rule.condition,
        operator: props.rule.operator,
        value: props.rule.value,
        recursive: props.rule.recursive,
        pathPattern: props.rule.pathPattern || '',
      };
    } else if (open) {
      form.value = {
        selectorMode: 'explicit',
        selectedSpaceNames: [],
        selectedSpaceTypes: [],
        namePattern: '',
        name: '',
        description: '',
        targetType: 'goal_change',
        sourceGoal: '',
        targetGoal: '',
        archiveLocationId: null,
        condition: 'last_access',
        operator: 'older_than_days',
        value: '',
        recursive: true,
        pathPattern: '',
      };
    }
  },
);

watch(
  () => form.value.condition,
  () => {
    const ops = availableOperators.value;
    if (ops.length > 0 && !ops.find((o) => o.value === form.value.operator)) {
      form.value.operator = ops[0].value as TieringOperator;
    }
  },
);

const isValid = computed(() => {
  // Validate space selection
  const m = form.value.selectorMode;
  if (m === 'explicit' && form.value.selectedSpaceNames.length === 0) return false;
  if (m === 'by_type' && form.value.selectedSpaceTypes.length === 0) return false;
  if (m === 'pattern' && !isPatternValid.value) return false;

  if (!form.value.name || !form.value.value) return false;
  if (form.value.targetType === 'archive') {
    return !!form.value.archiveLocationId;
  }
  return !!form.value.sourceGoal && !!form.value.targetGoal;
});

function buildSpaceSelector(): ISpaceSelector {
  switch (form.value.selectorMode) {
    case 'explicit':
      return { mode: 'explicit', spaceNames: form.value.selectedSpaceNames };
    case 'by_type':
      return { mode: 'by_type', spaceTypes: form.value.selectedSpaceTypes as any };
    case 'pattern':
      return { mode: 'pattern', namePattern: form.value.namePattern };
    case 'all':
      return { mode: 'all' };
  }
}

function handleSave(): void {
  if (!isValid.value) return;
  emit('save', {
    spaceSelector: buildSpaceSelector(),
    name: form.value.name,
    description: form.value.description || undefined,
    targetType: form.value.targetType,
    sourceGoal: form.value.targetType === 'goal_change' ? form.value.sourceGoal : undefined,
    targetGoal: form.value.targetType === 'goal_change' ? form.value.targetGoal : undefined,
    archiveLocationId: form.value.targetType === 'archive' ? (form.value.archiveLocationId || undefined) : undefined,
    condition: form.value.condition,
    operator: form.value.operator,
    value: form.value.value,
    recursive: form.value.recursive,
    pathPattern: form.value.pathPattern || undefined,
  });
}

function handleClose(): void {
  emit('update:modelValue', false);
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="640"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card>
      <v-card-title>
        <v-icon class="mr-2">mdi-swap-vertical-bold</v-icon>
        {{ isEdit ? 'Edit Tiering Rule' : 'Create Tiering Rule' }}
      </v-card-title>

      <v-card-text>
        <!-- Rule name -->
        <v-text-field
          v-model="form.name"
          label="Rule Name"
          variant="outlined"
          density="compact"
          class="mb-2"
        />

        <v-text-field
          v-model="form.description"
          label="Description (optional)"
          variant="outlined"
          density="compact"
          class="mb-2"
        />

        <!-- Space Selector Mode -->
        <div class="text-caption text-medium-emphasis mb-1">Target Spaces</div>
        <v-btn-toggle
          v-model="form.selectorMode"
          mandatory
          density="compact"
          color="primary"
          class="mb-3"
        >
          <v-btn value="explicit" size="small">
            <v-icon start size="16">mdi-folder-multiple</v-icon>
            Specific
          </v-btn>
          <v-btn value="by_type" size="small">
            <v-icon start size="16">mdi-shape</v-icon>
            By Type
          </v-btn>
          <v-btn value="pattern" size="small">
            <v-icon start size="16">mdi-regex</v-icon>
            Pattern
          </v-btn>
          <v-btn value="all" size="small">
            <v-icon start size="16">mdi-select-all</v-icon>
            All
          </v-btn>
        </v-btn-toggle>

        <!-- Explicit: multi-select spaces -->
        <v-select
          v-if="form.selectorMode === 'explicit'"
          v-model="form.selectedSpaceNames"
          :items="spaces"
          item-title="name"
          item-value="name"
          label="Select Spaces"
          variant="outlined"
          density="compact"
          multiple
          chips
          closable-chips
          class="mb-1"
        />

        <!-- By Type: multi-select types -->
        <v-select
          v-if="form.selectorMode === 'by_type'"
          v-model="form.selectedSpaceTypes"
          :items="spaceTypeItems"
          item-title="title"
          item-value="value"
          label="Select Space Types"
          variant="outlined"
          density="compact"
          multiple
          chips
          closable-chips
          class="mb-1"
        />

        <!-- Pattern: regex text field + live preview -->
        <div v-if="form.selectorMode === 'pattern'">
          <v-text-field
            v-model="form.namePattern"
            label="Name Pattern (regex)"
            variant="outlined"
            density="compact"
            placeholder="e.g., ^footage-.* or prod_.*"
            :hint="isPatternValid ? `Matches ${patternMatchingSpaces.length} space(s)` : (form.namePattern ? 'Invalid regex' : 'Enter a regex pattern')"
            persistent-hint
            :error="!!form.namePattern && !isPatternValid"
            class="mb-1"
          />
          <div v-if="patternMatchingSpaces.length > 0" class="d-flex flex-wrap gap-1 mb-3">
            <v-chip
              v-for="s in patternMatchingSpaces.slice(0, 20)"
              :key="s.name"
              size="x-small"
              variant="tonal"
              label
            >
              {{ s.name }}
            </v-chip>
            <span v-if="patternMatchingSpaces.length > 20" class="text-caption text-medium-emphasis ml-1">
              +{{ patternMatchingSpaces.length - 20 }} more
            </span>
          </div>
        </div>

        <!-- All: info banner -->
        <v-alert
          v-if="form.selectorMode === 'all'"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          This rule will apply to all media spaces on the server.
        </v-alert>

        <!-- Target Type -->
        <v-btn-toggle
          v-model="form.targetType"
          mandatory
          density="compact"
          color="primary"
          class="mb-3"
          :disabled="isEdit"
        >
          <v-btn value="goal_change" size="small">
            <v-icon start size="16">mdi-swap-horizontal</v-icon>
            Goal Change
          </v-btn>
          <v-btn value="archive" size="small">
            <v-icon start size="16">mdi-archive</v-icon>
            Archive
          </v-btn>
        </v-btn-toggle>

        <!-- Goal Change fields -->
        <v-row v-if="form.targetType === 'goal_change'" dense>
          <v-col cols="6">
            <v-select
              v-model="form.sourceGoal"
              :items="goalItems"
              item-title="title"
              item-value="value"
              label="Source Goal"
              variant="outlined"
              density="compact"
              :loading="goalsStore.isLoading"
              no-data-text="No goals available"
            />
          </v-col>
          <v-col cols="6">
            <v-select
              v-model="form.targetGoal"
              :items="goalItems"
              item-title="title"
              item-value="value"
              label="Target Goal"
              variant="outlined"
              density="compact"
              :loading="goalsStore.isLoading"
              no-data-text="No goals available"
            />
          </v-col>
        </v-row>

        <!-- Archive fields -->
        <v-select
          v-if="form.targetType === 'archive'"
          v-model="form.archiveLocationId"
          :items="enabledLocations.map(l => ({ title: l.name, value: l.id }))"
          label="Archive Location"
          variant="outlined"
          density="compact"
          class="mb-1"
          :no-data-text="'No archive locations configured'"
        >
          <template #prepend-inner>
            <v-icon size="18" color="deep-purple">mdi-archive</v-icon>
          </template>
        </v-select>

        <v-row dense>
          <v-col cols="4">
            <v-select
              v-model="form.condition"
              :items="conditions"
              item-title="title"
              item-value="value"
              label="Condition"
              variant="outlined"
              density="compact"
            />
          </v-col>
          <v-col cols="4">
            <v-select
              v-model="form.operator"
              :items="availableOperators"
              item-title="title"
              item-value="value"
              label="Operator"
              variant="outlined"
              density="compact"
            />
          </v-col>
          <v-col cols="4">
            <v-text-field
              v-model="form.value"
              label="Value"
              variant="outlined"
              density="compact"
              :hint="valueHint"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-text-field
          v-model="form.pathPattern"
          label="Path Pattern (optional)"
          variant="outlined"
          density="compact"
          placeholder="e.g., footage/archive"
          hint="Relative path within the space to limit the rule scope"
          persistent-hint
          class="mb-2"
        />

        <v-checkbox
          v-model="form.recursive"
          label="Search recursively in subdirectories"
          density="compact"
          hide-details
        />

        <!-- Rule preview -->
        <v-alert
          v-if="rulePreview"
          type="info"
          variant="tonal"
          density="compact"
          class="mt-3"
        >
          <div class="text-caption font-weight-medium">Rule Preview:</div>
          {{ rulePreview }}
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn @click="handleClose" :disabled="props.isSaving">Cancel</v-btn>
        <v-btn
          color="primary"
          :loading="props.isSaving"
          :disabled="!isValid"
          @click="handleSave"
        >
          {{ isEdit ? 'Update' : 'Create' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
