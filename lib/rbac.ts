/**
 * @file lib/rbac.ts
 * @description Central Role-Based Access Control (RBAC) helper for Kandypack.
 * 
 * Features:
 * - Re-exports AppRole and SessionUser from lib/auth.ts.
 * - Central Access Control Matrix (ACM) encoding Schema v4 §9 permissions.
 * - Route-level permission map for Next.js Edge Proxy and navigation guards.
 * - Fine-grained resource/action permission checker (`hasPermission`, `requirePermission`).
 * - Multi-tenant store scoping helper (`getStoreScope`) for store_manager isolation.
 * 
 * Authority: Docs/03_architecture.md §6, Docs/04_database-schema-v4.md §9, Docs/05_api-and-pages.md
 * Owner: Member 1 (Dineth)
 */

import { AppRole, SessionUser } from './auth';

export type { AppRole, SessionUser };

/**
 * All database resources / entity domains guarded by RBAC.
 */
export type Resource =
  | 'customers'
  | 'products'
  | 'cities'
  | 'routes'
  | 'stores'
  | 'employees'
  | 'drivers'
  | 'assistants'
  | 'trucks'
  | 'orders'
  | 'train_trips'
  | 'train_bookings'
  | 'store_inventory'
  | 'inventory_transactions'
  | 'truck_schedules'
  | 'deliveries'
  | 'users'
  | 'user_profiles'
  | 'audit_log'
  | 'reports';

/**
 * Granular actions that can be performed on resources.
 */
export type Action =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'place_order'
  | 'update_status'
  | 'receive_goods'
  | 'complete_delivery'
  | 'manage_accounts'
  | 'export';

/**
 * Route protection mapping for authenticated pages.
 * Defines which roles are authorized to access given URL paths.
 */
export const ROUTE_PERMISSIONS: Record<string, AppRole[]> = {
  '/dashboard': [
    'system_administrator',
    'logistics_manager',
    'order_entry_clerk',
    'store_manager',
    'fleet_supervisor'
  ],
  '/orders': [
    'system_administrator',
    'logistics_manager',
    'order_entry_clerk',
    'store_manager'
  ],
  '/orders/new': [
    'system_administrator',
    'order_entry_clerk'
  ],
  '/orders/[orderId]': [
    'system_administrator',
    'logistics_manager',
    'order_entry_clerk',
    'store_manager',
    'fleet_supervisor'
  ],
  '/train-schedule': [
    'system_administrator',
    'logistics_manager'
  ],
  '/truck-schedule': [
    'system_administrator',
    'fleet_supervisor'
  ],
  '/truck-schedule/new': [
    'system_administrator',
    'fleet_supervisor'
  ],
  '/deliveries': [
    'system_administrator',
    'fleet_supervisor'
  ],
  '/inventory': [
    'system_administrator',
    'store_manager',
    'logistics_manager'
  ],
  '/reports': [
    'system_administrator',
    'logistics_manager',
    'fleet_supervisor'
  ],
  '/admin/users': [
    'system_administrator'
  ],
  '/admin/master-data': [
    'system_administrator'
  ],
  '/admin/audit-log': [
    'system_administrator'
  ]
};

/**
 * Comprehensive Access Control Matrix (ACM) matching Schema v4 §9.
 * Resource -> Action -> Allowed AppRoles
 */
