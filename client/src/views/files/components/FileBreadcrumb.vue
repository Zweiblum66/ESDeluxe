<script setup lang="ts">
interface BreadcrumbItem {
  label: string;
  path: string;
}

interface Props {
  items: BreadcrumbItem[];
  spaceName: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  navigate: [path: string];
}>();
</script>

<template>
  <nav class="file-breadcrumb">
    <v-icon size="16" class="file-breadcrumb__home-icon">mdi-folder-network</v-icon>
    <template v-for="(item, index) in props.items" :key="index">
      <span v-if="index > 0" class="file-breadcrumb__separator">/</span>
      <button
        v-if="index < props.items.length - 1"
        class="file-breadcrumb__link"
        @click="emit('navigate', item.path)"
      >
        {{ item.label }}
      </button>
      <span v-else class="file-breadcrumb__current">{{ item.label }}</span>
    </template>
  </nav>
</template>

<style scoped lang="scss">
.file-breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  min-height: 32px;
  flex-wrap: wrap;

  &__home-icon {
    color: #6b7280;
    margin-right: 4px;
  }

  &__separator {
    color: #4b5563;
    margin: 0 2px;
  }

  &__link {
    color: #60a5fa;
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
    font-size: inherit;
    font-family: inherit;
    transition: background-color 150ms ease;

    &:hover {
      background-color: rgba(96, 165, 250, 0.1);
    }
  }

  &__current {
    color: #e5e7eb;
    font-weight: 500;
    padding: 2px 4px;
  }
}
</style>
