import { dirname, extname } from 'path';
import type { AssetFileType, AssetFileRole, AssetType } from '../../../../shared/types/asset-catalog.js';

// ──────────────────────────────────────────────
// File Extension Classification
// ──────────────────────────────────────────────

const VIDEO_EXTENSIONS = new Set([
  '.mxf', '.mov', '.mp4', '.m4v', '.avi', '.mkv', '.wmv', '.flv', '.webm',
  '.r3d', '.ari', '.braw', '.dpx', '.dng', '.prores',
  '.mts', '.m2ts', '.ts', '.mpg', '.mpeg', '.mp2',
]);

const AUDIO_EXTENSIONS = new Set([
  '.wav', '.aif', '.aiff', '.mp3', '.aac', '.flac', '.ogg', '.wma',
  '.m4a', '.opus', '.bwf',
]);

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.exr', '.dpx', '.bmp',
  '.gif', '.webp', '.heic', '.heif', '.cr2', '.cr3', '.nef', '.arw', '.orf',
]);

const SIDECAR_EXTENSIONS = new Set([
  '.xml', '.xmp', '.srt', '.edl', '.aaf', '.ale', '.cdl', '.cube',
  '.lut', '.3dl', '.txt', '.csv',
]);

const METADATA_EXTENSIONS = new Set([
  '.bim', '.pmr', '.cpi', '.bdm', '.thm',
]);

/**
 * Classify a file type based on its extension.
 */
export function classifyFileType(fileName: string): AssetFileType {
  const ext = extname(fileName).toLowerCase();
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (SIDECAR_EXTENSIONS.has(ext)) return 'sidecar';
  if (METADATA_EXTENSIONS.has(ext)) return 'metadata';
  return 'unknown';
}

// ──────────────────────────────────────────────
// Name-Based Grouping
// ──────────────────────────────────────────────

/**
 * Known audio channel / stream suffixes that indicate a file is part of a
 * multi-track recording. These are stripped when computing the base name.
 */
const AUDIO_SUFFIX_PATTERN = /[._-](?:a\d+|audio\d*|L|R|LtRt|51|71|mono|stereo|surround|ch\d+)$/i;

/**
 * Known video/stream suffixes.
 */
const VIDEO_SUFFIX_PATTERN = /[._-](?:v\d+|video\d*|V)$/i;

/**
 * Track numbering suffix (e.g., _01, _02) — only stripped if other files share
 * the same base without these numbers.
 */
const TRACK_NUMBER_PATTERN = /[._-](\d{1,3})$/;

/**
 * Extract the grouping base name from a file name.
 * Strips extension and known audio/video/track suffixes.
 */
export function extractBaseName(fileName: string): string {
  // Strip extension
  let name = fileName;
  const ext = extname(name);
  if (ext) {
    name = name.slice(0, -ext.length);
  }

  // Strip known suffixes iteratively (a file could have multiple)
  let prev = '';
  while (prev !== name) {
    prev = name;
    name = name.replace(AUDIO_SUFFIX_PATTERN, '');
    name = name.replace(VIDEO_SUFFIX_PATTERN, '');
  }

  // Strip trailing track numbers
  name = name.replace(TRACK_NUMBER_PATTERN, '');

  return name || fileName; // Fallback to original if everything was stripped
}

// ──────────────────────────────────────────────
// Camera Card Structure Detection
// ──────────────────────────────────────────────

export interface CardStructureInfo {
  type: string;       // 'P2', 'SxS', 'XDCAM', 'Canon_XF', 'DCIM_Canon', 'DCIM_Sony', 'RED', 'ARRI', 'BRAW'
  cardName?: string;
  clipId?: string;
}

/**
 * Detect camera card structure from a file's directory path.
 * Returns card info if a known structure is detected, null otherwise.
 */