export const PERMISSION_MATRIX: Record<Resource, Partial<Record<Action, AppRole[]>>> = {
  customers: {
    read: ['system_administrator', 'logistics_manager', 'order_entry_clerk'],
    create: ['system_administrator', 'order_entry_clerk'],
    update: ['system_administrator'],
    delete: ['system_administrator']
  },
  products: {
    read: ['system_administrator', 'logistics_manager', 'order_entry_clerk', 'store_manager', 'fleet_supervisor'],
    create: ['system_administrator'],
    update: ['system_administrator'],
    delete: ['system_administrator']
  },
  cities: {
    read: ['system_administrator', 'logistics_manager', 'order_entry_clerk', 'store_manager', 'fleet_supervisor'],
    create: ['system_administrator'],
    update: ['system_administrator'],
    delete: ['system_administrator']
  },
  routes: {
    read: ['system_administrator', 'logistics_manager', 'order_entry_clerk', 'store_manager', 'fleet_supervisor'],
    create: ['system_administrator', 'logistics_manager'],
    update: ['system_administrator', 'logistics_manager'],
    delete: ['system_administrator']
  },
  stores: {
    read: ['system_administrator', 'logistics_manager', 'order_entry_clerk', 'store_manager', 'fleet_supervisor'],
    create: ['system_administrator'],
    update: ['system_administrator'],
    delete: ['system_administrator']
  },
  employees: {
    read: ['system_administrator', 'logistics_manager', 'fleet_supervisor'],
    create: ['system_administrator'],
    update: ['system_administrator'],
    delete: ['system_administrator']
  },
  drivers: {
    read: ['system_administrator', 'logistics_manager', 'fleet_supervisor'],
    create: ['system_administrator'],
    update: ['system_administrator'],
    delete: ['system_administrator']
  },
  assistants: {
    read: ['system_administrator', 'logistics_manager', 'fleet_supervisor'],
    create: ['system_administrator'],
    update: ['system_administrator'],
    delete: ['system_administrator']
  },
  trucks: {
    read: ['system_administrator', 'logistics_manager', 'fleet_supervisor'],
    create: ['system_administrator'],
    update: ['system_administrator'],
    delete: ['system_administrator']
  },
  orders: {
    read: ['system_administrator', 'logistics_manager', 'order_entry_clerk', 'store_manager', 'fleet_supervisor'],
    create: ['system_administrator', 'order_entry_clerk'],
    place_order: ['system_administrator', 'order_entry_clerk'],
    update: ['system_administrator', 'logistics_manager'],
    update_status: ['system_administrator', 'logistics_manager'],
    delete: ['system_administrator']
  },
  train_trips: {
    read: ['system_administrator', 'logistics_manager', 'store_manager'],
    create: ['system_administrator', 'logistics_manager'],
    update: ['system_administrator', 'logistics_manager'],
    delete: ['system_administrator']
  },
  train_bookings: {
    read: ['system_administrator', 'logistics_manager', 'store_manager'],
    create: ['system_administrator', 'logistics_manager', 'order_entry_clerk'],
    update: ['system_administrator', 'logistics_manager'],
    delete: ['system_administrator']
  },
  store_inventory: {
    read: ['system_administrator', 'logistics_manager', 'store_manager'],
    create: ['system_administrator', 'store_manager'],
    update: ['system_administrator', 'store_manager'],
    delete: ['system_administrator']
  },
  inventory_transactions: {
    read: ['system_administrator', 'logistics_manager', 'store_manager'],
    create: ['system_administrator', 'store_manager', 'fleet_supervisor'],
    receive_goods: ['system_administrator', 'store_manager']
  },
  truck_schedules: {
    read: ['system_administrator', 'logistics_manager', 'order_entry_clerk', 'store_manager', 'fleet_supervisor'],
    create: ['system_administrator', 'fleet_supervisor'],
    update: ['system_administrator', 'fleet_supervisor'],
    delete: ['system_administrator', 'fleet_supervisor']
  },
  deliveries: {
    read: ['system_administrator', 'logistics_manager', 'order_entry_clerk', 'store_manager', 'fleet_supervisor'],
    create: ['system_administrator', 'fleet_supervisor'],
    update: ['system_administrator', 'fleet_supervisor'],
    complete_delivery: ['system_administrator', 'fleet_supervisor', 'logistics_manager'],
    delete: ['system_administrator']
  },
  users: {
    read: ['system_administrator'],
    create: ['system_administrator'],
    update: ['system_administrator'],
    manage_accounts: ['system_administrator'],
    delete: ['system_administrator']
  },
  user_profiles: {
    read: ['system_administrator', 'logistics_manager', 'order_entry_clerk', 'store_manager', 'fleet_supervisor'],
    create: ['system_administrator'],
    update: ['system_administrator'],
    delete: ['system_administrator']
  },
  audit_log: {
    read: ['system_administrator'],
    create: ['system_administrator'],
    update: ['system_administrator'],
    delete: ['system_administrator']
  },
  reports: {
    read: ['system_administrator', 'logistics_manager', 'fleet_supervisor'],
    export: ['system_administrator', 'logistics_manager']
  }
};

