<script setup lang="ts">
interface Props {
  active?: boolean;
  text?: string;
}

withDefaults(defineProps<Props>(), {
  active: false,
  text: 'Loading...',
});
</script>

<template>
  <v-overlay
    :model-value="active"
    contained
    class="align-center justify-center"
    scrim="rgba(26, 29, 35, 0.8)"
  >
    <div class="loading-overlay__content">
      <v-progress-circular
        indeterminate
        color="primary"
        size="48"
        width="4"
      />
      <span v-if="text" class="loading-overlay__text">{{ text }}</span>
    </div>
  </v-overlay>
</template>

<style scoped lang="scss">
.loading-overlay {
  &__content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  &__text {
    font-size: 14px;
    color: #9ca3af;
  }
}
</style>
