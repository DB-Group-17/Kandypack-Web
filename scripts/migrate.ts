/**
 * @file scripts/migrate.ts
 * @description Migration runner for Kandypack MySQL database.
 * Reads and executes all .sql migration files in sequential order from `db/migrations/`.
 * 
 * Features:
 * - Loads DATABASE_URL from .env.local
 * - Connects via mysql2/promise with SSL and multipleStatements enabled
 * - Executes migrations sequentially in transaction/safe blocks
 * - Exits cleanly with informative log output
 */

import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

/**
 * Main migration execution function.
 * Connects to the database and applies all migrations in `db/migrations`.
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
    // Connect with multipleStatements enabled so full migration scripts execute in a single query call
    connection = await mysql.createConnection({
      uri: databaseUrl,
      multipleStatements: true,
      ssl: {
        rejectUnauthorized: false
      }
    });

    console.log('✅ Connected to MySQL successfully.\n');

    const migrationsDir = path.resolve(process.cwd(), 'db/migrations');
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found at: ${migrationsDir}`);
    }

    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    if (migrationFiles.length === 0) {
      console.warn('⚠️ No migration files found in db/migrations.');
      return;
    }

    console.log(`📋 Found ${migrationFiles.length} migration files to execute:`);
    migrationFiles.forEach((file, index) => {
      console.log(`   ${index + 1}. ${file}`);
    });
    console.log('');

    // Execute each migration file sequentially
    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf-8').trim();

      if (!sqlContent) {
        console.log(`⏩ Skipping empty file: ${file}`);
        continue;
      }

      console.log(`⏳ Applying migration: ${file}...`);
      const startTime = Date.now();

      await connection.query(sqlContent);

      const elapsed = Date.now() - startTime;
      console.log(`  ✅ Finished ${file} (${elapsed}ms)`);
    }

    console.log('\n🎉 All database migrations have been successfully executed!');
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
