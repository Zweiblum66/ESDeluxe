<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { ITieringRule, ICreateTieringRuleRequest, TieringCondition, TieringOperator } from '@shared/types';

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

const isEdit = computed(() => !!props.rule);

const form = ref<{
  spaceName: string;
  name: string;
  description: string;
  sourceGoal: string;
  targetGoal: string;
  condition: TieringCondition;
  operator: TieringOperator;
  value: string;
  recursive: boolean;
  pathPattern: string;
}>({
  spaceName: '',
  name: '',
  description: '',
  sourceGoal: '',
  targetGoal: '',
  condition: 'last_access',
  operator: 'older_than_days',
  value: '',
  recursive: true,
  pathPattern: '',
});

const conditions = [
  { title: 'Last Access Time', value: 'last_access' },
  { title: 'Last Modified Time', value: 'last_modified' },
  { title: 'File Size', value: 'file_size' },
  { title: 'File Extension', value: 'file_extension' },
];

const operatorsByCondition: Record<string, { title: string; value: string }[]> = {
  last_access: [{ title: 'Older than (days)', value: 'older_than_days' }],
  last_modified: [{ title: 'Older than (days)', value: 'older_than_days' }],
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
    case 'older_than_days': return 'Number of days (e.g., 30)';
    case 'larger_than_bytes': return 'Size in bytes (e.g., 1073741824 for 1GB)';
    case 'matches':
    case 'not_matches':
      return 'Comma-separated extensions (e.g., mxf,mov,mp4)';
    default: return '';
  }
});

const rulePreview = computed(() => {
  const c = form.value;
  if (!c.spaceName || !c.sourceGoal || !c.targetGoal || !c.value) return '';

  let condStr = '';
  switch (c.condition) {
    case 'last_access':
      condStr = `not accessed in ${c.value} days`;
      break;
    case 'last_modified':
      condStr = `not modified in ${c.value} days`;
      break;
    case 'file_size':
      condStr = `larger than ${c.value} bytes`;
      break;
    case 'file_extension':
      condStr = c.operator === 'matches' ? `extension is ${c.value}` : `extension is not ${c.value}`;
      break;
  }

  return `In "${c.spaceName}", move files ${condStr} from "${c.sourceGoal}" to "${c.targetGoal}"`;
});

watch(
  () => props.modelValue,
  (open) => {
    if (open && props.rule) {
      form.value = {
        spaceName: props.rule.spaceName,
        name: props.rule.name,
        description: props.rule.description || '',
        sourceGoal: props.rule.sourceGoal,
        targetGoal: props.rule.targetGoal,
        condition: props.rule.condition,
        operator: props.rule.operator,
        value: props.rule.value,
        recursive: props.rule.recursive,
        pathPattern: props.rule.pathPattern || '',
      };
    } else if (open) {
      form.value = {
        spaceName: '',
        name: '',
        description: '',
        sourceGoal: '',
        targetGoal: '',
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
  return form.value.spaceName &&
    form.value.name &&
    form.value.sourceGoal &&
    form.value.targetGoal &&
    form.value.value;
});

function handleSave(): void {
  if (!isValid.value) return;
  emit('save', {
    spaceName: form.value.spaceName,
    name: form.value.name,
    description: form.value.description || undefined,
    sourceGoal: form.value.sourceGoal,
    targetGoal: form.value.targetGoal,
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
        <v-row dense>
          <v-col cols="6">
            <v-select
              v-model="form.spaceName"
              :items="spaces"
              item-title="name"
              item-value="name"
              label="Media Space"
              variant="outlined"
              density="compact"
              :disabled="isEdit"
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              v-model="form.name"
              label="Rule Name"
              variant="outlined"
              density="compact"
            />
          </v-col>
        </v-row>

        <v-text-field
          v-model="form.description"
          label="Description (optional)"
          variant="outlined"
          density="compact"
          class="mb-2"
        />

        <v-row dense>
          <v-col cols="6">
            <v-text-field
              v-model="form.sourceGoal"
              label="Source Goal"
              variant="outlined"
              density="compact"
              placeholder="e.g., default_group_1"
            />
          </v-col>
          <v-col cols="6">
            <v-text-field
              v-model="form.targetGoal"
              label="Target Goal"
              variant="outlined"
              density="compact"
              placeholder="e.g., nearline_group_1"
            />
          </v-col>
        </v-row>

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