export function detectCardStructure(dirPath: string): CardStructureInfo | null {
  const normalized = dirPath.replace(/\\/g, '/');

  // Sony SxS / XDCAM: BPAV/CLPR/<clip>/
  const sxsMatch = normalized.match(/BPAV\/CLPR\/([^/]+)/i);
  if (sxsMatch) {
    return { type: 'SxS', clipId: sxsMatch[1] };
  }

  // Sony XDCAM: XDROOT/Clip/
  if (/XDROOT\/Clip/i.test(normalized)) {
    return { type: 'XDCAM' };
  }

  // Panasonic P2: CONTENTS/VIDEO/ or CONTENTS/AUDIO/ or CONTENTS/CLIP/
  if (/CONTENTS\/(VIDEO|AUDIO|CLIP)\//i.test(normalized)) {
    const cardMatch = normalized.match(/([^/]+)\/CONTENTS\//i);
    return { type: 'P2', cardName: cardMatch?.[1] };
  }

  // Canon XF / C300: CONTENTS/CLIPS\d+/
  const canonXfMatch = normalized.match(/CONTENTS\/CLIPS(\d+)\//i);
  if (canonXfMatch) {
    return { type: 'Canon_XF' };
  }

  // DSLR SD card Canon: DCIM/\d+CANON/
  const dcimCanonMatch = normalized.match(/DCIM\/(\d+CANON)\//i);
  if (dcimCanonMatch) {
    return { type: 'DCIM_Canon', cardName: dcimCanonMatch[1] };
  }

  // DSLR SD card Sony: DCIM/\d+MSDCF/ or PRIVATE/M4ROOT/CLIP/
  if (/DCIM\/\d+MSDCF\//i.test(normalized) || /PRIVATE\/M4ROOT\/CLIP\//i.test(normalized)) {
    return { type: 'DCIM_Sony' };
  }

  // Generic DCIM (any camera)
  if (/DCIM\/\d+[A-Z]+\//i.test(normalized)) {
    const dcimMatch = normalized.match(/DCIM\/(\d+[A-Z]+)\//i);
    return { type: 'DCIM', cardName: dcimMatch?.[1] };
  }

  return null;
}

// ──────────────────────────────────────────────
// Asset Grouping
// ──────────────────────────────────────────────

export interface FileEntry {
  path: string;         // Relative to space Content root
  name: string;
  size: number;
  mtime: number;
  inode?: number;
  isArchiveStub?: boolean;
}

export interface AssetGroup {
  baseName: string;
  directoryPath: string;
  files: GroupedFile[];
  assetType: AssetType;
  cardStructure: CardStructureInfo | null;
}

export interface GroupedFile {
  entry: FileEntry;
  fileType: AssetFileType;
  role: AssetFileRole;
}

/**
 * Determine the asset type based on the files in a group.
 */
function determineAssetType(files: GroupedFile[], cardStructure: CardStructureInfo | null): AssetType {
  // Card structure overrides
  if (cardStructure?.type === 'P2' || cardStructure?.type === 'SxS' || cardStructure?.type === 'XDCAM') {
    return 'avid_mxf';
  }

  const hasVideo = files.some((f) => f.fileType === 'video');
  const hasAudio = files.some((f) => f.fileType === 'audio');
  const hasImage = files.some((f) => f.fileType === 'image');
  const hasMxf = files.some((f) => f.entry.name.toLowerCase().endsWith('.mxf'));

  if (hasMxf) return 'avid_mxf';
  if (hasVideo) return 'video';
  if (hasAudio && !hasImage) return 'audio';
  if (hasImage && !hasAudio) return 'image';
  if (hasImage) return 'sequence';
  return 'generic';
}

/**
 * Determine file role within an asset group.
 * Primary = the "main" file (typically the largest video, or largest file overall).
 */
function assignRoles(files: GroupedFile[]): void {
  if (files.length === 0) return;

  // Find the primary: largest video, or largest file if no video
  const videoFiles = files.filter((f) => f.fileType === 'video');
  const candidatePool = videoFiles.length > 0 ? videoFiles : files.filter((f) => f.fileType !== 'sidecar' && f.fileType !== 'metadata');
  const pool = candidatePool.length > 0 ? candidatePool : files;

  let primaryIdx = 0;
  let maxSize = 0;
  for (let i = 0; i < pool.length; i++) {
    if (pool[i].entry.size > maxSize) {
      maxSize = pool[i].entry.size;
      primaryIdx = i;
    }
  }

  const primaryFile = pool[primaryIdx];

  for (const f of files) {
    if (f === primaryFile) {
      f.role = 'primary';
    } else if (f.fileType === 'sidecar' || f.fileType === 'metadata') {
      f.role = 'sidecar';
    } else {
      f.role = 'component';
    }
  }
}

/**
 * Group an array of file entries from a single space into asset groups.
 * Files in the same directory sharing the same base name are grouped together.
 */
export function groupFilesIntoAssets(entries: FileEntry[]): AssetGroup[] {
  // Group entries by directory
  const byDir = new Map<string, FileEntry[]>();
  for (const entry of entries) {
    const dir = dirname(entry.path);
    let dirEntries = byDir.get(dir);
    if (!dirEntries) {
      dirEntries = [];
      byDir.set(dir, dirEntries);
    }
    dirEntries.push(entry);
  }

  const assets: AssetGroup[] = [];

  for (const [dirPath, dirEntries] of byDir) {
    const cardStructure = detectCardStructure(dirPath);

    // Group by base name within this directory
    const byBaseName = new Map<string, GroupedFile[]>();

    for (const entry of dirEntries) {
      const base = extractBaseName(entry.name);
      const fileType = classifyFileType(entry.name);

      let group = byBaseName.get(base);
      if (!group) {
        group = [];
        byBaseName.set(base, group);
      }

      group.push({
        entry,
        fileType,
        role: 'component', // Will be reassigned by assignRoles
      });
    }

    for (const [baseName, files] of byBaseName) {
      assignRoles(files);
      const assetType = determineAssetType(files, cardStructure);

      assets.push({
        baseName,
        directoryPath: dirPath,
        files,
        assetType,
        cardStructure,
      });
    }
  }

  return assets;
}
