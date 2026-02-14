// ──────────────────────────────────────────────
// Asset Type Enums
// ──────────────────────────────────────────────

export type AssetType = 'generic' | 'video' | 'audio' | 'image' | 'avid_mxf' | 'sequence';
export type AssetFileType = 'video' | 'audio' | 'image' | 'sidecar' | 'metadata' | 'unknown';
export type AssetFileRole = 'primary' | 'component' | 'sidecar';
export type ProxyStatus = 'none' | 'queued' | 'generating' | 'ready' | 'failed' | 'unsupported';
export type ScanStatus = 'running' | 'completed' | 'failed' | 'cancelled';
export type ScanType = 'manual' | 'scheduled';
export type AssetArchiveStatus = 'online' | 'partial' | 'archived';
export type CatalogJobStatus = 'pending' | 'claimed' | 'processing' | 'completed' | 'failed';
export type CatalogJobType = 'full' | 'proxy' | 'metadata';

// ──────────────────────────────────────────────
// Asset & Asset File Interfaces
// ──────────────────────────────────────────────

/** Metadata extracted from the primary file via ffprobe / exiftool */
export interface IAssetMetadata {
  // Technical (ffprobe)
  codec?: string;
  codecProfile?: string;
  pixelFormat?: string;
  width?: number;
  height?: number;
  frameRate?: number;
  aspectRatio?: string;
  duration?: number;        // seconds
  bitrate?: number;         // bits/s
  sampleRate?: number;
  audioChannels?: number;
  containerFormat?: string;
  // Camera (exiftool)
  cameraMake?: string;
  cameraModel?: string;
  cameraSerial?: string;
  lensInfo?: string;
  focalLength?: string;
  aperture?: string;
  iso?: number;
  shutterSpeed?: string;
  dateTimeOriginal?: string;
  gpsLatitude?: number;
  gpsLongitude?: number;
  colorSpace?: string;
  gamma?: string;
  whiteBalance?: string;
  // MXF-specific
  umid?: string;
  timecodeStart?: string;
  // Card structure
  cardStructure?: {
    type: string;           // 'P2', 'SxS', 'XDCAM', 'Canon_XF', 'DCIM_Canon', 'DCIM_Sony', 'RED', 'ARRI', 'BRAW'
    cardName?: string;
    clipId?: string;
  };
  // Raw data for anything not explicitly typed
  [key: string]: unknown;
}

/** A logical asset grouping of related files */
export interface IAsset {
  id: number;
  spaceName: string;
  directoryPath: string;
  name: string;
  assetType: AssetType;
  fileCount: number;
  totalSize: number;
  primaryFileId?: number;
  thumbnailPath?: string;
  proxyPath?: string;
  proxyStatus: ProxyStatus;
  metadata?: IAssetMetadata;
  firstSeenAt: number;
  lastScannedAt: number;
  createdAt: number;
  updatedAt: number;
  // Joined data (populated on detail queries)
  files?: IAssetFile[];
  primaryFile?: IAssetFile;
  archiveStatus?: AssetArchiveStatus;
}

/** An individual file belonging to an asset */
export interface IAssetFile {
  id: number;
  assetId: number;
  spaceName: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  fileMtime: number;
  fileType: AssetFileType;
  role: AssetFileRole;
  checksum?: string;
  checksumComputedAt?: number;
  isArchiveStub: boolean;
  inode?: number;
  createdAt: number;
  updatedAt: number;
}

// ──────────────────────────────────────────────
// Scan Types
// ──────────────────────────────────────────────

export interface IAssetScanLog {
  id: number;
  spaceName: string;
  scanType: ScanType;
  status: ScanStatus;
  filesDiscovered: number;
  filesNew: number;
  filesUpdated: number;
  filesRemoved: number;
  assetsCreated: number;
  assetsUpdated: number;
  errorMessage?: string;
  jobsQueued?: number;
  startedAt: number;
  completedAt?: number;
}

export interface IAssetScanConfig {
  spaceName: string;
  enabled: boolean;
  intervalHours: number;
  lastScanAt?: number;
  nextScanAt?: number;
}

export interface IAssetScanSchedulerStatus {
  isRunning: boolean;
  enabledSpaceCount: number;
  lastCheckAt?: number;
  nextCheckAt?: number;
}

// ──────────────────────────────────────────────
// Query / Filter Types
// ──────────────────────────────────────────────

export interface IAssetCatalogQuery {
  spaceName?: string;
  directoryPath?: string;
  assetType?: AssetType;
  searchTerm?: string;
  proxyStatus?: ProxyStatus;
  archiveStatus?: AssetArchiveStatus;
  limit?: number;
  offset?: number;
}

export interface IAssetCatalogResult {
  assets: IAsset[];
  total: number;
}

// ──────────────────────────────────────────────
// Stats
// ──────────────────────────────────────────────

export interface IAssetCatalogStats {
  totalAssets: number;
  totalFiles: number;
  totalSize: number;
  byType: { assetType: AssetType; count: number; totalSize: number }[];
  bySpace: { spaceName: string; assetCount: number; fileCount: number; totalSize: number }[];
  recentScans: IAssetScanLog[];
}

// ──────────────────────────────────────────────
// Request Types
// ──────────────────────────────────────────────

export interface IScanSpaceRequest {
  spaceName: string;
}

export interface IGroupFilesRequest {
  spaceName: string;
  filePaths: string[];
  assetName: string;
}

export interface IUngroupAssetRequest {
  assetId: number;
}

// ──────────────────────────────────────────────
// Catalog Job Types
// ──────────────────────────────────────────────

export interface ICatalogJob {
  id: number;
  assetId: number;
  spaceName: string;
  primaryFilePath: string;
  assetType: AssetType;
  jobType: CatalogJobType;
  status: CatalogJobStatus;
  workerId?: string;
  stage?: string;
  errorMessage?: string;
  attempts: number;
  maxAttempts: number;
  claimedAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface ICatalogJobStats {
  pending: number;
  claimed: number;
  processing: number;
  completed: number;
  failed: number;
}
