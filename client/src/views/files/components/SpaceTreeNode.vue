<script setup lang="ts">
import type { TreeNode } from './SpaceTree.vue';

interface Props {
  node: TreeNode;
  depth: number;
  currentSpace: string | null;
  currentPath: string;
  selectionMode: boolean;
  selectedNodeId: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'click-node': [node: TreeNode];
  'toggle-node': [node: TreeNode];
}>();

function isActive(): boolean {
  if (!props.currentSpace) return false;
  return props.node.spaceName === props.currentSpace && props.node.path === props.currentPath;
}

function isSelected(): boolean {
  return props.selectedNodeId === props.node.id;
}
</script>

<template>
  <div>
    <div
      class="space-tree__node"
      :class="{
        'space-tree__node--active': !selectionMode && isActive(),
        'space-tree__node--selected': selectionMode && isSelected(),
      }"
      :style="{ paddingLeft: (depth * 16 + 8) + 'px' }"
      @click="emit('click-node', node)"
    >
      <v-btn
        icon
        variant="text"
        size="x-small"
        class="space-tree__chevron"
        @click.stop="emit('toggle-node', node)"
      >
        <v-icon size="16">
          {{ node.isLoading ? 'mdi-loading mdi-spin' : node.isExpanded ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
        </v-icon>
      </v-btn>
      <v-icon size="18" :color="node.isExpanded ? '#f59e0b' : '#6b7280'" class="mr-1">
        {{ node.isExpanded ? 'mdi-folder-open' : 'mdi-folder' }}
      </v-icon>
      <span class="space-tree__label">{{ node.label }}</span>
    </div>

    <!-- Recursive children -->
    <template v-if="node.isExpanded">
      <SpaceTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :current-space="currentSpace"
        :current-path="currentPath"
        :selection-mode="selectionMode"
        :selected-node-id="selectedNodeId"
        @click-node="emit('click-node', $event)"
        @toggle-node="emit('toggle-node', $event)"
      />
    </template>
  </div>
</template>

<style scoped lang="scss">
.space-tree {
  &__node {
    display: flex;
    align-items: center;
    padding: 4px 8px;
    cursor: pointer;
    transition: background-color 0.12s;
    min-height: 32px;
    user-select: none;

    &:hover {
      background-color: rgba(59, 130, 246, 0.06);
    }

    &--active {
      background-color: rgba(59, 130, 246, 0.12) !important;

      .space-tree__label {
        color: #60a5fa;
        font-weight: 500;
      }
    }

    &--selected {
      background-color: rgba(59, 130, 246, 0.15) !important;
      outline: 1px solid rgba(59, 130, 246, 0.4);
      outline-offset: -1px;
      border-radius: 4px;

      .space-tree__label {
        color: #60a5fa;
        font-weight: 500;
      }
    }
  }

  &__chevron {
    flex-shrink: 0;
    width: 24px !important;
    height: 24px !important;
  }

  &__label {
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }
}
</style>
