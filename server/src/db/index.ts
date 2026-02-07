import Database from 'better-sqlite3';
import { readdirSync, readFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { logger } from '../utils/logger.js';

let db: Database.Database | null = null;

/**
 * Initializes the SQLite database:
 * - Creates/opens the database file in the project data/ directory
 * - Enables WAL mode for better concurrent performance
 * - Runs all migration files in order
 */
export function initDatabase(): Database.Database {
  // Use cwd (set by PM2 to project root) for the data directory
  const dataDir = resolve(process.cwd(), 'data');
  mkdirSync(dataDir, { recursive: true });
  const dbPath = join(dataDir, 'es-manager.db');

  logger.info({ path: dbPath }, 'Initializing database');

  db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Run migrations
  runMigrations(db);

  logger.info('Database initialized successfully');
  return db;
}

/**
 * Runs all SQL migration files from the migrations/ directory in alphabetical order.
 * Uses a simple tracking table to avoid re-running migrations.
 */
function runMigrations(database: Database.Database): void {
  // Create migrations tracking table
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  const migrationsDir = join(__dirname, 'migrations');
  let files: string[];

  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch {
    logger.warn({ dir: migrationsDir }, 'Migrations directory not found, skipping');
    return;
  }

  const applied = new Set(
    database
      .prepare('SELECT name FROM _migrations')
      .all()
      .map((row) => (row as { name: string }).name),
  );

  const runMigration = database.transaction((name: string, sql: string) => {
    database.exec(sql);
    database.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name);
  });

  for (const file of files) {
    if (applied.has(file)) {
      logger.debug({ migration: file }, 'Migration already applied, skipping');
      continue;
    }

    logger.info({ migration: file }, `Applying migration: ${file}`);
    const sql = readFileSync(join(migrationsDir, file), 'utf-8');
    runMigration(file, sql);
  }
}

/**
 * Returns the singleton database instance.
 * Throws if not initialized.
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Closes the database connection gracefully.
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    logger.info('Database connection closed');
  }
}
