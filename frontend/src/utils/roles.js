export const PERMISSIONS = {
  master_admin: ['*'],
  franchise_owner: ['reports', 'inventory', 'customer_analytics', 'payment_reports', 'franchise_dashboard', 'pos', 'kitchen'],
  manager: ['pos', 'reports', 'inventory', 'billing', 'franchise_dashboard', 'kitchen'],
  pos_staff: ['pos', 'billing', 'order_placement', 'order_history'],
  pos_shift_operator: ['pos', 'billing', 'order_history'],
  shift_operator: ['pos', 'billing', 'order_history'],
  kitchen_staff: ['kitchen_dashboard'],
};

const ROLE_ALIASES = {
  shift_operator: 'pos_shift_operator',
};

export const normalizeRole = (role) => ROLE_ALIASES[role] || role;

export const hasPermission = (role, module) => {
  const normalizedRole = normalizeRole(role);
  const permissions = PERMISSIONS[normalizedRole] || [];
  return permissions.includes('*') || permissions.includes(module);
};
