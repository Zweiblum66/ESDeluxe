import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { logger } from '../utils/logger.js';

/**
 * Local JSON store for group-space access types.
 *
 * The EditShare API does not expose whether a group was added to a space
 * with readonly or readwrite access (it only returns a flat list of group names).
 * This store tracks the access type locally so the UI can display and toggle it.
 *
 * File format: { "spaceName:groupName": "readonly" | "readwrite" }
 */

const DATA_DIR = join(process.cwd(), 'data');
const STORE_FILE = join(DATA_DIR, 'group-access.json');

type AccessMap = Record<string, 'readonly' | 'readwrite'>;

let cache: AccessMap | null = null;

function makeKey(spaceName: string, groupName: string): string {
  return `${spaceName}:${groupName}`;
}

async function load(): Promise<AccessMap> {
  if (cache) return cache;
  try {
    const raw = await readFile(STORE_FILE, 'utf-8');
    cache = JSON.parse(raw) as AccessMap;
  } catch {
    cache = {};
  }
  return cache;
}

async function save(): Promise<void> {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(STORE_FILE, JSON.stringify(cache ?? {}, null, 2), 'utf-8');
  } catch (err) {
    logger.error({ err }, 'Failed to save group access store');
  }
}

/**
 * Get access type for a group on a space.
 * Returns 'readwrite' if not tracked.
 */
export async function getGroupAccessType(
  spaceName: string,
  groupName: string,
): Promise<'readonly' | 'readwrite'> {
  const map = await load();
  return map[makeKey(spaceName, groupName)] ?? 'readwrite';
}

/**
 * Get access types for all groups on a space.
 * Returns a map of groupName → accessType.
 */
export async function getSpaceGroupAccessTypes(
  spaceName: string,
  groupNames: string[],
): Promise<Record<string, 'readonly' | 'readwrite'>> {
  const map = await load();
  const result: Record<string, 'readonly' | 'readwrite'> = {};
  for (const groupName of groupNames) {
    result[groupName] = map[makeKey(spaceName, groupName)] ?? 'readwrite';
  }
  return result;
}

/**
 * Get access types for all spaces a group has access to.
 * Returns a map of spaceName → accessType.
 */
export async function getGroupSpaceAccessTypes(
  groupName: string,
  spaceNames: string[],
): Promise<Record<string, 'readonly' | 'readwrite'>> {
  const map = await load();
  const result: Record<string, 'readonly' | 'readwrite'> = {};
  for (const spaceName of spaceNames) {
    result[spaceName] = map[makeKey(spaceName, groupName)] ?? 'readwrite';
  }
  return result;
}

/**
 * Set access type for a group on a space.
 */
export async function setGroupAccessType(
  spaceName: string,
  groupName: string,
  accessType: 'readonly' | 'readwrite',
): Promise<void> {
  const map = await load();
  map[makeKey(spaceName, groupName)] = accessType;
  cache = map;
  await save();
  logger.info({ spaceName, groupName, accessType }, `Group access type set: ${groupName} → ${accessType} on ${spaceName}`);
}

/**
 * Remove tracking for a group-space pair (e.g. when group is removed from space).
 */
export async function removeGroupAccessType(
  spaceName: string,
  groupName: string,
): Promise<void> {
  const map = await load();
  delete map[makeKey(spaceName, groupName)];
  cache = map;
  await save();
}
