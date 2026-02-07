import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { existsSync } from 'fs';
import { resolve, join } from 'path';
import { requestLogger } from './middleware/requestLogger.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { NotFoundError } from './utils/errors.js';
import { logger } from './utils/logger.js';
import routes from './routes/index.js';

/**
 * Resolves the frontend dist directory.
 * In production deployment on the server, the structure is:
 *   /opt/es-manager/server/dist/server/src/  (compiled backend)
 *   /opt/es-manager/client/dist/             (frontend build)
 */
function resolveFrontendDir(): string | null {
  // Try relative to project root (deployment layout)
  const candidates = [
    resolve(process.cwd(), 'client', 'dist'),
    resolve(process.cwd(), '..', 'client', 'dist'),
    resolve(__dirname, '..', '..', '..', '..', 'client', 'dist'),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'index.html'))) {
      return candidate;
    }
  }
  return null;
}

/**
 * Creates and configures the Express application.
 */
export function createApp(): express.Application {
  const app = express();

  // --- Security & parsing middleware ---
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allow frontend inline scripts (Vite)
    }),
  );

  // --- Request logging ---
  app.use(requestLogger);

  // --- Authentication ---
  app.use(authMiddleware);

  // --- API routes ---
  app.use('/api/v1', routes);

  // --- Serve frontend static files in production ---
  const frontendDir = resolveFrontendDir();
  if (frontendDir) {
    logger.info({ frontendDir }, 'Serving frontend static files');

    // Serve static assets (JS, CSS, images, fonts)
    app.use(
      '/assets',
      express.static(join(frontendDir, 'assets'), {
        maxAge: '1y',
        immutable: true,
      }),
    );

    // Serve other static files
    app.use(express.static(frontendDir, { index: false }));

    // SPA fallback: all non-API routes serve index.html
    app.get('*', (_req, res) => {
      res.sendFile(join(frontendDir, 'index.html'));
    });
  } else {
    logger.info('No frontend dist found - API-only mode');

    // --- 404 handler for unknown routes ---
    app.use((_req, _res, next) => {
      next(new NotFoundError('Route'));
    });
  }

  // --- Global error handler ---
  app.use(errorHandler);

  return app;
}
