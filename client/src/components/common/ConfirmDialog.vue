<script setup lang="ts">
interface Props {
  modelValue: boolean;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Confirm Action',
  message: 'Are you sure you want to proceed?',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  confirmColor: 'primary',
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  confirm: [];
  cancel: [];
}>();

function handleConfirm(): void {
  emit('confirm');
  emit('update:modelValue', false);
}

function handleCancel(): void {
  emit('cancel');
  emit('update:modelValue', false);
}
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="440"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card class="confirm-dialog">
      <v-card-title class="confirm-dialog__title">
        {{ props.title }}
      </v-card-title>

      <v-card-text class="confirm-dialog__message">
        {{ props.message }}
      </v-card-text>

      <v-card-actions class="confirm-dialog__actions">
        <v-spacer />
        <v-btn
          variant="text"
          color="secondary"
          @click="handleCancel"
        >
          {{ props.cancelText }}
        </v-btn>
        <v-btn
          variant="flat"
          :color="props.confirmColor"
          @click="handleConfirm"
        >
          {{ props.confirmText }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped lang="scss">
.confirm-dialog {
  &__title {
    font-size: 18px;
    font-weight: 600;
    padding: 20px 24px 8px;
  }

  &__message {
    font-size: 14px;
    color: #9ca3af;
    padding: 8px 24px 16px;
  }

  &__actions {
    padding: 8px 16px 16px;
  }
}
</style>
