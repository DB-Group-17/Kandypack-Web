/**
 * @file lib/db.ts
 * @description Central MySQL database connection pool and query helpers for Kandypack.
 * 
 * Features:
 * - Singleton connection pool attached to globalThis in development (prevents connection leaks during Next.js Fast Refresh).
 * - Parameterized query helpers (`query`, `queryOne`, `execute`) using mysql2/promise.
 * - Transaction helper (`withTransaction`) with automatic commit and rollback.
 * - Session variable context helper (`withUserContext` / `callProcedure`) to set `@current_user_id`
 *   and `@current_app_role` on connections for trigger-based audit logging and role validation.
 * 
 * Authority: Docs/03_architecture.md §4, Docs/04_database-schema-v4.md §0
 * Owner: Member 1 (Dineth)
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local if running in standalone scripts/CLI context outside Next.js runtime
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
  dotenv.config(); // fallback to .env if present
}

/**
 * Valid types for SQL query parameters.
 */
export type QueryParam =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | Buffer
  | bigint;

/**
 * Interface to store the singleton pool across hot-reloads in development.
 */
interface GlobalWithDb {
  mysqlPool?: mysql.Pool;
}

const globalForDb = globalThis as unknown as GlobalWithDb;

/**
 * Creates and configures the MySQL connection pool singleton.
 */
function createPool(): mysql.Pool {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL environment variable is missing. Please define it in your .env.local file.'
    );
  }

  return mysql.createPool({
    uri: databaseUrl,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    ssl: {
      rejectUnauthorized: false
    }
  });
}

/**
 * The application-wide singleton MySQL connection pool.
 */
export const pool: mysql.Pool = globalForDb.mysqlPool ?? createPool();

if (process.env.NODE_ENV !== 'production') {
  globalForDb.mysqlPool = pool;
}

/**
 * Executes a parameterized SQL query and returns the matching rows.
 * Uses prepared statements via pool.execute for SQL injection safety.
 * 
 * @template T - Expected row type (defaults to RowDataPacket[])
 * @param sql - Parameterized SQL query string (using ? placeholders)
 * @param params - Array of parameter values to bind
 * @returns Array of result rows
 * 
 * @example
 * const cities = await query<City[]>('SELECT * FROM cities WHERE is_destination = ?', [1]);
 */
export async function query<T = mysql.RowDataPacket[]>(
  sql: string,
  params: QueryParam[] = []
): Promise<T> {
  const [rows] = await pool.execute(sql, params as mysql.PoolConnection['execute'] extends (s: string, v: infer V) => unknown ? V : never);
  return rows as T;
}

/**
 * Executes a query expecting a single row, returning the first row or null if not found.
 * 
 * @template T - Expected row type
 * @param sql - Parameterized SQL query string
 * @param params - Array of parameter values to bind
 * @returns The first row or null
 * 
 * @example
 * const user = await queryOne<User>('SELECT * FROM users WHERE email = ?', [email]);
 */
export async function queryOne<T = mysql.RowDataPacket>(
  sql: string,
  params: QueryParam[] = []
): Promise<T | null> {
  const rows = await query<T[]>(sql, params);
  if (Array.isArray(rows) && rows.length > 0) {
    return rows[0];
  }
  return null;
}

/**
 * Executes an INSERT, UPDATE, or DELETE statement and returns the execution header.
 * 
 * @param sql - Parameterized SQL statement
 * @param params - Array of parameter values to bind
 * @returns ResultSetHeader containing insertId, affectedRows, etc.
 * 
 * @example
 * const result = await execute('UPDATE users SET is_active = ? WHERE user_id = ?', [0, userId]);
 * console.log(`Rows affected: ${result.affectedRows}`);
 */
export async function execute(
  sql: string,
  params: QueryParam[] = []
): Promise<mysql.ResultSetHeader> {
  const [result] = await pool.execute(sql, params as mysql.PoolConnection['execute'] extends (s: string, v: infer V) => unknown ? V : never);
  return result as mysql.ResultSetHeader;
}

/**
 * Executes multiple database operations inside an atomic transaction.
 * Automatically commits on success and rolls back on failure.
 * 
 * @template T - Return type of the transaction callback
 * @param callback - Async function that receives the active connection to execute queries
 * @returns The value returned by the callback
 * 
 * @example
 * const orderId = await withTransaction(async (conn) => {
 *   const [res] = await conn.execute('INSERT INTO orders (...) VALUES (...)', [...]);
 *   await conn.execute('INSERT INTO order_items (...) VALUES (...)', [...]);
 *   return (res as mysql.ResultSetHeader).insertId;
 * });
 */
export async function withTransaction<T>(
  callback: (connection: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Executes a database operation with MySQL session variables set for user context.
 * Sets `@current_user_id` and `@current_app_role` on the connection before running the callback.
 * Required for stored procedures, triggers, and audit logging.
 * 
 * @template T - Return type of the callback
 * @param userId - CHAR(36) UUID of the authenticated user
 * @param role - Role of the authenticated user (e.g., 'system_administrator')
 * @param callback - Async function that receives the configured connection
 * @returns The value returned by the callback
 * 
 * @example
 * await withUserContext(user.id, user.role, async (conn) => {
 *   await conn.execute('CALL place_order(?, ?, ..., @out_order_id)', [...]);
 * });
 */
export async function withUserContext<T>(
  userId: string,
  role: string,
  callback: (connection: mysql.PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.execute('SET @current_user_id = ?, @current_app_role = ?', [
      userId,
      role
    ]);
    return await callback(connection);
  } finally {
    connection.release();
  }
}

/**
 * Calls a stored procedure with optional user context variables set.
 * 
 * @template T - Expected return type of the procedure result
 * @param procedureName - Name of the stored procedure (e.g., 'place_order')
 * @param params - Parameter arguments to pass to the procedure
 * @param userContext - Optional userId and role to set on the connection session
 * @returns Procedure output / result sets
 * 
 * @example
 * const result = await callProcedure('receive_goods_at_store', [bookingId, userId], { userId, role });
 */
export async function callProcedure<T = unknown>(
  procedureName: string,
  params: QueryParam[] = [],
  userContext?: { userId: string; role: string }
): Promise<T> {
  const placeholders = params.map(() => '?').join(', ');
  const sql = `CALL ${procedureName}(${placeholders})`;

  if (userContext) {
    return withUserContext(userContext.userId, userContext.role, async (connection) => {
      const [results] = await connection.execute(sql, params as mysql.PoolConnection['execute'] extends (s: string, v: infer V) => unknown ? V : never);
      return results as T;
    });
  }

  const [results] = await pool.execute(sql, params as mysql.PoolConnection['execute'] extends (s: string, v: infer V) => unknown ? V : never);
  return results as T;
}

export default pool;
