/**
 * @file app/api/users/route.ts
 * @description API route handler for system user accounts administration.
 * 
 * Endpoints:
 * - GET /api/users: Lists staff login accounts with associated profiles, roles, and store affiliations.
 * - POST /api/users: Atomically provisions a new user credential and staff profile with bcrypt hashing.
 * 
 * Supported GET query parameters:
 * - search?: string (case-insensitive search across email, employee name, or display name override)
 * - role?: string (filter by app_role: system_administrator, logistics_manager, order_entry_clerk, store_manager, fleet_supervisor)
 * - status?: string (filter by account status: active, deactivated, all)
 * - limit?: number (pagination record limit, positive integer 1-100)
 * - offset?: number (pagination offset, non-negative integer)
 * - page?: number (pagination 1-indexed page, combined with limit)
 * 
 * Response shapes:
 * - GET 200: { items: UserItem[], total: number }
 * - POST 201: { user_id, email, app_role, employee_id, display_name, department_or_title, home_store_id, home_store_name, is_active, created_at }
 * 
 * Security & RBAC:
 * - Only system_administrator is authorized to read or create user accounts.
 * - Password hashes are NEVER returned in GET or POST responses.
 * - Passwords are cryptographically hashed using bcryptjs with cost factor 12 prior to database insertion.
 * - Transactions and connection user context (@current_user_id, @current_app_role) ensure audit trail integrity.
 * 
 * Authority: Docs/03_architecture.md §6, Docs/04_database-schema-v4.md §1 & §2, Docs/05_api-and-pages.md §A10
 * Copy Source: Docs/07_content-copy.md §/admin/users
 * Owner: Member 4 (Vidura)
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { query, queryOne, withUserContext, QueryParam } from '@/lib/db';
import { getSession, hashPassword, AppRole } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';

/**
 * Valid application roles recognized by the database schema and RBAC policy.
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
 * Raw joined database record returned from users, user_profiles, employees, and stores.
 */
interface UserDbRow {
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
 * Handles GET requests to /api/users.
 * Retrieves all staff accounts matching optional search, role, and status filters.
 * 
 * @param req - Incoming HTTP request with optional query parameters
 * @returns JSON response with items array of user accounts and total count
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const session = await getSession();

