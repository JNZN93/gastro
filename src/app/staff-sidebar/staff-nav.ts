export interface StaffNavItem {
  label: string;
  route: string;
  icon: string;
  tone: string;
  roles: Array<'admin' | 'employee'>;
  exact?: boolean;
}

/** Same entries as the admin dashboard quick actions, plus the dashboard itself. */
export const STAFF_NAV_ITEMS: StaffNavItem[] = [
  { label: 'Dashboard', route: '/admin', icon: 'dashboard', tone: 'dashboard', roles: ['admin', 'employee'], exact: true },
  { label: 'Bestellungsübersicht', route: '/order-overview', icon: 'receipt_long', tone: 'orders', roles: ['admin', 'employee'] },
  { label: 'Kommissionierung', route: '/picking', icon: 'checklist', tone: 'picking', roles: ['admin', 'employee'], exact: true },
  { label: 'Aufträge erstellen', route: '/customer-orders', icon: 'add_box', tone: 'create', roles: ['admin', 'employee'] },
  { label: 'Offene Rechnungen', route: '/open-invoices', icon: 'receipt', tone: 'invoices', roles: ['admin'] },
  { label: 'Etikettendruck', route: '/label-management', icon: 'sell', tone: 'labels', roles: ['admin', 'employee'] },
  { label: 'Routenplanung', route: '/route-planning', icon: 'map', tone: 'routes', roles: ['admin'] },
  { label: 'Lagerbestand / Inventur', route: '/inventory', icon: 'warehouse', tone: 'inventory', roles: ['admin', 'employee'] },
  { label: 'Mitarbeiteransicht', route: '/employees', icon: 'groups', tone: 'employees', roles: ['admin'] },
  { label: 'Mitarbeiterplanung', route: '/mitarbeiterplanung', icon: 'calendar_month', tone: 'planning', roles: ['admin'] },
  { label: 'Online-Shop', route: '/products', icon: 'storefront', tone: 'shop', roles: ['admin', 'employee'] },
  { label: 'Produktverwaltung', route: '/product-management', icon: 'inventory_2', tone: 'products', roles: ['admin', 'employee'] },
  { label: 'Angebote verwalten', route: '/offers', icon: 'percent', tone: 'offers', roles: ['admin'], exact: true },
  { label: 'Kundenpreise Übersicht', route: '/customer-price-overview', icon: 'payments', tone: 'prices', roles: ['admin'] },
  { label: 'Reports & Analysen', route: '/reports', icon: 'analytics', tone: 'reports', roles: ['admin'] },
  { label: 'User Management', route: '/user-management', icon: 'manage_accounts', tone: 'users', roles: ['admin'] },
  { label: 'Geräte-Tracking', route: '/device-tracking', icon: 'location_on', tone: 'tracking', roles: ['admin'] },
  { label: 'Bestellmonitor', route: '/picking/monitor', icon: 'tv', tone: 'board', roles: ['admin', 'employee'] },
];

const STAFF_PREFIXES = [
  '/admin',
  '/open-invoices',
  '/guest-link',
  '/inventory',
  '/product-management',
  '/employees',
  '/label-management',
  '/customer-orders',
  '/order-overview',
  '/user-management',
  '/route-planning',
  '/reports',
  '/offers',
  '/customer-price-overview',
  '/device-tracking',
  '/mitarbeiterplanung',
];

/** Matches the docked sidebar breakpoint in the sidebar styles. */
export const STAFF_SIDEBAR_DESKTOP_MIN = 1101;

export function normalizeAppPath(url: string): string {
  return (url.split('?')[0].split('#')[0] || '/').replace(/\/+$/, '') || '/';
}

export function isPickingQueueUrl(url: string): boolean {
  return normalizeAppPath(url) === '/picking';
}

/** Staff workspace routes. Fullscreen picking and the offer flyer stay without the sidebar. */
export function isStaffWorkspaceUrl(url: string): boolean {
  const path = normalizeAppPath(url);

  if (path.includes('/flyer')) {
    return false;
  }

  if (path === '/picking') {
    return true;
  }

  if (path.startsWith('/picking/')) {
    return false;
  }

  return STAFF_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
