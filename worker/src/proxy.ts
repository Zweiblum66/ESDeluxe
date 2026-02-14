import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdir } from 'fs/promises';
import { join, basename } from 'path';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

let _ffmpegAvailable: boolean | null = null;

// ──────────────────────────────────────────────
// Tool Check
// ──────────────────────────────────────────────

export async function checkFfmpegAvailable(): Promise<boolean> {
    try {
        await execFileAsync('which', ['ffmpeg']);
        _ffmpegAvailable = true;
        logger.info('ffmpeg available');
    } catch {
        _ffmpegAvailable = false;
        logger.warn('ffmpeg not found — proxy generation disabled');
    }
    return _ffmpegAvailable;
}

export function isFFmpegAvailable(): boolean {
    return _ffmpegAvailable === true;
}

// ──────────────────────────────────────────────
// FFmpeg Proxy Generation
// ──────────────────────────────────────────────

/**
 * Generate a video thumbnail (JPEG) at 2 seconds in.
 */
async function generateVideoThumbnail(inputPath: string, outputPath: string): Promise<void> {
    await execFileAsync('ffmpeg', [
        '-y',
        '-ss', '2',             // Seek to 2s
        '-i', inputPath,
        '-vframes', '1',
        '-vf', 'scale=480:-2',
        '-q:v', '4',            // JPEG quality (2=best, 31=worst)
        outputPath,
    ], { timeout: 60_000 });
}

/**
 * Generate a video proxy (H.264 MP4, 720p, low bitrate).
 */
async function generateVideoProxy(inputPath: string, outputPath: string): Promise<void> {
    await execFileAsync('ffmpeg', [
        '-y',
        '-i', inputPath,
        '-vf', 'scale=-2:720',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '28',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ac', '2',             // Stereo
        '-movflags', '+faststart',
        outputPath,
    ], { timeout: 600_000 });   // 10 min timeout
}

/**
 * Generate an audio proxy (MP3, 128kbps).
 */
async function generateAudioProxy(inputPath: string, outputPath: string): Promise<void> {
    await execFileAsync('ffmpeg', [
        '-y',
        '-i', inputPath,
        '-c:a', 'libmp3lame',
        '-b:a', '128k',
        '-ac', '2',
        outputPath,
    ], { timeout: 120_000 });
}

/**
 * Generate an audio waveform thumbnail (PNG).
 */
async function generateAudioWaveform(inputPath: string, outputPath: string): Promise<void> {
    await execFileAsync('ffmpeg', [
        '-y',
        '-i', inputPath,
        '-filter_complex', 'showwavespic=s=480x120:colors=#3b82f6',
        '-frames:v', '1',
        outputPath,
    ], { timeout: 60_000 });
}

/**
 * Generate an image thumbnail (JPEG, scaled to 480px width).
 */
async function generateImageThumbnail(inputPath: string, outputPath: string): Promise<void> {
    await execFileAsync('ffmpeg', [
        '-y',
        '-i', inputPath,
        '-vf', 'scale=480:-2',
        '-q:v', '4',
        outputPath,
    ], { timeout: 60_000 });
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

export interface ProxyResult {
    thumbnailPath?: string;
    proxyPath?: string;
    proxyStatus: string;
}

/**
 * Generate proxies and thumbnails for an asset.
 * @param inputPath  Absolute path to the source media file
 * @param outputDir  Directory where proxy files should be written
 * @param assetType  The type of asset being processed
 * @returns Paths to generated files and resulting proxy status
 */
export async function generateProxies(inputPath: string, outputDir: string, assetType: string): Promise<ProxyResult> {
    if (!_ffmpegAvailable) {
        return { proxyStatus: 'failed' };
    }

    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true });

    const baseName = basename(inputPath).replace(/\.[^.]+$/, '');

    try {
        switch (assetType) {
            case 'video':
            case 'avid_mxf':
            case 'sequence': {
                const thumbPath = join(outputDir, `${baseName}_thumb.jpg`);
                const proxyPath = join(outputDir, `${baseName}_proxy.mp4`);

                // Generate thumbnail first (fast), then proxy (slow)
                await generateVideoThumbnail(inputPath, thumbPath);
                logger.debug({ inputPath }, 'Video thumbnail generated');

                await generateVideoProxy(inputPath, proxyPath);
                logger.debug({ inputPath }, 'Video proxy generated');

                return {
                    thumbnailPath: thumbPath,
                    proxyPath,
                    proxyStatus: 'ready',
                };
            }

            case 'audio': {
                const thumbPath = join(outputDir, `${baseName}_waveform.png`);
                const proxyPath = join(outputDir, `${baseName}_proxy.mp3`);

                await generateAudioWaveform(inputPath, thumbPath);
                logger.debug({ inputPath }, 'Audio waveform generated');

                await generateAudioProxy(inputPath, proxyPath);
                logger.debug({ inputPath }, 'Audio proxy generated');

                return {
                    thumbnailPath: thumbPath,
                    proxyPath,
                    proxyStatus: 'ready',
                };
            }

            case 'image': {
                const thumbPath = join(outputDir, `${baseName}_thumb.jpg`);

                await generateImageThumbnail(inputPath, thumbPath);
                logger.debug({ inputPath }, 'Image thumbnail generated');

                return {
                    thumbnailPath: thumbPath,
                    proxyStatus: 'ready',
                };
            }

            default:
                return { proxyStatus: 'unsupported' };
        }
    } catch (err) {
        logger.error({ err, inputPath, assetType }, 'Proxy generation failed');
        throw err;
    }
}
