import type {
  SpaceAccessType,
  ISpaceDetail,
  IUserDetail,
  IGroupDetail,
  AccessSource,
  IGroupAccessContribution,
  ISpaceAccessRow,
  IUserAccessRow,
  IGroupAccessRow,
} from '@shared/types';

/**
 * Rank access types for comparison: readwrite/admin > readonly > none.
 */
function accessRank(type: string | null | undefined): number {
  if (!type || type === 'none') return 0;
  if (type === 'readonly') return 1;
  if (type === 'readwrite' || type === 'admin') return 2;
  return 0;
}

/**
 * Resolve effective access from a combination of direct and group accesses.
 *
 * Rules:
 * - readwrite > readonly > none
 * - admin is treated as readwrite equivalent
 * - Direct access overrides group access (reflected in source)
 * - hasOverride flag determines if direct access is truly an override or just group inheritance
 */
export function resolveEffectiveAccess(
  directAccess: SpaceAccessType | null,
  groupAccesses: IGroupAccessContribution[],
  hasOverride: boolean = false,
): { effectiveAccess: SpaceAccessType | 'none'; source: AccessSource } {
  // Determine highest access level
  let highestRank = accessRank(directAccess);
  let highestType: SpaceAccessType | 'none' = directAccess ?? 'none';

  for (const ga of groupAccesses) {
    const rank = accessRank(ga.accessType);
    if (rank > highestRank) {
      highestRank = rank;
      highestType = ga.accessType;
    }
  }

  // If direct is admin, effective is readwrite for display purposes
  if (highestType === 'admin') {
    highestType = 'readwrite';
  }

  // Determine source
  const hasDirect = directAccess !== null;
  const contributingGroups = groupAccesses
    .filter((ga) => accessRank(ga.accessType) > 0)
    .map((ga) => ga.groupName);

  let source: AccessSource;

  // If user has direct access but NO override, treat as group inheritance
  if (hasDirect && !hasOverride && contributingGroups.length > 0) {
    // User has direct access from group inheritance (not an override)
    if (contributingGroups.length === 1) {
      source = { type: 'group', groupName: contributingGroups[0] };
    } else {
      source = { type: 'multiple', groups: contributingGroups, hasDirect: false };
    }
  } else if (hasDirect && hasOverride && contributingGroups.length === 0) {
    // Pure override with no group
    source = { type: 'direct' };
  } else if (hasDirect && hasOverride && contributingGroups.length > 0) {
    // Override + group(s) - real "Direct + Group" scenario
    source = { type: 'multiple', groups: contributingGroups, hasDirect: true };
  } else if (!hasDirect && contributingGroups.length === 1) {
    source = { type: 'group', groupName: contributingGroups[0] };
  } else if (!hasDirect && contributingGroups.length > 1) {
    source = { type: 'multiple', groups: contributingGroups, hasDirect: false };
  } else if (hasDirect && contributingGroups.length === 0) {
    // Direct access with no groups
    source = { type: 'direct' };
  } else {
    // Fallback: no access
    source = { type: 'direct' };
  }

  return { effectiveAccess: highestType, source };
}

/**
 * "By Space" perspective: compute one row per user who has access to this space
 * (either directly or via a group).
 */
export function computeSpaceAccessRows(
  spaceDetail: ISpaceDetail,
  groupDetailsMap: Map<string, IGroupDetail>,
): ISpaceAccessRow[] {
  const userMap = new Map<
    string,
    { directAccess: SpaceAccessType | null; groupAccesses: IGroupAccessContribution[]; hasOverride: boolean }
  >();

  // Direct users
  for (const u of spaceDetail.users) {
    userMap.set(u.username, {
      directAccess: u.accessType,
      groupAccesses: [],
      hasOverride: u.hasOverride ?? false,
    });
  }

  // Group members — inherit the group's access to this space
  for (const sg of spaceDetail.groups) {
    const groupDetail = groupDetailsMap.get(sg.groupName);
    if (!groupDetail) continue;

    for (const username of groupDetail.users) {
      if (!userMap.has(username)) {
        userMap.set(username, { directAccess: null, groupAccesses: [], hasOverride: false });
      }
      userMap.get(username)!.groupAccesses.push({
        groupName: sg.groupName,
        accessType: sg.accessType,
      });
    }
  }

  // Resolve each user
  const rows: ISpaceAccessRow[] = [];
  for (const [username, data] of userMap) {
    const { effectiveAccess, source } = resolveEffectiveAccess(
      data.directAccess,
      data.groupAccesses,
      data.hasOverride,
    );
    rows.push({
      username,
      effectiveAccess,
      directAccess: data.directAccess,
      groupAccesses: data.groupAccesses,
      source,
    });
  }

  // Sort: readwrite first, then readonly, then by name
  rows.sort((a, b) => {
    const rankDiff = accessRank(b.effectiveAccess) - accessRank(a.effectiveAccess);
    if (rankDiff !== 0) return rankDiff;
    return a.username.localeCompare(b.username);
  });

  return rows;
}

/**
 * "By User" perspective: compute one row per space the user can access
 * (either directly or via a group).
 */
export function computeUserAccessRows(
  userDetail: IUserDetail,
  groupDetailsMap: Map<string, IGroupDetail>,
): IUserAccessRow[] {
  const spaceMap = new Map<
    string,
    { directAccess: SpaceAccessType | null; groupAccesses: IGroupAccessContribution[]; hasOverride: boolean }
  >();

  // Direct spaces
  for (const s of userDetail.spaces) {
    spaceMap.set(s.spaceName, {
      directAccess: s.accessType,
      groupAccesses: [],
      hasOverride: s.hasOverride ?? false,
    });
  }

  // Spaces from group memberships
  for (const groupName of userDetail.groups) {
    const groupDetail = groupDetailsMap.get(groupName);
    if (!groupDetail) continue;

    for (const gs of groupDetail.spaces) {
      if (!spaceMap.has(gs.spaceName)) {
        spaceMap.set(gs.spaceName, { directAccess: null, groupAccesses: [], hasOverride: false });
      }
      spaceMap.get(gs.spaceName)!.groupAccesses.push({
        groupName,
        accessType: gs.accessType,
      });
    }
  }

  // Resolve each space
  const rows: IUserAccessRow[] = [];
  for (const [spaceName, data] of spaceMap) {
    const { effectiveAccess, source } = resolveEffectiveAccess(
      data.directAccess,
      data.groupAccesses,
      data.hasOverride,
    );
    rows.push({
      spaceName,
      effectiveAccess,
      directAccess: data.directAccess,
      groupAccesses: data.groupAccesses,
      source,
    });
  }

  // Sort: readwrite first, then readonly, then by name
  rows.sort((a, b) => {
    const rankDiff = accessRank(b.effectiveAccess) - accessRank(a.effectiveAccess);
    if (rankDiff !== 0) return rankDiff;
    return a.spaceName.localeCompare(b.spaceName);
  });

  return rows;
}

/**
 * "By Group" perspective: compute one row per space the group accesses,
 * with the list of group members who inherit that access.
 */
export function computeGroupAccessRows(groupDetail: IGroupDetail): IGroupAccessRow[] {
  return groupDetail.spaces.map((gs) => ({
    spaceName: gs.spaceName,
    accessType: gs.accessType,
    inheritingUsers: [...groupDetail.users],
  }));
}
