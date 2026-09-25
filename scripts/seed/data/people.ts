/**
 * @file scripts/seed/data/people.ts
 * @description Baseline employees, drivers, assistants and trucks.
 *
 * Implements Docs/06_seed-data-spec.md §6 and §7. Constraints respected here:
 * - `chk_employee_type`: snake_case employee types only.
 * - `uq_employees_nic`, `uq_drivers_license`, `uq_trucks_plate`: unique by construction.
 * - `trg_validate_driver_subtype` / `trg_validate_assistant_subtype`: every drivers/assistants
 *   row references an employee of the matching type, and employees are inserted first.
 *
 * All personal details are fictitious.
 *
 * Owner: Member 1 (Dineth)
 */

import { sql, type SeedRow } from '../helpers';

/** Employee types allowed by `chk_employee_type` that appear in the baseline. */
type EmployeeType =
  | 'logistics_manager'
  | 'order_entry_clerk'
  | 'store_manager'
  | 'fleet_supervisor'
  | 'driver'
  | 'assistant';

/**
 * Home stores for drivers and assistants: "roughly evenly across the 6 stores" (§6).
 * Eight people over six stores, so stores 1 and 2 get two each.
 */
const FIELD_STAFF_STORES = [1, 2, 3, 4, 5, 6, 1, 2];

/**
 * §6 — employee definitions in ID order (employee_id = position + 1). ID layout:
 * 1–2 logistics managers, 3–5 clerks, 6–11 store managers (stores 1–6), 12–14 fleet
 * supervisors, 15–22 drivers, 23–30 assistants. Test accounts (§12) depend on this layout.
 */
const EMPLOYEE_DEFINITIONS: Array<[fullName: string, type: EmployeeType, homeStoreId: number | null]> = [
  ['Nimal Perera', 'logistics_manager', null],
  ['Chamari Silva', 'logistics_manager', null],
  ['Kasun Jayasinghe', 'order_entry_clerk', null],
  ['Dilini Fernando', 'order_entry_clerk', null],
  ['Ruwan Bandara', 'order_entry_clerk', null],
  ['Sanjeewa Wickramasinghe', 'store_manager', 1],
  ['Anusha Gunawardena', 'store_manager', 2],
  ['Pradeep Rajapaksha', 'store_manager', 3],
  ['Thilini Weerasinghe', 'store_manager', 4],
  ['Kumaran Sivalingam', 'store_manager', 5],
  ['Farhan Ismail', 'store_manager', 6],
  ['Lahiru Dissanayake', 'fleet_supervisor', null],
  ['Ishara Senanayake', 'fleet_supervisor', null],
  ['Mahesh Karunaratne', 'fleet_supervisor', null],
  ...[
    'Suresh Kumara', 'Ajith Rathnayake', 'Nuwan Herath', 'Chaminda Pathirana',
    'Thevarajah Suthan', 'Rizwan Mohamed', 'Gayan Liyanage', 'Asela Samarasinghe'
  ].map((name, i): [string, EmployeeType, number] => [name, 'driver', FIELD_STAFF_STORES[i]]),
  ...[
    'Sameera Madushanka', 'Buddhika Jayawardena', 'Hasitha Premaratne', 'Dinesh Ekanayake',
    'Pirashanth Nadarajah', 'Irshad Hameed', 'Janaka Alwis', 'Tharindu Wijesekara'
  ].map((name, i): [string, EmployeeType, number] => [name, 'assistant', FIELD_STAFF_STORES[i]])
];

/**
 * Turns a full name into a lowercase dotted email local part, e.g. "Nimal Perera" → "nimal.perera".
 *
 * @param fullName - Employee full name
 * @returns Email local part containing only a–z and dots
 */
function emailLocalPart(fullName: string): string {
  return fullName.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
}

/**
 * §6 — 30 `employees` rows. NICs use the 12-digit format and phones the 10-digit mobile
 * format; both embed the employee ID so they are unique. `hire_date` uses the column default.
 */
export const EMPLOYEES: SeedRow[] = EMPLOYEE_DEFINITIONS.map(([fullName, type, homeStoreId], i) => {
  const employeeId = i + 1;
  return {
    employee_id: employeeId,
    full_name: fullName,
    nic_number: `1990${String(employeeId).padStart(8, '0')}`,
    phone: `0712${String(employeeId).padStart(6, '0')}`,
    email: `${emailLocalPart(fullName)}@kandypack.lk`,
    employee_type: type,
    home_store_id: homeStoreId
  };
});

/**
 * Collects employee IDs of one type in ID order, so subtype rows can never point at
 * an employee of the wrong type (which the subtype triggers would reject).
 *
 * @param type - Employee type to select
 * @returns Matching employee IDs
 */
function employeeIdsOfType(type: EmployeeType): number[] {
  return EMPLOYEES.filter((e) => e.employee_type === type).map((e) => Number(e.employee_id));
}

/**
 * §6 — 8 `drivers` rows (driver_id 1–8 → employees 15–22). The licence expiry is 18 months
 * after the seed run, computed by the database so it uses the server clock.
 */
export const DRIVERS: SeedRow[] = employeeIdsOfType('driver').map((employeeId, i) => ({
  driver_id: i + 1,
  employee_id: employeeId,
  license_number: `B${String(1000001 + i)}`,
  license_expiry: sql('DATE_ADD(CURDATE(), INTERVAL ? MONTH)', 18)
}));

/** §6 — 8 `assistants` rows (assistant_id 1–8 → employees 23–30). */
export const ASSISTANTS: SeedRow[] = employeeIdsOfType('assistant').map((employeeId, i) => ({
  assistant_id: i + 1,
  employee_id: employeeId
}));

/** §7 — 6 `trucks` rows, one based at each store. */
export const TRUCKS: SeedRow[] = [
  { truck_id: 1, plate_number: 'NB-1001', capacity_kg: 3000, home_store_id: 1 },
  { truck_id: 2, plate_number: 'NB-1002', capacity_kg: 3000, home_store_id: 2 },
  { truck_id: 3, plate_number: 'NB-1003', capacity_kg: 2500, home_store_id: 3 },
  { truck_id: 4, plate_number: 'NB-1004', capacity_kg: 2500, home_store_id: 4 },
  { truck_id: 5, plate_number: 'NB-1005', capacity_kg: 3000, home_store_id: 5 },
  { truck_id: 6, plate_number: 'NB-1006', capacity_kg: 2500, home_store_id: 6 }
];
