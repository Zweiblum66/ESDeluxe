import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils/logger.js';
import type { IAssetMetadata } from '../../../../shared/types/asset-catalog.js';

const execFileAsync = promisify(execFile);

let _ffprobeAvailable: boolean | null = null;
let _exiftoolAvailable: boolean | null = null;

// ──────────────────────────────────────────────
// Tool Availability Checks
// ──────────────────────────────────────────────

/**
 * Check if ffprobe is available on the system.
 */
export async function checkFfprobeAvailable(): Promise<boolean> {
  if (_ffprobeAvailable !== null) return _ffprobeAvailable;
  try {
    await execFileAsync('which', ['ffprobe']);
    _ffprobeAvailable = true;
    logger.info('ffprobe available for metadata extraction');
  } catch {
    _ffprobeAvailable = false;
    logger.warn('ffprobe not found — technical metadata extraction disabled');
  }
  return _ffprobeAvailable;
}

/**
 * Check if exiftool is available on the system.
 */
export async function checkExiftoolAvailable(): Promise<boolean> {
  if (_exiftoolAvailable !== null) return _exiftoolAvailable;
  try {
    await execFileAsync('which', ['exiftool']);
    _exiftoolAvailable = true;
    logger.info('exiftool available for EXIF/MXF metadata extraction');
  } catch {
    _exiftoolAvailable = false;
    logger.info('exiftool not found — EXIF/MXF metadata extraction disabled (optional)');
  }
  return _exiftoolAvailable;
}

export function isFfprobeAvailable(): boolean {
  return _ffprobeAvailable === true;
}

export function isExiftoolAvailable(): boolean {
  return _exiftoolAvailable === true;
}

// ──────────────────────────────────────────────
// FFprobe Metadata Extraction
// ──────────────────────────────────────────────

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  pix_fmt?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  display_aspect_ratio?: string;
  sample_rate?: string;
  channels?: number;
}

interface FfprobeFormat {
  format_name?: string;
  duration?: string;
  bit_rate?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

async function extractFfprobeMetadata(absPath: string): Promise<Partial<IAssetMetadata>> {
  if (!_ffprobeAvailable) return {};

  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      absPath,
    ], { timeout: 30_000 });

    const data: FfprobeOutput = JSON.parse(stdout);
    const meta: Partial<IAssetMetadata> = {};

    // Format info
    if (data.format) {
      meta.containerFormat = data.format.format_name;
      if (data.format.duration) meta.duration = parseFloat(data.format.duration);
      if (data.format.bit_rate) meta.bitrate = parseInt(data.format.bit_rate, 10);
    }

    // Video stream
    const videoStream = data.streams?.find((s) => s.codec_type === 'video');
    if (videoStream) {
      meta.codec = videoStream.codec_name;
      meta.codecProfile = videoStream.profile;
      meta.pixelFormat = videoStream.pix_fmt;
      meta.width = videoStream.width;
      meta.height = videoStream.height;
      meta.aspectRatio = videoStream.display_aspect_ratio;

      if (videoStream.r_frame_rate) {
        const parts = videoStream.r_frame_rate.split('/');
        if (parts.length === 2) {
          const num = parseInt(parts[0], 10);
          const den = parseInt(parts[1], 10);
          if (den > 0) meta.frameRate = Math.round((num / den) * 100) / 100;
        }
      }
    }

    // Audio stream
    const audioStream = data.streams?.find((s) => s.codec_type === 'audio');
    if (audioStream) {
      if (audioStream.sample_rate) meta.sampleRate = parseInt(audioStream.sample_rate, 10);
      meta.audioChannels = audioStream.channels;
      // If no video, use audio codec info
      if (!videoStream) {
        meta.codec = audioStream.codec_name;
      }
    }

    return meta;
  } catch (err) {
    logger.debug({ err, path: absPath }, 'ffprobe metadata extraction failed');
    return {};
  }
}

// ──────────────────────────────────────────────
// ExifTool Metadata Extraction
// ──────────────────────────────────────────────

