import { query } from '@/lib/db';
import type { TruckScheduleItem } from '@/types/fleet';

interface ScheduleJoinRow {
  schedule_id: string | number;
  truck_plate: string;
  driver_name: string;
  assistant_name: string;
  route_name: string;
  start_time: Date | string;
  end_time: Date | string;
  status: TruckScheduleItem['status'];
}

function formatDatetime(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export async function fetchTruckSchedulesFromDB(filters: {
  dateFrom?: string | null;
  dateTo?: string | null;
  status?: string | null;
  driverId?: string | null;
  driverName?: string | null;
  truckId?: string | null;
}): Promise<TruckScheduleItem[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.dateFrom) {
    conditions.push('ts.start_time >= ?');
    params.push(`${filters.dateFrom} 00:00:00`);
  }
  if (filters.dateTo) {
    conditions.push('ts.start_time <= ?');
    params.push(`${filters.dateTo} 23:59:59`);
  }
  if (filters.status) {
    conditions.push('ts.status = ?');
    params.push(filters.status);
  }
  if (filters.driverId) {
    conditions.push('ts.driver_id = ?');
    params.push(Number(filters.driverId));
  } else if (filters.driverName) {
    conditions.push('de.full_name LIKE ?');
    params.push(`%${filters.driverName}%`);
  }
  if (filters.truckId) {
    conditions.push('ts.truck_id = ?');
    params.push(Number(filters.truckId));
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await query<ScheduleJoinRow[]>(
    `SELECT
       ts.schedule_id,
       t.plate_number       AS truck_plate,
       de.full_name         AS driver_name,
       ae.full_name         AS assistant_name,
       r.route_name,
       ts.start_time,
       ts.end_time,
       ts.status
     FROM truck_schedules ts
     JOIN trucks      t   ON t.truck_id         = ts.truck_id
     JOIN drivers     d   ON d.driver_id         = ts.driver_id
     JOIN employees   de  ON de.employee_id      = d.employee_id
     JOIN assistants  a   ON a.assistant_id      = ts.assistant_id
     JOIN employees   ae  ON ae.employee_id      = a.employee_id
     JOIN routes      r   ON r.route_id          = ts.route_id
     ${whereClause}
     ORDER BY ts.start_time DESC`,
    params
  );

  return rows.map((row) => ({
    schedule_id:    Number(row.schedule_id),
    truck_plate:    row.truck_plate,
    driver_name:    row.driver_name,
    assistant_name: row.assistant_name,
    route_name:     row.route_name,
    start_time:     formatDatetime(row.start_time),
    end_time:       formatDatetime(row.end_time),
    status:         row.status,
  }));
}
