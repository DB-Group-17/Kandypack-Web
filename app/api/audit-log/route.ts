/**
 * @file app/api/audit-log/route.ts
 * @description API route handler for querying system-wide audit log records.
 *
 * Endpoints:
 * - GET /api/audit-log: Retrieves a filtered, paginated list of audit trail records.
 *
 * Supported GET query parameters:
 * - table_name?: string (filter by tracked database table name, e.g. 'orders', 'users')
 * - user_id?: string (filter by acting user UUID or 'system' / 'null' for system trigger records)
 * - date_from?: string (start creation timestamp boundary, YYYY-MM-DD or ISO 8601 string)
 * - date_to?: string (end creation timestamp boundary, YYYY-MM-DD or ISO 8601 string)
 * - limit?: number (pagination record limit, positive integer 1-100)
 * - offset?: number (pagination record offset, non-negative integer)
 * - page?: number (pagination 1-indexed page, combined with limit)
 *
 * Response shapes:
 * - 200: { items: AuditLogResponseItem[], total: number }
 *
 * Security & RBAC:
 * - Read-only operation. Never mutates, inserts, or deletes records from `audit_log`.
 * - Strictly restricted to users with the 'system_administrator' role via `hasPermission(role, 'audit_log', 'read')`.
 * - Passwords, sensitive credentials, and private hashes are never exposed.
 * - Deterministic ordering: sorted descending by creation timestamp and log ID (`created_at DESC, log_id DESC`).
 *
 * Authority: Docs/03_architecture.md §19, Docs/04_database-schema-v4.md §2.9, Docs/05_api-and-pages.md §A10
 * Copy Source: Docs/07_content-copy.md §/admin/audit-log
 * Owner: Member 4 (Vidura)
 */

import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2/promise';
import { query, queryOne, QueryParam } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';

/**
 * Raw database record returned from audit_log joined with user_profiles, users, and employees.
 */
interface AuditLogDbRow extends RowDataPacket {
  log_id: number | string;
  table_name: string;
  record_id: number | string | null;
  action: string;
  user_id: string | null;
  old_data: unknown;
  new_data: unknown;
  created_at: Date | string;
  actor_name: string | null;
  actor_email: string | null;
}

/**
 * Validated and formatted audit log item returned to API consumers.
 */
export interface AuditLogResponseItem {
  log_id: number;
  table_name: string;
  record_id: string | null;
  action: 'Created' | 'Updated' | 'Deleted' | string;
  user_id: string | null;
  user_name: string;
  user_initials: string;
  changed_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
}

/**
 * Validates whether a provided string represents a calendar date or ISO timestamp.
 *
 * @param dateStr - Raw date string from URL query parameters
 * @returns True if candidate can be parsed into a valid date, false otherwise
 */
function isValidDateString(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') {
    return false;
  }
  // Check canonical calendar format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    );
  }
  // Check generic ISO 8601 date string
  const timestamp = Date.parse(dateStr);
  return !isNaN(timestamp);
}

/**
 * Normalizes a validated date string into a MySQL DATETIME boundary string ('YYYY-MM-DD HH:MM:SS').
 *
 * @param dateStr - Validated date string
 * @param isEndOfDay - If true, sets time boundary to 23:59:59; otherwise sets to 00:00:00
 * @returns Formatted MySQL DATETIME boundary string
 */
