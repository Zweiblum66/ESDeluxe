<script setup lang="ts">
interface Props {
  title: string;
  itemCount?: number;
  subtitle?: string;
}

const props = withDefaults(defineProps<Props>(), {
  itemCount: undefined,
  subtitle: undefined,
});
</script>

<template>
  <div class="page-header">
    <div class="page-header__left">
      <h2 class="page-header__title">{{ props.title }}</h2>
      <span v-if="props.itemCount !== undefined" class="page-header__count">
        {{ props.itemCount }} {{ props.itemCount === 1 ? 'item' : 'items' }}
      </span>
      <span v-if="props.subtitle" class="page-header__subtitle">
        {{ props.subtitle }}
      </span>
    </div>
    <div class="page-header__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 12px;

  @include phone {
    flex-direction: column;
    margin-bottom: 16px;
  }

  &__left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__title {
    font-size: 22px;
    font-weight: 600;
    color: #e5e7eb;
    margin: 0;

    @include phone {
      font-size: 18px;
    }
  }

  &__count {
    font-size: 13px;
    color: #6b7280;
  }

  &__subtitle {
    font-size: 13px;
    color: #9ca3af;
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 8px;

    @include phone {
      width: 100%;
      flex-wrap: wrap;
    }
  }
}
</style>