async function extractExiftoolMetadata(absPath: string): Promise<Partial<IAssetMetadata>> {
  if (!_exiftoolAvailable) return {};

  try {
    const { stdout } = await execFileAsync('exiftool', [
      '-json',
      '-G',               // Group tag names (e.g., EXIF:Make)
      '-n',               // Numeric output (no formatting)
      '-s',               // Short tag names
      absPath,
    ], { timeout: 30_000 });

    const results = JSON.parse(stdout);
    if (!Array.isArray(results) || results.length === 0) return {};

    const data = results[0];
    const meta: Partial<IAssetMetadata> = {};

    // Camera info
    meta.cameraMake = data['EXIF:Make'] ?? data['MakerNotes:Make'] ?? undefined;
    meta.cameraModel = data['EXIF:Model'] ?? data['MakerNotes:Model'] ?? undefined;
    meta.cameraSerial = data['EXIF:SerialNumber'] ?? data['MakerNotes:SerialNumber'] ?? undefined;

    // Lens
    meta.lensInfo = data['EXIF:LensModel'] ?? data['EXIF:LensInfo'] ?? undefined;
    meta.focalLength = data['EXIF:FocalLength'] ? `${data['EXIF:FocalLength']}mm` : undefined;
    meta.aperture = data['EXIF:FNumber'] ? `f/${data['EXIF:FNumber']}` : undefined;
    meta.iso = data['EXIF:ISO'] ?? undefined;
    meta.shutterSpeed = data['EXIF:ExposureTime'] ? `${data['EXIF:ExposureTime']}s` : undefined;

    // Date
    meta.dateTimeOriginal = data['EXIF:DateTimeOriginal'] ?? data['EXIF:CreateDate'] ?? undefined;

    // GPS
    if (data['EXIF:GPSLatitude'] !== undefined) meta.gpsLatitude = data['EXIF:GPSLatitude'];
    if (data['EXIF:GPSLongitude'] !== undefined) meta.gpsLongitude = data['EXIF:GPSLongitude'];

    // Color
    meta.colorSpace = data['EXIF:ColorSpace'] ?? data['ICC_Profile:ColorSpaceData'] ?? undefined;
    meta.whiteBalance = data['EXIF:WhiteBalance'] !== undefined
      ? (data['EXIF:WhiteBalance'] === 0 ? 'Auto' : 'Manual')
      : undefined;

    // MXF-specific
    meta.umid = data['MXF:MaterialPackageUMID'] ?? data['XMP:UMID'] ?? undefined;
    meta.timecodeStart = data['MXF:TimecodeStart'] ?? data['QuickTime:TimeCode'] ?? undefined;

    return meta;
  } catch (err) {
    logger.debug({ err, path: absPath }, 'exiftool metadata extraction failed');
    return {};
  }
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Extract metadata from a file using all available tools.
 * Merges ffprobe (technical) and exiftool (EXIF/MXF/camera) results.
 */
export async function extractMetadata(absPath: string): Promise<IAssetMetadata> {
  const [ffprobeMeta, exifMeta] = await Promise.all([
    extractFfprobeMetadata(absPath),
    extractExiftoolMetadata(absPath),
  ]);

  // Merge: exiftool takes precedence for camera data, ffprobe for technical
  const merged: IAssetMetadata = {
    ...ffprobeMeta,
    ...exifMeta,
  };

  // If ffprobe extracted duration/bitrate/codec and exiftool overwrote them, restore
  if (ffprobeMeta.codec && !exifMeta.codec) merged.codec = ffprobeMeta.codec;
  if (ffprobeMeta.duration !== undefined) merged.duration = ffprobeMeta.duration;
  if (ffprobeMeta.bitrate !== undefined) merged.bitrate = ffprobeMeta.bitrate;
  if (ffprobeMeta.width !== undefined) merged.width = ffprobeMeta.width;
  if (ffprobeMeta.height !== undefined) merged.height = ffprobeMeta.height;

  // Remove undefined keys for cleaner JSON storage
  for (const key of Object.keys(merged)) {
    if ((merged as Record<string, unknown>)[key] === undefined) {
      delete (merged as Record<string, unknown>)[key];
    }
  }

  return merged;
}