    // 1. Verify authentication
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
    if (!hasPermission(session.role, 'users', 'read')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to view user accounts.`
          }
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim() || searchParams.get('searchQuery')?.trim();
    const roleParam = searchParams.get('role')?.trim() || searchParams.get('roleFilter')?.trim();
    const statusParam = searchParams.get('status')?.trim() || searchParams.get('statusFilter')?.trim();
    const limitParam = searchParams.get('limit')?.trim();
    const offsetParam = searchParams.get('offset')?.trim();
    const pageParam = searchParams.get('page')?.trim();

    // 3. Validate query parameters
    let filteredRole: AppRole | null = null;
    if (roleParam && roleParam.toUpperCase() !== 'ALL') {
      const normalizedRole = roleParam.toLowerCase() as AppRole;
      if (!VALID_APP_ROLES.includes(normalizedRole)) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: `Invalid role filter. Allowed roles: ${VALID_APP_ROLES.join(', ')}.`,
              field: 'role'
            }
          },
          { status: 400 }
        );
      }
      filteredRole = normalizedRole;
    }

    let filteredStatus: 'active' | 'deactivated' | null = null;
    if (statusParam && statusParam.toUpperCase() !== 'ALL') {
      const lower = statusParam.toLowerCase();
      if (lower === 'active' || lower === '1' || lower === 'true') {
        filteredStatus = 'active';
      } else if (lower === 'deactivated' || lower === '0' || lower === 'false' || lower === 'inactive') {
        filteredStatus = 'deactivated';
      } else {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid status filter. Allowed values: active, deactivated, all.',
              field: 'status'
            }
          },
          { status: 400 }
        );
      }
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
      if (limit !== null) {
        offset = (parsedPage - 1) * limit;
      }
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

    // 4. Construct SQL query with parameters
    // Note: u.password_hash is explicitly excluded to protect credentials
    let baseWhere = 'WHERE 1=1';
    const params: QueryParam[] = [];

    if (search) {
      baseWhere += ` AND (u.email LIKE ? OR e.full_name LIKE ? OR up.display_name_override LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (filteredRole) {
      baseWhere += ` AND up.app_role = ?`;
      params.push(filteredRole);
    }

    if (filteredStatus === 'active') {
      baseWhere += ` AND u.is_active = 1 AND up.is_active = 1`;
    } else if (filteredStatus === 'deactivated') {
      baseWhere += ` AND (u.is_active = 0 OR up.is_active = 0)`;
    }

    // Count total matching records
    const countSql = `
      SELECT COUNT(*) AS total
      FROM users u
      INNER JOIN user_profiles up ON u.user_id = up.user_id
      LEFT JOIN employees e ON up.employee_id = e.employee_id AND e.is_deleted = 0
      ${baseWhere}
    `;
    const countResult = await queryOne<{ total: number }>(countSql, params);
    const totalCount = countResult ? Number(countResult.total) : 0;

    // Fetch data rows with ordering
    let selectSql = `
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
      ${baseWhere}
      ORDER BY u.created_at DESC, u.user_id DESC
    `;

    const selectParams: QueryParam[] = [...params];
    if (limit !== null) {
      selectSql += ` LIMIT ? OFFSET ?`;
      selectParams.push(limit, offset);
    }

    const rows = await query<UserDbRow[]>(selectSql, selectParams);

    // 5. Transform records into sanitized user response items
    const items = rows.map((row) => {
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
    });

    return NextResponse.json({ items, total: totalCount }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to retrieve user accounts. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}

/**
 * Handles POST requests to /api/users.
 * Provisions a new staff login credential in `users` and an operational profile in `user_profiles`.
 * 
 * @param req - Incoming HTTP request with JSON body { email, temp_password, app_role, employee_id?, display_name_override? }
 * @returns JSON response with created user account (HTTP 201) or error object
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await getSession();

    // 1. Verify authentication
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
    if (!hasPermission(session.role, 'users', 'create')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to create user accounts.`
          }
        },
        { status: 403 }
      );
    }

    // 3. Parse JSON request body
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

    const { email, temp_password, app_role, employee_id, display_name_override } = body;

    // 4. Validate email
    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Email address is required.',
            field: 'email'
          }
        },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Please provide a valid email address.',
            field: 'email'
          }
        },
        { status: 400 }
      );
    }

    // 5. Validate temporary password
    if (!temp_password || typeof temp_password !== 'string' || !temp_password.trim()) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Temporary password is required.',
            field: 'temp_password'
          }
        },
        { status: 400 }
      );
    }

    const cleanPassword = temp_password.trim();
    if (cleanPassword.length < 8) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Temporary password must be at least 8 characters long.',
            field: 'temp_password'
          }
        },
        { status: 400 }
      );
    }

    // 6. Validate application role
    if (!app_role || typeof app_role !== 'string') {
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

    const cleanRole = app_role.trim().toLowerCase() as AppRole;
    if (!VALID_APP_ROLES.includes(cleanRole)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_ROLE',
            message: `Invalid role '${app_role}'. Must be one of: ${VALID_APP_ROLES.join(', ')}.`,
            field: 'app_role'
          }
        },
        { status: 400 }
      );
    }

    // 7. Check for duplicate email pre-flight
    const existingUser = await queryOne<{ user_id: string }>(
      'SELECT user_id FROM users WHERE email = ?',
      [cleanEmail]
    );

    if (existingUser) {
      return NextResponse.json(
        {
          error: {
            code: 'DUPLICATE_EMAIL',
            message: 'A user account with this email address already exists.',
            field: 'email'
          }
        },
        { status: 409 }
      );
    }

    // 8. Validate employee affiliation and store assignment rules
    let empId: number | null = null;
    let resolvedDisplayName: string = 'Staff Member';
    let resolvedHomeStoreId: number | null = null;
    let resolvedHomeStoreName: string | null = null;

    if (employee_id !== undefined && employee_id !== null && employee_id !== '') {
      const parsedEmpId = Number(employee_id);
      if (isNaN(parsedEmpId) || !Number.isInteger(parsedEmpId) || parsedEmpId <= 0) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid employee ID. Must be a positive integer.',
              field: 'employee_id'
            }
          },
          { status: 400 }
        );
      }
      empId = parsedEmpId;

      // Verify employee existence in employees table
      const emp = await queryOne<{
        employee_id: number;
        full_name: string;
        employee_type: string;
        home_store_id: number | null;
        store_name: string | null;
      }>(
        `SELECT e.employee_id, e.full_name, e.employee_type, e.home_store_id, s.store_name
         FROM employees e
         LEFT JOIN stores s ON e.home_store_id = s.store_id AND s.is_deleted = 0
         WHERE e.employee_id = ? AND e.is_deleted = 0`,
        [empId]
      );

      if (!emp) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'The referenced employee does not exist.',
              field: 'employee_id'
            }
          },
          { status: 400 }
        );
      }

      // Drivers and assistants cannot authenticate into system
      if (emp.employee_type === 'driver' || emp.employee_type === 'assistant') {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_EMPLOYEE_TYPE',
              message: `Employees of type '${emp.employee_type}' cannot be assigned system login accounts.`,
              field: 'employee_id'
            }
          },
          { status: 400 }
        );
      }

      // Check whether an account is already linked to this employee (enforces uq_user_profiles_emp)
      const existingProfile = await queryOne<{ user_id: string }>(
        'SELECT user_id FROM user_profiles WHERE employee_id = ?',
        [empId]
      );

      if (existingProfile) {
        return NextResponse.json(
          {
            error: {
              code: 'DUPLICATE_EMPLOYEE',
              message: 'An account is already linked to this employee.',
              field: 'employee_id'
            }
          },
          { status: 409 }
        );
      }

      // Store managers must be assigned to an active home store
      if (cleanRole === 'store_manager' && !emp.home_store_id) {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_STORE_ASSIGNMENT',
              message: 'Store manager accounts must be linked to an employee with an assigned home store.',
              field: 'employee_id'
            }
          },
          { status: 400 }
        );
      }

      resolvedDisplayName = emp.full_name;
      resolvedHomeStoreId = emp.home_store_id ? Number(emp.home_store_id) : null;
      resolvedHomeStoreName = emp.store_name || null;
    } else {
      // Store managers require an employee link for store scoping (getStoreScope)
      if (cleanRole === 'store_manager') {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Store managers must be linked to an employee with an assigned home store.',
              field: 'employee_id'
            }
          },
          { status: 400 }
        );
      }

      // Enforce DB constraint chk_user_profiles_name:
      // display_name_override must be NOT NULL when employee_id IS NULL
      if (!display_name_override || typeof display_name_override !== 'string' || !display_name_override.trim()) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Display name override is required when no employee is linked.',
              field: 'display_name_override'
            }
          },
          { status: 400 }
        );
      }

      resolvedDisplayName = display_name_override.trim();
    }

    // 9. Hash password before entering transaction to avoid holding locks during bcrypt computation
    const passwordHash = await hashPassword(cleanPassword);
    const newUserId = crypto.randomUUID();
    const finalDisplayNameOverride = empId !== null ? null : resolvedDisplayName;

    // 10. Atomically insert user and profile within user context connection
    const createdAccount = await withUserContext(session.user_id, session.role, async (connection) => {
      await connection.beginTransaction();
      try {
        // Insert credential into users table
        await connection.execute(
          `INSERT INTO users (user_id, email, password_hash, is_active)
           VALUES (?, ?, ?, 1)`,
          [newUserId, cleanEmail, passwordHash]
        );

        // Insert business profile into user_profiles table
        await connection.execute(
          `INSERT INTO user_profiles (user_id, employee_id, app_role, is_active, display_name_override)
           VALUES (?, ?, ?, 1, ?)`,
          [newUserId, empId, cleanRole, finalDisplayNameOverride]
        );

        await connection.commit();

        return {
          user_id: newUserId,
          email: cleanEmail,
          app_role: cleanRole,
          employee_id: empId,
          display_name: resolvedDisplayName,
          department_or_title: ROLE_LABELS[cleanRole] || cleanRole,
          home_store_id: resolvedHomeStoreId,
          home_store_name: resolvedHomeStoreName,
          is_active: true,
          created_at: new Date().toISOString()
        };
      } catch (txError) {
        await connection.rollback();
        throw txError;
      }
    });

    return NextResponse.json(createdAccount, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating user account:', error);

    // Handle MySQL unique constraint violations (ER_DUP_ENTRY)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'ER_DUP_ENTRY'
    ) {
      const sqlMsg = (error as { sqlMessage?: string }).sqlMessage || '';
      if (sqlMsg.includes('uq_users_email')) {
        return NextResponse.json(
          {
            error: {
              code: 'DUPLICATE_EMAIL',
              message: 'A user account with this email address already exists.',
              field: 'email'
            }
          },
          { status: 409 }
        );
      }
      if (sqlMsg.includes('uq_user_profiles_emp')) {
        return NextResponse.json(
          {
            error: {
              code: 'DUPLICATE_EMPLOYEE',
              message: 'An account is already linked to this employee.',
              field: 'employee_id'
            }
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        {
          error: {
            code: 'DUPLICATE_ENTRY',
            message: 'A duplicate record already exists in the system.'
          }
        },
        { status: 409 }
      );
    }

    // Handle MySQL foreign key violations (ER_NO_REFERENCED_ROW_2 / ER_NO_REFERENCED_ROW)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      ((error as { code: string }).code === 'ER_NO_REFERENCED_ROW_2' ||
       (error as { code: string }).code === 'ER_NO_REFERENCED_ROW')
    ) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'The referenced employee does not exist.',
            field: 'employee_id'
          }
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to create user account. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}
