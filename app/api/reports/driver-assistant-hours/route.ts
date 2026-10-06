/**
 * @file app/api/reports/driver-assistant-hours/route.ts
 * @description API route handler for Report 4: Driver and Assistant Working Hours.
 * 
 * Endpoints:
 * - GET /api/reports/driver-assistant-hours: Monitors weekly driver and assistant roster hours against 40h/60h statutory limits.
 * 
 * Authority: Docs/03_architecture.md §7, Docs/04_database-schema-v4.md §7, Docs/05_api-and-pages.md §A9
 * Copy Source: Docs/07_content-copy.md §/reports
 * Owner: Member 2 (Linari)
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac';
import { getCachedDriverAssistantHours, ReportResponse, DriverAssistantHoursRow } from '@/lib/reports';

/**
 * Handles GET requests to /api/reports/driver-assistant-hours.
 * Queries v_driver_assistant_hours with mandatory ?week_start= and optional ?role= filters (cached via Redis for 1 hour).
 * 
 * @param req - Incoming HTTP request with ?week_start= and optional ?role= query parameters
 * @returns JSON response containing items array and generated_at timestamp
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required. Please log in.',
          },
        },
        { status: 401 }
      );
    }

    // RBAC: logistics_manager, fleet_supervisor, and system_administrator are authorized
    if (!hasPermission(session.role, 'reports', 'read')) {
      return NextResponse.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Role '${session.role}' is not authorized to view reports.`,
          },
        },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const weekStart = searchParams.get('week_start');
    const roleParam = searchParams.get('role');

    if (!weekStart) {
      return NextResponse.json(
        {
          error: {
            code: 'MISSING_PARAM',
            message: "Parameter 'week_start' is required for the driver and assistant hours report. Expected format: YYYY-MM-DD.",
            field: 'week_start',
          },
        },
        { status: 400 }
      );
    }

    if (Number.isNaN(Date.parse(weekStart))) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_PARAM',
            message: "Invalid 'week_start' format. Please provide a valid date string (YYYY-MM-DD).",
            field: 'week_start',
          },
        },
        { status: 400 }
      );
    }

    let role: 'driver' | 'assistant' | undefined;
    if (roleParam) {
      if (roleParam !== 'driver' && roleParam !== 'assistant') {
        return NextResponse.json(
          {
            error: {
              code: 'INVALID_PARAM',
              message: "Invalid 'role' parameter. Must be either 'driver' or 'assistant'.",
              field: 'role',
            },
          },
          { status: 400 }
        );
      }
      role = roleParam;
    }

    const items = await getCachedDriverAssistantHours({
      week_start: weekStart,
      role,
    });

    const responsePayload: ReportResponse<DriverAssistantHoursRow> = {
      items,
      generated_at: new Date().toISOString(),
    };

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (error) {
    console.error('[API /api/reports/driver-assistant-hours] Error:', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve driver and assistant hours report data. Please try again.',
        },
      },
      { status: 500 }
    );
  }
}
