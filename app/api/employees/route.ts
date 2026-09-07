/**
 * @file app/api/employees/route.ts
 * @description API route handler for personnel roster and staff master data.
 * 
 * Endpoints:
 * - GET /api/employees: Lists active employees with role labels, store assignments, and driver/assistant subtype records.
 * - POST /api/employees: Registers a new employee, atomically provisioning subtype rows in drivers or assistants tables.
 * 
 * Authority: Docs/03_architecture.md §4, Docs/04_database-schema-v4.md §0, Docs/05_api-and-pages.md §A10
 * Copy Source: Docs/07_content-copy.md §/admin/master-data
 * Owner: Member 4 (Vidura)
 */

import { NextResponse } from 'next/server';
import { query, withTransaction, QueryParam } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { EmployeeRole } from '@/app/(dashboard)/admin/master-data/types';

interface EmployeeDbRow {
  employee_id: number;
  full_name: string;
  nic_number: string;
  phone: string;
  email: string | null;
  hire_date: string | Date;
  employee_type: EmployeeRole;
  home_store_id: number | null;
  home_store_name: string | null;
  license_number: string | null;
  license_expiry: string | Date | null;
  created_at: string | Date;
}

/**
 * Human-readable mapping of internal employee_type enum codes to UI labels.
 */
const ROLE_LABELS: Record<EmployeeRole, string> = {
  system_administrator: 'Administrator',
  logistics_manager: 'Logistics Manager',
  order_entry_clerk: 'Order Entry Clerk',
  store_manager: 'Store Manager',
  fleet_supervisor: 'Fleet Supervisor',
  driver: 'Driver',
  assistant: 'Assistant'
};

