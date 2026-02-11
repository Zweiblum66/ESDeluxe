<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';

export interface ContextMenuItem {
  label: string;
  icon?: string;
  action: string;
  color?: string;
  divider?: boolean;
  disabled?: boolean;
}

interface Props {
  modelValue: boolean;
  position: { x: number; y: number };
  items: ContextMenuItem[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  action: [action: string];
}>();

const menuOpen = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
});

const activatorRef = ref<HTMLElement | null>(null);

// Reposition the hidden activator whenever position changes
watch(
  () => props.position,
  () => {
    if (activatorRef.value) {
      activatorRef.value.style.left = `${props.position.x}px`;
      activatorRef.value.style.top = `${props.position.y}px`;
    }
  },
);

function handleItemClick(item: ContextMenuItem): void {
  if (item.disabled) return;
  emit('action', item.action);
  menuOpen.value = false;
}

// Filter out divider-only items for rendering
const visibleItems = computed(() => props.items.filter((i) => i.label || i.divider));
</script>

<template>
  <div>
    <!-- Hidden activator element positioned at click coordinates -->
    <div
      ref="activatorRef"
      class="context-menu-activator"
      :style="{ left: position.x + 'px', top: position.y + 'px' }"
    />

    <v-menu
      v-model="menuOpen"
      :activator="activatorRef!"
      location="bottom start"
      :close-on-content-click="false"
      scroll-strategy="close"
    >
      <v-list
        density="compact"
        bg-color="#2a2d35"
        class="context-menu__list"
        nav
      >
        <template v-for="(item, index) in visibleItems" :key="index">
          <v-divider v-if="item.divider && !item.label" class="my-1" />
          <template v-else>
            <v-divider v-if="item.divider" class="my-1" />
            <v-list-item
              :disabled="item.disabled"
              :class="{ 'text-error': item.color === 'error' }"
              class="context-menu__item"
              @click="handleItemClick(item)"
            >
              <template #prepend>
                <v-icon
                  v-if="item.icon"
                  :icon="item.icon"
                  size="18"
                  :color="item.color || undefined"
                  class="mr-2"
                />
              </template>
              <v-list-item-title class="context-menu__item-title">
                {{ item.label }}
              </v-list-item-title>
            </v-list-item>
          </template>
        </template>
      </v-list>
    </v-menu>
  </div>
</template>

<style scoped lang="scss">
.context-menu-activator {
  position: fixed;
  width: 1px;
  height: 1px;
  pointer-events: none;
  opacity: 0;
}

.context-menu__list {
  min-width: 180px;
  padding: 4px 0 !important;
  border: 1px solid rgba(55, 65, 81, 0.5);
  border-radius: 6px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.context-menu__item {
  min-height: 34px !important;
  padding: 0 12px !important;
  border-radius: 4px;
  margin: 0 4px;

  &:hover {
    background-color: rgba(59, 130, 246, 0.12) !important;
  }
}

.context-menu__item-title {
  font-size: 13px !important;
}
</style>
