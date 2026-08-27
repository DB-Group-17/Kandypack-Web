/**
 * @file scripts/migrate.ts
 * @description Production-grade migration runner with execution history tracking.
 * 
 * Features:
 * - Uses a `_schema_migrations` table to track applied migrations.
 * - Skips already-executed migration files automatically.
 * - Executes only new/pending migrations in sequential order.
 * - Safe to run repeatedly at any time (idempotent).
 */

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

/**
 * Ensures the migration tracking table exists.
 * @param connection Active MySQL database connection
 */
async function ensureMigrationTable(connection: mysql.Connection): Promise<void> {
  const sql = `
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      migration_id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  await connection.query(sql);
}

/**
 * Retrieves the list of already applied migration filenames.
 * @param connection Active MySQL database connection
 * @returns Set of applied migration filenames
 */
async function getAppliedMigrations(connection: mysql.Connection): Promise<Set<string>> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    'SELECT filename FROM _schema_migrations ORDER BY migration_id ASC'
  );
  return new Set(rows.map((row) => row.filename as string));
}

/**
 * Main migration execution function.
 */
async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl || databaseUrl.includes('<user>') || databaseUrl.includes('<password>')) {
    console.error('❌ Error: DATABASE_URL is not properly configured in .env.local.');
    console.error('Please set a valid MySQL connection URI in .env.local before running migrations.');
    process.exit(1);
  }

  console.log('🔄 Connecting to MySQL database...');
  let connection: mysql.Connection | null = null;

  try {
    connection = await mysql.createConnection({
      uri: databaseUrl,
      multipleStatements: true,
      ssl: {
        rejectUnauthorized: false
      }
    });

    console.log('✅ Connected to MySQL successfully.');

    // 1. Ensure tracking table exists
    await ensureMigrationTable(connection);

    // 2. Read all migration files from disk
    const migrationsDir = path.resolve(process.cwd(), 'db/migrations');
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found at: ${migrationsDir}`);
    }

    const allFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    // 3. Compare with already executed migrations
    const appliedMigrations = await getAppliedMigrations(connection);
    const pendingFiles = allFiles.filter((file) => !appliedMigrations.has(file));

    if (pendingFiles.length === 0) {
      console.log('✨ All migrations are up to date! No new migrations to run.\n');
      return;
    }

    console.log(`\n📋 Found ${pendingFiles.length} pending migration(s) to execute:`);
    pendingFiles.forEach((file, idx) => console.log(`   ${idx + 1}. ${file}`));
    console.log('');

    // 4. Run each pending migration and record it in _schema_migrations
    for (const file of pendingFiles) {
      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf-8').trim();

      if (!sqlContent) {
        console.log(`⏩ Skipping empty file: ${file}`);
        continue;
      }

      console.log(`⏳ Applying migration: ${file}...`);
      const startTime = Date.now();

      // Execute SQL migration
      await connection.query(sqlContent);

      // Record migration in history table
      await connection.query(
        'INSERT INTO _schema_migrations (filename) VALUES (?)',
        [file]
      );

      const elapsed = Date.now() - startTime;
      console.log(`  ✅ Finished ${file} (${elapsed}ms)`);
    }

    console.log('\n🎉 All pending migrations applied successfully!');
  } catch (error: unknown) {
    console.error('\n❌ Migration failed with error:');
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed.');
    }
  }
}

// Execute runner
runMigrations().catch((err) => {
  console.error('Unhandled exception during migration:', err);
  process.exit(1);
});
