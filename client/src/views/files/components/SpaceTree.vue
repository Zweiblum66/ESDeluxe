<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { ISpace } from '@shared/types';
import { useFilesStore } from '@/stores/files.store';
import SpaceTreeNode from './SpaceTreeNode.vue';

export interface TreeNode {
  id: string;
  label: string;
  spaceName: string;
  path: string;
  isSpace: boolean;
  isExpanded: boolean;
  isLoading: boolean;
  children: TreeNode[];
  childrenLoaded: boolean;
  spaceType?: string;
}

interface Props {
  spaces: ISpace[];
  currentSpace: string | null;
  currentPath: string;
  selectionMode?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  selectionMode: false,
});

const emit = defineEmits<{
  navigate: [spaceName: string, path: string];
  select: [spaceName: string, path: string];
}>();

const store = useFilesStore();

// --- Tree state ---
const treeNodes = ref<TreeNode[]>([]);
const selectedNodeId = ref<string | null>(null);
const searchQuery = ref<string | null>('');

// Filtered space nodes based on search query
const filteredNodes = computed(() => {
  const q = (searchQuery.value || '').trim().toLowerCase();
  if (!q) return treeNodes.value;
  return treeNodes.value.filter(
    (n) => n.label.toLowerCase().includes(q) || (n.spaceType && n.spaceType.toLowerCase().includes(q)),
  );
});

// Initialize tree nodes from spaces
function buildSpaceNodes(spaces: ISpace[]): TreeNode[] {
  return spaces.map((space) => {
    // Preserve expanded state for existing nodes
    const existing = treeNodes.value.find((n) => n.spaceName === space.name && n.isSpace);
    if (existing) {
      existing.label = space.name;
      existing.spaceType = space.type;
      return existing;
    }
    return {
      id: `space:${space.name}`,
      label: space.name,
      spaceName: space.name,
      path: '',
      isSpace: true,
      isExpanded: false,
      isLoading: false,
      children: [],
      childrenLoaded: false,
      spaceType: space.type,
    };
  });
}

watch(
  () => props.spaces,
  (newSpaces) => {
    treeNodes.value = buildSpaceNodes(newSpaces);
  },
  { immediate: true },
);

// Auto-expand current space when it changes
watch(
  () => props.currentSpace,
  async (spaceName) => {
    if (!spaceName) return;
    const node = treeNodes.value.find((n) => n.spaceName === spaceName && n.isSpace);
    if (node && !node.isExpanded && !node.childrenLoaded) {
      await toggleExpand(node);
    }
  },
);

// --- Expand / collapse ---
async function toggleExpand(node: TreeNode): Promise<void> {
  if (node.isExpanded) {
    node.isExpanded = false;
    return;
  }

  node.isExpanded = true;

  if (!node.childrenLoaded) {
    node.isLoading = true;
    const dirs = await store.fetchSubdirectories(node.spaceName, node.path || undefined);
    node.children = dirs.map((d) => ({
      id: `space:${node.spaceName}:${d.path}`,
      label: d.name,
      spaceName: node.spaceName,
      path: d.path,
      isSpace: false,
      isExpanded: false,
      isLoading: false,
      children: [],
      childrenLoaded: false,
    }));
    node.childrenLoaded = true;
    node.isLoading = false;
  }
}

// --- Handlers ---
function handleNodeClick(node: TreeNode): void {
  if (props.selectionMode) {
    selectedNodeId.value = node.id;
    emit('select', node.spaceName, node.path);
    // Also auto-expand to let users browse the tree easily
    if (!node.isExpanded) {
      toggleExpand(node);
    }
  } else {
    emit('navigate', node.spaceName, node.path);
  }
}

function isNodeActive(node: TreeNode): boolean {
  if (!props.currentSpace) return false;
  return node.spaceName === props.currentSpace && node.path === props.currentPath;
}

function spaceTypeColor(type?: string): string {
  switch (type) {
    case 'avidstyle': return 'primary';
    case 'avidmxf': return 'warning';
    default: return 'default';
  }
}
</script>

<template>
  <div class="space-tree" :class="{ 'space-tree--selection': selectionMode }">
    <div class="space-tree__header">
      <v-icon size="16" class="mr-1">mdi-file-tree</v-icon>
      <span class="text-caption font-weight-medium">Spaces</span>
    </div>

    <div class="space-tree__search">
      <v-text-field
        v-model="searchQuery"
        density="compact"
        variant="outlined"
        placeholder="Filter spaces..."
        prepend-inner-icon="mdi-magnify"
        hide-details
        clearable
        single-line
        class="space-tree__search-field"
      />
    </div>

    <div class="space-tree__list">
      <template v-for="spaceNode in filteredNodes" :key="spaceNode.id">
        <!-- Space root node -->
        <div
          class="space-tree__node space-tree__node--space"
          :class="{
            'space-tree__node--active': !selectionMode && isNodeActive(spaceNode),
            'space-tree__node--selected': selectionMode && selectedNodeId === spaceNode.id,
          }"
          @click="handleNodeClick(spaceNode)"
        >
          <v-btn
            icon
            variant="text"
            size="x-small"
            class="space-tree__chevron"
            @click.stop="toggleExpand(spaceNode)"
          >
            <v-icon size="16">
              {{ spaceNode.isLoading ? 'mdi-loading mdi-spin' : spaceNode.isExpanded ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
            </v-icon>
          </v-btn>
          <v-icon size="18" :color="spaceNode.isExpanded ? '#f59e0b' : '#6b7280'" class="mr-1">
            {{ spaceNode.isExpanded ? 'mdi-folder-network-outline' : 'mdi-folder-network' }}
          </v-icon>
          <span class="space-tree__label">{{ spaceNode.label }}</span>
          <v-chip
            size="x-small"
            variant="tonal"
            label
            :color="spaceTypeColor(spaceNode.spaceType)"
            class="ml-auto space-tree__type"
          >
            {{ spaceNode.spaceType }}
          </v-chip>
        </div>

        <!-- Children (recursive) -->
        <template v-if="spaceNode.isExpanded">
          <SpaceTreeNode
            v-for="child in spaceNode.children"
            :key="child.id"
            :node="child"
            :depth="1"
            :current-space="currentSpace"
            :current-path="currentPath"
            :selection-mode="selectionMode"
            :selected-node-id="selectedNodeId"
            @click-node="handleNodeClick"
            @toggle-node="toggleExpand"
          />
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.space-tree {
  width: 260px;
  min-width: 260px;
  border-right: 1px solid rgba(55, 65, 81, 0.3);
  overflow-y: auto;
  display: flex;
  flex-direction: column;

  &--selection {
    width: 100%;
    min-width: 0;
    border-right: none;
    max-height: 350px;
  }

  &__header {
    display: flex;
    align-items: center;
    padding: 10px 12px 6px;
    color: #9ca3af;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &__search {
    padding: 4px 8px 2px;

    .space-tree__search-field {
      :deep(.v-field) {
        min-height: 32px;
        font-size: 12px;
      }

      :deep(.v-field__input) {
        padding-top: 4px;
        padding-bottom: 4px;
        min-height: 32px;
      }

      :deep(.v-field__prepend-inner) {
        padding-top: 4px;

        .v-icon {
          font-size: 16px;
          opacity: 0.5;
        }
      }

      :deep(.v-field__clearable) {
        padding-top: 4px;

        .v-icon {
          font-size: 16px;
        }
      }
    }
  }

  &__list {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 8px;
  }

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

    &--space {
      padding-left: 4px;
      padding-right: 8px;
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

  &__type {
    font-size: 10px !important;
    flex-shrink: 0;
  }
}
</style>
