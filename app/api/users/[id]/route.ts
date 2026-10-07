/**
 * @file app/api/users/[id]/route.ts
 * @description API route handler for updating staff login accounts and profiles.
 * 
 * Endpoints:
 * - PATCH /api/users/:id: Modifies an existing user account's active status and/or application role.
 * 
 * Supported PATCH payload fields:
 * - is_active?: boolean (toggles user and user_profiles active state; soft deactivation blocks login)
 * - app_role?: AppRole (assigns new canonical role, subject to store manager scoping constraints)
 * 
 * Security & RBAC:
 * - Requires active authentication session.
 * - Restricted to system_administrator role (`users:update` permission).
 * - Password hashes and secrets are NEVER exposed or returned in responses.
 * - Prevents self-deactivation and self-demotion away from system_administrator for signed-in admins.
 * - Protects the last remaining active system administrator account with row-level locks (FOR UPDATE).
 * - Maps MySQL concurrency deadlocks (ER_LOCK_DEADLOCK) and wait timeouts (ER_LOCK_WAIT_TIMEOUT) to HTTP 409 Conflict.
 * - Updates across `users` and `user_profiles` are executed within an atomic database transaction.
 * - Connection session context (@current_user_id, @current_app_role) is configured via `withUserContext`.
 * 
 * Authority: Docs/03_architecture.md §6, Docs/04_database-schema-v4.md §1 & §2, Docs/05_api-and-pages.md §A10
 * Copy Source: Docs/07_content-copy.md §/admin/users
 * Owner: Member 4 (Vidura)
 */

import { NextResponse } from 'next/server';
import { RowDataPacket } from 'mysql2/promise';
import { queryOne, withUserContext } from '@/lib/db';
import { getSession, AppRole } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';

/**
 * Route parameter context matching Next.js 15+ async dynamic route parameters.
 */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Canonical application roles recognized by the database schema and RBAC policy.
 */
const VALID_APP_ROLES: readonly AppRole[] = [
  'system_administrator',
  'logistics_manager',
  'order_entry_clerk',
  'store_manager',
  'fleet_supervisor'
] as const;

/**
 * Human-readable mapping of application roles to administrative display titles.
 */
const ROLE_LABELS: Record<AppRole, string> = {
  system_administrator: 'System Administrator',
  logistics_manager: 'Logistics Manager',
  order_entry_clerk: 'Order Entry Clerk',
  store_manager: 'Store Manager',
  fleet_supervisor: 'Fleet Supervisor'
};

/**
 * Permitted update fields for the PATCH /api/users/:id endpoint.
 * Documented in Docs/05_api-and-pages.md §A10.
 */
const ALLOWED_PATCH_FIELDS = new Set(['is_active', 'app_role']);

/**
 * Standard 36-character UUID regex pattern (matches v4 and sequential/nil development UUIDs).
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Database record returned from users, user_profiles, employees, and stores join.
 */
interface UserDbRow extends RowDataPacket {
  user_id: string;
  email: string;
  user_active: number;
  profile_active: number;
  created_at: Date | string;
  app_role: AppRole;
  employee_id: number | null;
  display_name_override: string | null;
  employee_name: string | null;
  employee_type: string | null;
  home_store_id: number | null;
  home_store_name: string | null;
}

/**
 * Formats a joined database row into the standardized UserAccountItem response shape.
 * Ensures strict exclusion of credentials, password hashes, and sensitive internal fields.
 * 
 * @param row - Joined user and profile database record
 * @returns Standardized sanitized user account representation
 */
function formatUserResponse(row: UserDbRow) {
  const isActive = Boolean(row.user_active && row.profile_active);
  const displayName = row.employee_name || row.display_name_override || 'Staff Member';
  const departmentOrTitle = ROLE_LABELS[row.app_role] || row.app_role;

  return {
    user_id: row.user_id,
    email: row.email,
    app_role: row.app_role,
    is_active: isActive,
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString(),
    employee_id: row.employee_id !== null ? Number(row.employee_id) : null,
    display_name: displayName,
    department_or_title: departmentOrTitle,
    home_store_id: row.home_store_id !== null ? Number(row.home_store_id) : null,
    home_store_name: row.home_store_name || null
  };
}

/**
 * Handles PATCH requests to /api/users/:id.
 * Updates the user's active status (soft deactivation toggle) and/or application role.
 * 
 * @param req - Incoming HTTP request with JSON body { is_active?: boolean, app_role?: string }
 * @param context - Dynamic route parameters containing target user ID Promise
 * @returns JSON response with updated user record (HTTP 200) or structured error object
 */