function toMysqlDateTimeBoundary(dateStr: string, isEndOfDay: boolean): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return isEndOfDay ? `${dateStr} 23:59:59` : `${dateStr} 00:00:00`;
  }
  const dateObj = new Date(dateStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  const datePart = `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
  const timePart = isEndOfDay ? '23:59:59' : '00:00:00';
  return `${datePart} ${timePart}`;
}

/**
 * Safely parses a JSON database column value into a typed dictionary object.
 * Handles objects already parsed by mysql2 driver as well as raw JSON strings.
 *
 * @param field - Raw database JSON value
 * @returns Parsed object or null if absent/malformed
 */
function parseJsonField(field: unknown): Record<string, unknown> | null {
  if (!field) {
    return null;
  }
  if (typeof field === 'object' && !Array.isArray(field)) {
    return field as Record<string, unknown>;
  }
  if (typeof field === 'string') {
    try {
      const parsed = JSON.parse(field);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Computes 1-2 letter uppercase avatar initials from display name or email.
 *
 * @param name - User's resolved display name
 * @param email - User's login email address
 * @returns Uppercase initials string
 */
function getInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email && email.trim()) {
    return email.trim().slice(0, 2).toUpperCase();
  }
  return 'U';
}

/**
 * Maps raw database trigger actions ('INSERT', 'UPDATE', 'DELETE') to the human-readable
 * action labels required by the documented UI contract ('Created', 'Updated', 'Deleted').
 *
 * @param action - Raw database action string
 * @returns Standardized audit action enum label
 */
function mapAuditAction(action: string): 'Created' | 'Updated' | 'Deleted' | string {
  const normalized = (action || '').trim().toUpperCase();
  if (normalized === 'INSERT' || normalized === 'CREATED') {
    return 'Created';
  }
  if (normalized === 'UPDATE' || normalized === 'UPDATED') {
    return 'Updated';
  }
  if (normalized === 'DELETE' || normalized === 'DELETED') {
    return 'Deleted';
  }
  return action;
}

/**
 * Handles GET requests to /api/audit-log.
 * Retrieves a filtered, paginated list of audit records ordered newest first.
 *
 * Flow:
 * 1. Authenticate user session using getSession().
 * 2. Enforce RBAC read permission on 'audit_log' (system_administrator only).
 * 3. Parse, sanitize, and validate filter query parameters (table_name, user_id, date range, pagination).
 * 4. Execute counting query to obtain total matching record count.
 * 5. Execute paginated select query joined with user profiles and employees to resolve actor metadata.
 * 6. Transform raw records into standardized response items, resolving NULL record_ids for user accounts.
 * 7. Return HTTP 200 with { items, total }.
 *
 * @param req - Incoming HTTP request with optional filter and pagination query parameters
 * @returns JSON response containing items array and total count, or standardized error object
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    // 1. Authenticate user session
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required. Please log in.'
          }
        },
        { status: 401 }
      );
    }

    // 2. Enforce RBAC permission: system_administrator only
    if (!hasPermission(session.role, 'audit_log', 'read')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to view the audit log.`
          }
        },
        { status: 403 }
      );
    }

    // 3. Extract and sanitize query parameters
    const { searchParams } = new URL(req.url);
    const tableNameParam = searchParams.get('table_name')?.trim() || null;
    const userIdParam = searchParams.get('user_id')?.trim() || null;
    const dateFromParam = searchParams.get('date_from')?.trim() || null;
    const dateToParam = searchParams.get('date_to')?.trim() || null;
    const limitParam = searchParams.get('limit')?.trim();
    const offsetParam = searchParams.get('offset')?.trim();
    const pageParam = searchParams.get('page')?.trim();

    const whereConditions: string[] = ['1=1'];
    const queryParams: QueryParam[] = [];

    // Filter by table_name if provided and not 'all'
    if (tableNameParam && tableNameParam.toLowerCase() !== 'all') {
      whereConditions.push('al.table_name = ?');
      queryParams.push(tableNameParam.toLowerCase());
    }

    // Filter by user_id if provided and not 'all'
    if (userIdParam && userIdParam.toLowerCase() !== 'all') {
      const lowerUserId = userIdParam.toLowerCase();
      if (lowerUserId === 'system' || lowerUserId === 'null' || lowerUserId === '0') {
        whereConditions.push('al.user_id IS NULL');
      } else {
        whereConditions.push('al.user_id = ?');
        queryParams.push(userIdParam);
      }
    }

    // Validate and apply date range filters
    let parsedDateFrom: Date | null = null;
    let parsedDateTo: Date | null = null;

    if (dateFromParam) {
      if (!isValidDateString(dateFromParam)) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Valid date_from in YYYY-MM-DD format is required.',
              field: 'date_from'
            }
          },
          { status: 400 }
        );
      }
      parsedDateFrom = new Date(dateFromParam);
    }

    if (dateToParam) {
      if (!isValidDateString(dateToParam)) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Valid date_to in YYYY-MM-DD format is required.',
              field: 'date_to'
            }
          },
          { status: 400 }
        );
      }
      parsedDateTo = new Date(dateToParam);
    }

    // Cross-validate that date_from is not strictly after date_to
    if (parsedDateFrom && parsedDateTo && parsedDateFrom.getTime() > parsedDateTo.getTime()) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'date_from cannot be after date_to.',
            field: 'date_from'
          }
        },
        { status: 400 }
      );
    }

    if (dateFromParam) {
      whereConditions.push('al.created_at >= ?');
      queryParams.push(toMysqlDateTimeBoundary(dateFromParam, false));
    }

    if (dateToParam) {
      whereConditions.push('al.created_at <= ?');
      queryParams.push(toMysqlDateTimeBoundary(dateToParam, true));
    }

    // Validate pagination parameters if provided
    let limit: number | null = null;
    if (limitParam !== undefined && limitParam !== null && limitParam !== '') {
      const parsedLimit = Number(limitParam);
      if (!Number.isInteger(parsedLimit) || parsedLimit <= 0 || parsedLimit > 100) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Limit must be a positive integer between 1 and 100.',
              field: 'limit'
            }
          },
          { status: 400 }
        );
      }
      limit = parsedLimit;
    }

    let offset: number = 0;
    if (pageParam !== undefined && pageParam !== null && pageParam !== '') {
      const parsedPage = Number(pageParam);
      if (!Number.isInteger(parsedPage) || parsedPage <= 0) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Page must be a positive integer starting at 1.',
              field: 'page'
            }
          },
          { status: 400 }
        );
      }
      if (limit === null) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'limit must be specified when using page.',
              field: 'limit'
            }
          },
          { status: 400 }
        );
      }
      offset = (parsedPage - 1) * limit;
    } else if (offsetParam !== undefined && offsetParam !== null && offsetParam !== '') {
      const parsedOffset = Number(offsetParam);
      if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Offset must be a non-negative integer.',
              field: 'offset'
            }
          },
          { status: 400 }
        );
      }
      offset = parsedOffset;
    }

    // 4. Query total count of matching audit log entries
    const whereClause = whereConditions.join(' AND ');
    const countSql = `
      SELECT COUNT(*) AS total
      FROM audit_log al
      WHERE ${whereClause}
    `;

    const countResult = await queryOne<{ total: number | string }>(countSql, queryParams);
    const totalCount = countResult ? Number(countResult.total) : 0;

    // 5. Query paginated records joined with user profiles and employee records
    let selectSql = `
      SELECT 
        al.log_id,
        al.table_name,
        al.record_id,
        al.action,
        al.user_id,
        al.old_data,
        al.new_data,
        al.created_at,
        COALESCE(e.full_name, up.display_name_override) AS actor_name,
        u.email AS actor_email
      FROM audit_log al
      LEFT JOIN user_profiles up ON al.user_id = up.user_id
      LEFT JOIN users u ON al.user_id = u.user_id
      LEFT JOIN employees e ON up.employee_id = e.employee_id AND e.is_deleted = 0
      WHERE ${whereClause}
      ORDER BY al.created_at DESC, al.log_id DESC
    `;

    const selectParams: QueryParam[] = [...queryParams];
    if (limit !== null) {
      selectSql += ` LIMIT ? OFFSET ?`;
      selectParams.push(limit, offset);
    }

    const rows = await query<AuditLogDbRow[]>(selectSql, selectParams);

    // 6. Transform raw records into standardized response items
    const items: AuditLogResponseItem[] = rows.map((row) => {
      const oldJson = parseJsonField(row.old_data);
      const newJson = parseJsonField(row.new_data);

      // Resolve record_id:
      // Standard business tables store integer row ID in record_id.
      // Account tables (users, user_profiles) have record_id = NULL (since user IDs are UUIDs),
      // with target account UUID captured in old_data/new_data as 'user_id' per migration 25.
      let resolvedRecordId: string | null = null;
      if (row.record_id !== null && row.record_id !== undefined) {
        resolvedRecordId = String(row.record_id);
      } else {
        const targetUserId = (newJson?.user_id ?? oldJson?.user_id) as string | undefined;
        if (targetUserId) {
          resolvedRecordId = String(targetUserId);
        } else {
          resolvedRecordId = null;
        }
      }

      // Resolve actor display name and avatar initials:
      // When user_id is NULL (e.g. system triggers or bootstrap seeds), render 'System' with 'SYS'.
      let resolvedUserName = 'System';
      let resolvedUserInitials = 'SYS';

      if (row.user_id) {
        if (row.actor_name && row.actor_name.trim()) {
          resolvedUserName = row.actor_name.trim();
          resolvedUserInitials = getInitials(resolvedUserName, row.actor_email);
        } else if (row.actor_email && row.actor_email.trim()) {
          resolvedUserName = row.actor_email.trim();
          resolvedUserInitials = getInitials(null, row.actor_email);
        } else {
          resolvedUserName = 'Staff Member';
          resolvedUserInitials = 'SM';
        }
      }

      const isoChangedAt =
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(row.created_at).toISOString();

      return {
        log_id: Number(row.log_id),
        table_name: row.table_name,
        record_id: resolvedRecordId,
        action: mapAuditAction(row.action),
        user_id: row.user_id ? String(row.user_id) : null,
        user_name: resolvedUserName,
        user_initials: resolvedUserInitials,
        changed_at: isoChangedAt,
        old_data: oldJson,
        new_data: newJson
      };
    });

    // 7. Return 200 OK with items array and total count
    return NextResponse.json({ items, total: totalCount }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error fetching audit log records:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to retrieve audit log records. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}