/**
 * Checks whether a given role is allowed to access a page route pathname.
 * Handles dynamic route segments (such as `/orders/123` matching `/orders/[orderId]`).
 * 
 * @param role - The authenticated user's AppRole
 * @param pathname - The URL pathname being visited
 * @returns True if access is permitted, false otherwise
 * 
 * @example
 * const allowed = canAccessRoute('order_entry_clerk', '/orders/new'); // true
 * const forbidden = canAccessRoute('order_entry_clerk', '/admin/users'); // false
 */
export function canAccessRoute(role: AppRole, pathname: string): boolean {
  // Direct exact match
  if (ROUTE_PERMISSIONS[pathname]) {
    return ROUTE_PERMISSIONS[pathname].includes(role);
  }

  // Check dynamic pattern for /orders/[orderId]
  if (/^\/orders\/[^/]+$/.test(pathname) && pathname !== '/orders/new') {
    return ROUTE_PERMISSIONS['/orders/[orderId]']?.includes(role) ?? false;
  }

  // Check admin sub-routes
  if (pathname.startsWith('/admin/users')) {
    return ROUTE_PERMISSIONS['/admin/users']?.includes(role) ?? false;
  }
  if (pathname.startsWith('/admin/master-data')) {
    return ROUTE_PERMISSIONS['/admin/master-data']?.includes(role) ?? false;
  }
  if (pathname.startsWith('/admin/audit-log')) {
    return ROUTE_PERMISSIONS['/admin/audit-log']?.includes(role) ?? false;
  }

  // Find longest matching route prefix for other paths
  const matchingKey = Object.keys(ROUTE_PERMISSIONS)
    .filter((route) => route !== '/' && pathname.startsWith(route))
    .sort((a, b) => b.length - a.length)[0];

  if (matchingKey) {
    return ROUTE_PERMISSIONS[matchingKey].includes(role);
  }

  // Default to allowing if no explicit restriction is defined (e.g. root '/')
  return true;
}

/**
 * Verifies if an AppRole has permission to execute a specific action on a resource.
 * 
 * @param role - The AppRole to evaluate
 * @param resource - Target resource name
 * @param action - Target action type
 * @returns True if permitted, false otherwise
 * 
 * @example
 * if (!hasPermission(user.role, 'orders', 'update_status')) {
 *   return Response.json({ error: { message: 'Forbidden' } }, { status: 403 });
 * }
 */
export function hasPermission(
  role: AppRole,
  resource: Resource,
  action: Action
): boolean {
  const resourceMatrix = PERMISSION_MATRIX[resource];
  if (!resourceMatrix) {
    return false;
  }

  const allowedRoles = resourceMatrix[action];
  if (!allowedRoles) {
    return false;
  }

  return allowedRoles.includes(role);
}

/**
 * Custom Error class for RBAC authorization failures.
 */
export class ForbiddenError extends Error {
  public readonly code = 'FORBIDDEN';
  public readonly status = 403;

  constructor(message: string = 'You do not have permission to perform this action.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Asserts that the authenticated session possesses permission for a given action.
 * Throws a ForbiddenError if unauthorized or unauthenticated.
 * 
 * @param session - The active session user or null
 * @param resource - Target resource
 * @param action - Target action
 * 
 * @example
 * requirePermission(session, 'orders', 'place_order');
 */
export function requirePermission(
  session: SessionUser | null | undefined,
  resource: Resource,
  action: Action
): asserts session is SessionUser {
  if (!session) {
    throw new ForbiddenError('Authentication required.');
  }

  if (!hasPermission(session.role, resource, action)) {
    throw new ForbiddenError(
      `Role '${session.role}' is not authorized to '${action}' on '${resource}'.`
    );
  }
}

/**
 * Determines data scoping parameters for store-scoped roles.
 * Store managers are isolated to their home_store_id; other roles have global access.
 * 
 * @param user - The authenticated session user
 * @returns Object with isScoped boolean and store_id if applicable
 * 
 * @example
 * const { isScoped, store_id } = getStoreScope(session);
 * const sql = isScoped 
 *   ? 'SELECT * FROM store_inventory WHERE store_id = ?' 
 *   : 'SELECT * FROM store_inventory';
 */
export function getStoreScope(user: SessionUser): {
  isScoped: boolean;
  store_id: number | null;
} {
  if (user.role === 'store_manager') {
    return {
      isScoped: true,
      store_id: user.store_id
    };
  }

  return {
    isScoped: false,
    store_id: null
  };
}