export async function PATCH(
  req: Request,
  context: RouteContext
): Promise<NextResponse> {
  try {
    // 1. Verify authentication
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

    // 2. Enforce RBAC permission: system_administrator only (Docs/05_api-and-pages.md §A10)
    if (!hasPermission(session.role, 'users', 'update')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to update user accounts.`
          }
        },
        { status: 403 }
      );
    }

    // 3. Resolve and validate route parameter `:id`
    const { id } = await context.params;
    const targetUserId = id?.trim();

    if (!targetUserId || !UUID_REGEX.test(targetUserId)) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid user ID format. Must be a valid 36-character UUID.',
            field: 'id'
          }
        },
        { status: 400 }
      );
    }

    // 4. Parse JSON request body
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid or malformed JSON payload.'
          }
        },
        { status: 400 }
      );
    }

    // 5. Validate that only documented, authorized fields are present
    const payloadKeys = Object.keys(body);
    if (payloadKeys.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: "At least one update field ('is_active' or 'app_role') must be provided."
          }
        },
        { status: 400 }
      );
    }

    const unsupportedFields = payloadKeys.filter((key) => !ALLOWED_PATCH_FIELDS.has(key));
    if (unsupportedFields.length > 0) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: `Unsupported or non-editable update field(s): ${unsupportedFields.join(', ')}. Only 'is_active' and 'app_role' are editable via this endpoint.`,
            field: unsupportedFields[0]
          }
        },
        { status: 400 }
      );
    }

    // 6. Validate specific update fields
    let newIsActive: boolean | undefined = undefined;
    if ('is_active' in body) {
      if (typeof body.is_active !== 'boolean') {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: "'is_active' must be a boolean value (true or false).",
              field: 'is_active'
            }
          },
          { status: 400 }
        );
      }
      newIsActive = body.is_active;
    }

    let newAppRole: AppRole | undefined = undefined;
    if ('app_role' in body) {
      if (typeof body.app_role !== 'string' || !body.app_role.trim()) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_ROLE',
              message: `Role is required. Allowed roles: ${VALID_APP_ROLES.join(', ')}.`,
              field: 'app_role'
            }
          },
          { status: 400 }
        );
      }

      const cleanRole = body.app_role.trim().toLowerCase() as AppRole;
      if (!VALID_APP_ROLES.includes(cleanRole)) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_ROLE',
              message: `Invalid role '${body.app_role}'. Must be one of: ${VALID_APP_ROLES.join(', ')}.`,
              field: 'app_role'
            }
          },
          { status: 400 }
        );
      }
      newAppRole = cleanRole;
    }

    // 7. Enforce administrator self-protection: prevent self-deactivation and self-demotion
    const isSelf = session.user_id === targetUserId;

    if (isSelf && newIsActive === false) {
      return NextResponse.json(
        {
          error: {
            code: 'SELF_DEACTIVATION_PROHIBITED',
            message: 'Administrators cannot deactivate their own account.',
            field: 'is_active'
          }
        },
        { status: 400 }
      );
    }

    if (isSelf && newAppRole !== undefined && newAppRole !== 'system_administrator') {
      return NextResponse.json(
        {
          error: {
            code: 'SELF_DEMOTION_PROHIBITED',
            message: 'Administrators cannot change their own role away from system administrator.',
            field: 'app_role'
          }
        },
        { status: 400 }
      );
    }

    // 8. Verify target user exists
    const userQuerySql = `
      SELECT 
        u.user_id,
        u.email,
        u.is_active AS user_active,
        up.is_active AS profile_active,
        u.created_at,
        up.app_role,
        up.employee_id,
        up.display_name_override,
        e.full_name AS employee_name,
        e.employee_type,
        e.home_store_id,
        s.store_name AS home_store_name
      FROM users u
      INNER JOIN user_profiles up ON u.user_id = up.user_id
      LEFT JOIN employees e ON up.employee_id = e.employee_id AND e.is_deleted = 0
      LEFT JOIN stores s ON e.home_store_id = s.store_id AND s.is_deleted = 0
      WHERE u.user_id = ?
    `;

    const existingUser = await queryOne<UserDbRow>(userQuerySql, [targetUserId]);
    if (!existingUser) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'User account not found.'
          }
        },
        { status: 404 }
      );
    }

    // 9. Validate role transition rules and store scoping requirements
    if (newAppRole !== undefined) {
      // Prohibit assigning system login roles to operational personnel (driver, assistant)
      if (
        existingUser.employee_type === 'driver' ||
        existingUser.employee_type === 'assistant'
      ) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_EMPLOYEE_TYPE',
              message: `Employees of type '${existingUser.employee_type}' cannot be assigned system login accounts.`,
              field: 'app_role'
            }
          },
          { status: 400 }
        );
      }

      // Store managers must be linked to an employee with an active assigned home store
      // to ensure multi-tenant query scoping (getStoreScope) functions correctly
      if (newAppRole === 'store_manager') {
        if (!existingUser.employee_id || !existingUser.home_store_id) {
          return NextResponse.json(
            {
              error: {
                code: 'INVALID_STORE_ASSIGNMENT',
                message: 'Store manager accounts must be linked to an employee with an assigned home store.',
                field: 'app_role'
              }
            },
            { status: 400 }
          );
        }
      }
    }

    // 10. Execute atomic database update inside connection user context with concurrency safeguards
    interface UpdateUserTxResult {
      status: number;
      error?: {
        code: string;
        message: string;
        field?: string;
      };
    }

    const txResult = await withUserContext<UpdateUserTxResult>(
      session.user_id,
      session.role,
      async (connection) => {
        await connection.beginTransaction();
        try {
          // 10a. Lock the target user's records with SELECT ... FOR UPDATE
          const [targetUserRows] = await connection.execute<RowDataPacket[]>(
            `SELECT u.user_id, u.is_active AS user_active, up.is_active AS profile_active, up.app_role
             FROM users u
             INNER JOIN user_profiles up ON u.user_id = up.user_id
             WHERE u.user_id = ?
             FOR UPDATE`,
            [targetUserId]
          );

          if (!targetUserRows || targetUserRows.length === 0) {
            await connection.rollback();
            return {
              status: 404,
              error: {
                code: 'NOT_FOUND',
                message: 'User account not found.'
              }
            };
          }

          const currentTarget = targetUserRows[0];
          const isTargetActiveAdmin =
            currentTarget.app_role === 'system_administrator' &&
            Boolean(currentTarget.user_active && currentTarget.profile_active);

          const willRemoveActiveAdmin =
            isTargetActiveAdmin &&
            (newIsActive === false ||
              (newAppRole !== undefined && newAppRole !== 'system_administrator'));

          // 10b. Protect against removing or deactivating the last active system administrator.
          // Lock all active system_administrator rows with FOR UPDATE to prevent race conditions
          // where two administrators simultaneously remove each other.
          if (willRemoveActiveAdmin) {
            const [adminRows] = await connection.execute<RowDataPacket[]>(
              `SELECT u.user_id
               FROM users u
               INNER JOIN user_profiles up ON u.user_id = up.user_id
               WHERE up.app_role = 'system_administrator'
                 AND up.is_active = 1
                 AND u.is_active = 1
               FOR UPDATE`
            );

            if (adminRows.length <= 1) {
              await connection.rollback();
              return {
                status: 400,
                error: {
                  code: 'LAST_ADMIN_PROTECTED',
                  message: 'Cannot deactivate or change the role of the last remaining active system administrator.',
                  field: newIsActive === false ? 'is_active' : 'app_role'
                }
              };
            }
          }

          // 10c. Synchronize active flag across both users and user_profiles tables
          if (newIsActive !== undefined) {
            const activeInt = newIsActive ? 1 : 0;
            await connection.execute(
              'UPDATE users SET is_active = ? WHERE user_id = ?',
              [activeInt, targetUserId]
            );
            await connection.execute(
              'UPDATE user_profiles SET is_active = ? WHERE user_id = ?',
              [activeInt, targetUserId]
            );
          }

          // 10d. Update application role in user_profiles
          if (newAppRole !== undefined) {
            await connection.execute(
              'UPDATE user_profiles SET app_role = ? WHERE user_id = ?',
              [newAppRole, targetUserId]
            );
          }

          await connection.commit();
          return { status: 200 };
        } catch (txError) {
          try {
            await connection.rollback();
          } catch {
            // Ignore rollback failure if transaction was already rolled back by MySQL deadlock engine
          }
          throw txError;
        }
      }
    );

    if (txResult && txResult.status !== 200 && txResult.error) {
      return NextResponse.json(
        { error: txResult.error },
        { status: txResult.status }
      );
    }

    // 10. Fetch updated user record to return latest database state
    const updatedUser = await queryOne<UserDbRow>(userQuerySql, [targetUserId]);
    if (!updatedUser) {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'User account not found after update.'
          }
        },
        { status: 404 }
      );
    }

    return NextResponse.json(formatUserResponse(updatedUser), { status: 200 });
  } catch (error: unknown) {
    // Check for MySQL concurrency conflicts (deadlock or lock wait timeout) per Review Fix #10
    const err = error as { code?: string; errno?: number; message?: string } | null;
    const isLockConflict =
      err?.code === 'ER_LOCK_DEADLOCK' ||
      err?.code === 'ER_LOCK_WAIT_TIMEOUT' ||
      err?.errno === 1213 ||
      err?.errno === 1205 ||
      (typeof err?.message === 'string' &&
        (err.message.includes('ER_LOCK_DEADLOCK') ||
         err.message.includes('ER_LOCK_WAIT_TIMEOUT')));

    if (isLockConflict) {
      console.warn('Concurrent administrator update conflict detected:', err?.code || err?.errno);
      return NextResponse.json(
        {
          error: {
            code: 'CONCURRENT_UPDATE_CONFLICT',
            message: 'Another administrator changed accounts at the same time. Refresh and try again.'
          }
        },
        { status: 409 }
      );
    }

    console.error('Error updating user account:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to update user account. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}
