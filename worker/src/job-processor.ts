import { join } from 'path';
import { access } from 'fs/promises';
import { logger } from './logger.js';
import { extractMetadata } from './metadata.js';
import { generateProxies } from './proxy.js';

/**
 * Process a claimed job: extract metadata and generate proxies.
 * Returns the combined result to be reported back to the manager.
 */
export async function processJob(claim: any): Promise<Record<string, any>> {
    const absPath = join(claim.contentRoot, claim.job.primaryFilePath);
    const proxyDir = join(claim.catalogDataPath, 'proxies', claim.job.spaceName, String(claim.job.assetId));

    // Verify source file exists
    try {
        await access(absPath);
    } catch {
        throw new Error(`Source file not accessible: ${absPath}`);
    }

    const result: Record<string, any> = {};

    // Step 1: Extract metadata (ffprobe + exiftool)
    if (claim.job.jobType !== 'proxy') {
        logger.info({ jobId: claim.job.id, path: claim.job.primaryFilePath }, 'Extracting metadata...');
        try {
            result.metadata = await extractMetadata(absPath);
            logger.info({ jobId: claim.job.id, keys: Object.keys(result.metadata).length }, 'Metadata extracted');
        } catch (err) {
            logger.warn({ err, jobId: claim.job.id }, 'Metadata extraction failed (non-fatal)');
            // Non-fatal: continue to proxy generation
        }
    }

    // Step 2: Generate proxy + thumbnail (ffmpeg)
    if (claim.job.jobType !== 'metadata') {
        logger.info({ jobId: claim.job.id, type: claim.job.assetType, path: claim.job.primaryFilePath }, 'Generating proxies...');
        try {
            const proxyResult = await generateProxies(absPath, proxyDir, claim.job.assetType);
            result.thumbnailPath = proxyResult.thumbnailPath;
            result.proxyPath = proxyResult.proxyPath;
            result.proxyStatus = proxyResult.proxyStatus;
            logger.info({ jobId: claim.job.id, status: proxyResult.proxyStatus }, 'Proxy generation completed');
        } catch (err) {
            logger.error({ err, jobId: claim.job.id }, 'Proxy generation failed');
            result.proxyStatus = 'failed';
        }
    }

    // If we only did metadata and no proxy work, set status appropriately
    if (!result.proxyStatus && claim.job.jobType === 'metadata') {
        result.proxyStatus = undefined; // Don't change proxy status for metadata-only jobs
    }

    return result;
}
