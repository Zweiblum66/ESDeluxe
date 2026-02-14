<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { ISpace } from '@shared/types';
import type { TreeNode } from '@/views/files/components/SpaceTree.vue';
import SpaceTreeNode from '@/views/files/components/SpaceTreeNode.vue';
import { useFilesStore } from '@/stores/files.store';

interface Props {
  spaces: ISpace[];
  selectedSpace: string | null;
  selectedPath: string | null;
  spaceAssetCounts: Map<string, number>;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  select: [spaceName: string | null, directoryPath: string | null];
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
  return treeNodes.value.filter((n) => n.label.toLowerCase().includes(q));
});

// Initialize tree nodes from spaces
function buildSpaceNodes(spaces: ISpace[]): TreeNode[] {
  return spaces.map((space) => {
    // Preserve expanded state for existing nodes
    const existing = treeNodes.value.find((n) => n.spaceName === space.name && n.isSpace);
    if (existing) {
      existing.label = space.name;
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
function handleAllSpacesClick(): void {
  selectedNodeId.value = null;
  emit('select', null, null);
}

function handleNodeClick(node: TreeNode): void {
  selectedNodeId.value = node.id;
  if (node.isSpace) {
    emit('select', node.spaceName, null);
  } else {
    emit('select', node.spaceName, node.path);
  }
  // Auto-expand to show children
  if (!node.isExpanded) {
    toggleExpand(node);
  }
}

function isNodeActive(node: TreeNode): boolean {
  if (!props.selectedSpace) return false;
  if (node.isSpace) {
    return node.spaceName === props.selectedSpace && !props.selectedPath;
  }
  return node.spaceName === props.selectedSpace && node.path === props.selectedPath;
}

// The "current" values for SpaceTreeNode compatibility
const currentSpace = computed(() => props.selectedSpace);
const currentPath = computed(() => {
  if (!props.selectedSpace) return '';
  return props.selectedPath || '';
});
</script>

<template>
  <div class="asset-tree">
    <div class="asset-tree__header">
      <v-icon size="16" class="mr-1">mdi-file-tree</v-icon>
      <span class="text-caption font-weight-medium">Spaces</span>
    </div>

    <div class="asset-tree__search">
      <v-text-field
        v-model="searchQuery"
        density="compact"
        variant="outlined"
        placeholder="Filter spaces..."
        prepend-inner-icon="mdi-magnify"
        hide-details
        clearable
        single-line
        class="asset-tree__search-field"
      />
    </div>

    <div class="asset-tree__list">
      <!-- "All Spaces" root option -->
      <div
        class="asset-tree__node asset-tree__node--all"
        :class="{ 'asset-tree__node--active': !selectedSpace }"
        @click="handleAllSpacesClick"
      >
        <v-icon size="18" color="#9ca3af" class="mr-2 ml-1">mdi-folder-multiple</v-icon>
        <span class="asset-tree__label">All Spaces</span>
      </div>

      <template v-for="spaceNode in filteredNodes" :key="spaceNode.id">
        <!-- Space root node -->
        <div
          class="asset-tree__node asset-tree__node--space"
          :class="{ 'asset-tree__node--active': isNodeActive(spaceNode) }"
          @click="handleNodeClick(spaceNode)"
        >
          <v-btn
            icon
            variant="text"
            size="x-small"
            class="asset-tree__chevron"
            @click.stop="toggleExpand(spaceNode)"
          >
            <v-icon size="16">
              {{ spaceNode.isLoading ? 'mdi-loading mdi-spin' : spaceNode.isExpanded ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
            </v-icon>
          </v-btn>
          <v-icon size="18" :color="spaceNode.isExpanded ? '#f59e0b' : '#6b7280'" class="mr-1">
            {{ spaceNode.isExpanded ? 'mdi-folder-network-outline' : 'mdi-folder-network' }}
          </v-icon>
          <span class="asset-tree__label">{{ spaceNode.label }}</span>
          <v-chip
            v-if="spaceAssetCounts.get(spaceNode.label)"
            size="x-small"
            variant="tonal"
            color="primary"
            class="ml-auto asset-tree__count"
          >
            {{ spaceAssetCounts.get(spaceNode.label) }}
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
            :selection-mode="true"
            :selected-node-id="selectedNodeId"
            @click-node="handleNodeClick"
            @toggle-node="toggleExpand"
            @contextmenu-node="() => {}"
          />
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.asset-tree {
  width: 260px;
  min-width: 260px;
  border-right: 1px solid rgba(55, 65, 81, 0.3);
  overflow-y: auto;
  display: flex;
  flex-direction: column;

  @include phone {
    width: 100%;
    min-width: 0;
    border-right: none;
    border-bottom: 1px solid rgba(55, 65, 81, 0.3);
    max-height: 260px;
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

    .asset-tree__search-field {
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

    &--all {
      padding: 6px 8px;
      margin-bottom: 2px;
    }

    &--space {
      padding-left: 4px;
      padding-right: 8px;
    }

    &--active {
      background-color: rgba(59, 130, 246, 0.12) !important;

      .asset-tree__label {
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

  &__count {
    font-size: 10px !important;
    flex-shrink: 0;
  }
}
</style>