/**
 * Handles GET requests to /api/employees.
 * Returns staff records joined with stores, drivers, and assistants.
 * 
 * @param req - Incoming HTTP request with optional search, type, and store_id query params
 * @returns JSON response containing items array of employee records
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
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

    // RBAC: system_administrator, logistics_manager, fleet_supervisor
    if (!hasPermission(session.role, 'employees', 'read')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to view employee records.`
          }
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const searchParam = searchParams.get('search')?.trim();
    const typeParam = searchParams.get('type')?.trim();
    const storeIdParam = searchParams.get('store_id');

    let sql = `
      SELECT 
        e.employee_id,
        e.full_name,
        e.nic_number,
        e.phone,
        e.email,
        e.hire_date,
        e.employee_type,
        e.home_store_id,
        s.store_name AS home_store_name,
        d.license_number,
        d.license_expiry,
        e.created_at
      FROM employees e
      LEFT JOIN stores s ON e.home_store_id = s.store_id
      LEFT JOIN drivers d ON e.employee_id = d.employee_id AND d.is_deleted = 0
      LEFT JOIN assistants a ON e.employee_id = a.employee_id AND a.is_deleted = 0
      WHERE e.is_deleted = 0
    `;
    const params: QueryParam[] = [];

    if (searchParam) {
      sql += ` AND (e.full_name LIKE ? OR e.nic_number LIKE ? OR e.phone LIKE ?)`;
      params.push(`%${searchParam}%`, `%${searchParam}%`, `%${searchParam}%`);
    }

    if (typeParam && typeParam !== 'All') {
      sql += ` AND e.employee_type = ?`;
      params.push(typeParam);
    }

    if (storeIdParam && !isNaN(Number(storeIdParam))) {
      sql += ` AND e.home_store_id = ?`;
      params.push(Number(storeIdParam));
    }

    sql += ` ORDER BY e.employee_id ASC`;

    const rows = await query<EmployeeDbRow[]>(sql, params);

    const items = rows.map((e) => {
      const role = e.employee_type;
      return {
        employee_id: Number(e.employee_id),
        full_name: e.full_name,
        nic_number: e.nic_number,
        phone: e.phone,
        email: e.email || undefined,
        employee_type: role,
        employee_type_label: ROLE_LABELS[role] || role,
        home_store_id: e.home_store_id !== null ? Number(e.home_store_id) : null,
        home_store_name: e.home_store_name || undefined,
        license_number: e.license_number || undefined,
        license_expiry: e.license_expiry
          ? e.license_expiry instanceof Date
            ? e.license_expiry.toISOString().split('T')[0]
            : String(e.license_expiry).split('T')[0]
          : undefined,
        status: 'Active' as const,
        hire_date: e.hire_date
          ? e.hire_date instanceof Date
            ? e.hire_date.toISOString().split('T')[0]
            : String(e.hire_date).split('T')[0]
          : undefined
      };
    });

    return NextResponse.json({ items }, { status: 200 });
  } catch (error: unknown) {
    console.error('Error fetching employees:', error);
    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to retrieve employees. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}

/**
 * Handles POST requests to /api/employees.
 * Registers a staff member and provisions subtype child records (drivers or assistants) in an atomic transaction.
 * 
 * @param req - Incoming HTTP request with JSON payload conforming to NewEmployeePayload
 * @returns JSON response with created employee record (HTTP 201) or error details
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
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

    // RBAC: Only system_administrator can create employees
    if (!hasPermission(session.role, 'employees', 'create')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to create employee records.`
          }
        },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      full_name,
      nic_number,
      phone,
      email,
      employee_type,
      home_store_id,
      license_number,
      license_expiry
    } = body;

    // 1. Validate mandatory fields
    if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Full name is required.',
            field: 'full_name'
          }
        },
        { status: 400 }
      );
    }

    if (!nic_number || typeof nic_number !== 'string' || !nic_number.trim()) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'National Identity Card (NIC) number is required.',
            field: 'nic_number'
          }
        },
        { status: 400 }
      );
    }

    if (!phone || typeof phone !== 'string' || !phone.trim()) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Phone number is required.',
            field: 'phone'
          }
        },
        { status: 400 }
      );
    }

    const validRoles: EmployeeRole[] = [
      'driver',
      'assistant',
      'store_manager',
      'logistics_manager',
      'fleet_supervisor',
      'order_entry_clerk',
      'system_administrator'
    ];

    if (!validRoles.includes(employee_type)) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_EMPLOYEE_TYPE',
            message: 'Invalid employee role specified.',
            field: 'employee_type'
          }
        },
        { status: 400 }
      );
    }

    // Drivers require license_number
    if (employee_type === 'driver') {
      if (!license_number || typeof license_number !== 'string' || !license_number.trim()) {
        return NextResponse.json(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Driving license number is required for drivers.',
              field: 'license_number'
            }
          },
          { status: 400 }
        );
      }
    }

    const cleanName = full_name.trim();
    const cleanNic = nic_number.trim().toUpperCase();
    const cleanPhone = phone.trim();
    const cleanEmail = email ? String(email).trim() : null;
    const storeId = home_store_id ? Number(home_store_id) : null;
    const cleanLicense = license_number ? String(license_number).trim().toUpperCase() : null;
    const cleanLicenseExpiry = license_expiry ? String(license_expiry).trim() : null;

    // 2. Insert into employees and subtype tables atomically
    const createdEmployee = await withTransaction(async (connection) => {
      // Insert base employee record
      const [empResult] = await connection.execute(
        `INSERT INTO employees 
          (full_name, nic_number, phone, email, employee_type, home_store_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [cleanName, cleanNic, cleanPhone, cleanEmail, employee_type, storeId]
      );

      const newEmpId = (empResult as { insertId: number }).insertId;

      // Handle driver subtype insert (enforces trg_validate_driver_subtype)
      if (employee_type === 'driver' && cleanLicense) {
        await connection.execute(
          `INSERT INTO drivers (employee_id, license_number, license_expiry)
           VALUES (?, ?, ?)`,
          [newEmpId, cleanLicense, cleanLicenseExpiry]
        );
      }

      // Handle assistant subtype insert (enforces trg_validate_assistant_subtype)
      if (employee_type === 'assistant') {
        await connection.execute(
          `INSERT INTO assistants (employee_id)
           VALUES (?)`,
          [newEmpId]
        );
      }

      return {
        employee_id: newEmpId,
        full_name: cleanName,
        nic_number: cleanNic,
        phone: cleanPhone,
        email: cleanEmail || undefined,
        employee_type,
        employee_type_label: ROLE_LABELS[employee_type as EmployeeRole] || employee_type,
        home_store_id: storeId,
        license_number: cleanLicense || undefined,
        license_expiry: cleanLicenseExpiry || undefined,
        status: 'Active' as const,
        hire_date: new Date().toISOString().split('T')[0]
      };
    });

    return NextResponse.json(createdEmployee, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating employee:', error);

    // Handle unique constraint collisions (NIC or driver license)
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code: string }).code === 'ER_DUP_ENTRY'
    ) {
      const sqlMsg = (error as { sqlMessage?: string }).sqlMessage || '';
      if (sqlMsg.includes('uq_employees_nic')) {
        return NextResponse.json(
          {
            error: {
              code: 'DUPLICATE_NIC',
              message: 'An employee with this NIC number already exists.',
              field: 'nic_number'
            }
          },
          { status: 409 }
        );
      }
      if (sqlMsg.includes('uq_drivers_license')) {
        return NextResponse.json(
          {
            error: {
              code: 'DUPLICATE_LICENSE',
              message: 'A driver with this license number already exists.',
              field: 'license_number'
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

    return NextResponse.json(
      {
        error: {
          code: 'SERVER_ERROR',
          message: 'Failed to create employee. Please try again.'
        }
      },
      { status: 500 }
    );
  }
}
