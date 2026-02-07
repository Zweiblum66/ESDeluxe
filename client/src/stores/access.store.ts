import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useSpacesStore } from './spaces.store';
import { useUsersStore } from './users.store';
import { useGroupsStore } from './groups.store';
import {
  computeSpaceAccessRows,
  computeUserAccessRows,
  computeGroupAccessRows,
} from '@/composables/useEffectiveAccess';
import type {
  AccessPerspective,
  ISpaceDetail,
  IUserDetail,
  IGroupDetail,
  ISpaceAccessRow,
  IUserAccessRow,
  IGroupAccessRow,
} from '@shared/types';

export const useAccessStore = defineStore('access', () => {
  const spacesStore = useSpacesStore();
  const usersStore = useUsersStore();
  const groupsStore = useGroupsStore();

  // --- State ---
  const perspective = ref<AccessPerspective>('space');
  const selectedEntity = ref<string | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  // Detail data for the current selection
  const spaceDetail = ref<ISpaceDetail | null>(null);
  const userDetail = ref<IUserDetail | null>(null);
  const groupDetail = ref<IGroupDetail | null>(null);

  // Cache of group details for cross-referencing (group name → detail)
  const groupDetailsCache = ref<Map<string, IGroupDetail>>(new Map());

  // --- Computed: effective access rows ---
  const spaceAccessRows = computed<ISpaceAccessRow[]>(() => {
    if (!spaceDetail.value) return [];
    return computeSpaceAccessRows(spaceDetail.value, groupDetailsCache.value);
  });

  const userAccessRows = computed<IUserAccessRow[]>(() => {
    if (!userDetail.value) return [];
    return computeUserAccessRows(userDetail.value, groupDetailsCache.value);
  });

  const groupAccessRows = computed<IGroupAccessRow[]>(() => {
    if (!groupDetail.value) return [];
    return computeGroupAccessRows(groupDetail.value);
  });

  // --- Actions ---

  function setPerspective(p: AccessPerspective): void {
    perspective.value = p;
    clearSelection();
  }

  function clearSelection(): void {
    selectedEntity.value = null;
    spaceDetail.value = null;
    userDetail.value = null;
    groupDetail.value = null;
    error.value = null;
  }

  async function selectEntity(name: string): Promise<void> {
    selectedEntity.value = name;
    error.value = null;
    isLoading.value = true;

    try {
      switch (perspective.value) {
        case 'space':
          await fetchSpaceData(name);
          break;
        case 'user':
          await fetchUserData(name);
          break;
        case 'group':
          await fetchGroupData(name);
          break;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load access data';
      error.value = message;
      console.error('Failed to load access data:', err);
    } finally {
      isLoading.value = false;
    }
  }

  async function fetchSpaceData(name: string): Promise<void> {
    // Fetch space detail (includes direct users + groups)
    const detail = await spacesStore.fetchSpaceDetail(name);
    if (!detail) throw new Error('Failed to load space detail');
    spaceDetail.value = detail;

    // Fetch group details for each group on the space (in parallel)
    const groupFetches = detail.groups.map(async (sg) => {
      if (!groupDetailsCache.value.has(sg.groupName)) {
        const gd = await groupsStore.fetchGroupDetail(sg.groupName);
        if (gd) groupDetailsCache.value.set(sg.groupName, gd);
      }
    });
    await Promise.all(groupFetches);
  }

  async function fetchUserData(name: string): Promise<void> {
    // Fetch user detail (includes direct spaces + group memberships)
    const detail = await usersStore.fetchUserDetail(name);
    if (!detail) throw new Error('Failed to load user detail');
    userDetail.value = detail;

    // Fetch group details for each group the user belongs to (in parallel)
    const groupFetches = detail.groups.map(async (groupName) => {
      if (!groupDetailsCache.value.has(groupName)) {
        const gd = await groupsStore.fetchGroupDetail(groupName);
        if (gd) groupDetailsCache.value.set(groupName, gd);
      }
    });
    await Promise.all(groupFetches);
  }

  async function fetchGroupData(name: string): Promise<void> {
    const detail = await groupsStore.fetchGroupDetail(name);
    if (!detail) throw new Error('Failed to load group detail');
    groupDetail.value = detail;
    groupDetailsCache.value.set(name, detail);
  }

  async function refreshCurrentSelection(): Promise<void> {
    if (!selectedEntity.value) return;
    // Invalidate caches for the current context
    groupDetailsCache.value.clear();
    await selectEntity(selectedEntity.value);
  }

  // --- Mutation actions (delegate to spacesStore, then refresh) ---

  async function setUserAccess(
    spaceName: string,
    username: string,
    readonly: boolean,
  ): Promise<boolean> {
    const success = await spacesStore.setUserAccess(spaceName, username, readonly);
    if (success) await refreshCurrentSelection();
    return success;
  }

  async function addUserToSpace(
    spaceName: string,
    username: string,
    readonly: boolean,
  ): Promise<boolean> {
    const success = await spacesStore.addUserToSpace(spaceName, username, readonly);
    if (success) await refreshCurrentSelection();
    return success;
  }

  async function removeUserFromSpace(
    spaceName: string,
    username: string,
  ): Promise<boolean> {
    const success = await spacesStore.removeUserFromSpace(spaceName, username);
    if (success) await refreshCurrentSelection();
    return success;
  }

  async function setGroupAccess(
    spaceName: string,
    groupName: string,
    readonly: boolean,
  ): Promise<boolean> {
    const success = await spacesStore.setGroupAccess(spaceName, groupName, readonly);
    if (success) await refreshCurrentSelection();
    return success;
  }

  async function addGroupToSpace(
    spaceName: string,
    groupName: string,
    readonly: boolean,
  ): Promise<boolean> {
    const success = await spacesStore.addGroupToSpace(spaceName, groupName, readonly);
    if (success) await refreshCurrentSelection();
    return success;
  }

  async function removeGroupFromSpace(
    spaceName: string,
    groupName: string,
  ): Promise<boolean> {
    const success = await spacesStore.removeGroupFromSpace(spaceName, groupName);
    if (success) await refreshCurrentSelection();
    return success;
  }

  async function resetUserOverride(
    spaceName: string,
    username: string,
  ): Promise<boolean> {
    const success = await spacesStore.resetUserOverride(spaceName, username);
    if (success) await refreshCurrentSelection();
    return success;
  }

  return {
    // State
    perspective,
    selectedEntity,
    isLoading,
    error,
    spaceDetail,
    userDetail,
    groupDetail,
    groupDetailsCache,
    // Computed
    spaceAccessRows,
    userAccessRows,
    groupAccessRows,
    // Actions
    setPerspective,
    clearSelection,
    selectEntity,
    refreshCurrentSelection,
    // Mutations
    setUserAccess,
    addUserToSpace,
    removeUserFromSpace,
    setGroupAccess,
    addGroupToSpace,
    removeGroupFromSpace,
    resetUserOverride,
  };
});
