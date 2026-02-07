/**
 * Permission System
 * 
 * Defines all permissions in the system and provides utilities for
 * permission checking, validation, and management.
 */

import { EventEmitter } from 'events';

// Permission namespace types
export type PermissionNamespace = 
  | 'user'
  | 'team'
  | 'agent'
  | 'workflow'
  | 'task'
  | 'config'
  | 'audit'
  | 'log'
  | 'metric'
  | 'billing'
  | 'api'
  | 'integration';

// Permission action types
export type PermissionAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'list'
  | 'execute'
  | 'manage'
  | 'admin';

// Permission scope modifiers
export type PermissionScope = '' | ':own' | ':assigned' | ':team';

// Full permission string format: namespace:action:scope or namespace:custom_action
export type PermissionString = `${PermissionNamespace}:${PermissionAction}${PermissionScope}` | `${PermissionNamespace}:${string}` | '*';

// Permission definition
export interface Permission {
  id: string;
  name: PermissionString;
  description: string;
  namespace: PermissionNamespace;
  action: PermissionAction;
  scope?: PermissionScope;
  requires?: string[]; // Dependencies - other permissions required
  dangerous?: boolean; // Requires additional confirmation
  metadata?: Record<string, unknown>;
}

// Permission group for UI organization
export interface PermissionGroup {
  namespace: PermissionNamespace;
  displayName: string;
  description: string;
  permissions: Permission[];
}

// All system permissions  
export const SYSTEM_PERMISSIONS: Array<{ name: string; description: string; namespace: PermissionNamespace; action: PermissionAction; scope?: PermissionScope; dangerous?: boolean }> = [
  // User permissions
  { name: 'user:create', description: 'Create new users', namespace: 'user', action: 'create' },
  { name: 'user:read', description: 'View user profiles', namespace: 'user', action: 'read' },
  { name: 'user:read:own', description: 'View own profile', namespace: 'user', action: 'read', scope: ':own' },
  { name: 'user:update', description: 'Update any user', namespace: 'user', action: 'update' },
  { name: 'user:update:own', description: 'Update own profile', namespace: 'user', action: 'update', scope: ':own' },
  { name: 'user:delete', description: 'Delete users', namespace: 'user', action: 'delete', dangerous: true },
  { name: 'user:manage_roles', description: 'Assign/remove user roles', namespace: 'user', action: 'manage' },
  { name: 'user:list', description: 'List users', namespace: 'user', action: 'list' },

  // Team permissions
  { name: 'team:create', description: 'Create teams', namespace: 'team', action: 'create' },
  { name: 'team:read', description: 'View team details', namespace: 'team', action: 'read' },
  { name: 'team:update', description: 'Update team settings', namespace: 'team', action: 'update' },
  { name: 'team:delete', description: 'Delete teams', namespace: 'team', action: 'delete', dangerous: true },
  { name: 'team:manage_members', description: 'Add/remove team members', namespace: 'team', action: 'manage' },
  { name: 'team:list', description: 'List teams', namespace: 'team', action: 'list' },

  // Agent permissions
  { name: 'agent:create', description: 'Create agents', namespace: 'agent', action: 'create' },
  { name: 'agent:read', description: 'View agent details', namespace: 'agent', action: 'read' },
  { name: 'agent:update', description: 'Update any agent', namespace: 'agent', action: 'update' },
  { name: 'agent:update:own', description: 'Update own agents', namespace: 'agent', action: 'update', scope: ':own' },
  { name: 'agent:delete', description: 'Delete agents', namespace: 'agent', action: 'delete', dangerous: true },
  { name: 'agent:delete:own', description: 'Delete own agents', namespace: 'agent', action: 'delete', scope: ':own' },
  { name: 'agent:execute', description: 'Execute agents', namespace: 'agent', action: 'execute' },
  { name: 'agent:monitor', description: 'Monitor agent execution', namespace: 'agent', action: 'read' },
  { name: 'agent:list', description: 'List agents', namespace: 'agent', action: 'list' },
  { name: 'agent:admin', description: 'Full agent administration', namespace: 'agent', action: 'admin' },

  // Workflow permissions
  { name: 'workflow:create', description: 'Create workflows', namespace: 'workflow', action: 'create' },
  { name: 'workflow:read', description: 'View workflows', namespace: 'workflow', action: 'read' },
  { name: 'workflow:update', description: 'Update any workflow', namespace: 'workflow', action: 'update' },
  { name: 'workflow:update:own', description: 'Update own workflows', namespace: 'workflow', action: 'update', scope: ':own' },
  { name: 'workflow:delete', description: 'Delete workflows', namespace: 'workflow', action: 'delete', dangerous: true },
  { name: 'workflow:delete:own', description: 'Delete own workflows', namespace: 'workflow', action: 'delete', scope: ':own' },
  { name: 'workflow:execute', description: 'Execute workflows', namespace: 'workflow', action: 'execute' },
  { name: 'workflow:list', description: 'List workflows', namespace: 'workflow', action: 'list' },

  // Task permissions
  { name: 'task:create', description: 'Create tasks', namespace: 'task', action: 'create' },
  { name: 'task:read', description: 'View tasks', namespace: 'task', action: 'read' },
  { name: 'task:read:assigned', description: 'View assigned tasks', namespace: 'task', action: 'read', scope: ':assigned' },
  { name: 'task:update', description: 'Update any task', namespace: 'task', action: 'update' },
  { name: 'task:update:own', description: 'Update own tasks', namespace: 'task', action: 'update', scope: ':own' },
  { name: 'task:delete', description: 'Delete tasks', namespace: 'task', action: 'delete' },
  { name: 'task:delete:own', description: 'Delete own tasks', namespace: 'task', action: 'delete', scope: ':own' },
  { name: 'task:list', description: 'List tasks', namespace: 'task', action: 'list' },

  // Config permissions
  { name: 'config:read', description: 'Read configuration', namespace: 'config', action: 'read' },
  { name: 'config:update', description: 'Update configuration', namespace: 'config', action: 'update', dangerous: true },
  { name: 'config:admin', description: 'Full configuration access', namespace: 'config', action: 'admin', dangerous: true },

  // Audit permissions
  { name: 'audit:read', description: 'View audit logs', namespace: 'audit', action: 'read' },
  { name: 'audit:export', description: 'Export audit logs', namespace: 'audit', action: 'read' },
  { name: 'audit:admin', description: 'Full audit access', namespace: 'audit', action: 'admin' },

  // Log permissions
  { name: 'log:read', description: 'View system logs', namespace: 'log', action: 'read' },
  { name: 'log:export', description: 'Export logs', namespace: 'log', action: 'read' },

  // Metric permissions
  { name: 'metric:read', description: 'View metrics', namespace: 'metric', action: 'read' },
  { name: 'metric:admin', description: 'Manage metrics', namespace: 'metric', action: 'admin' },

  // Billing permissions
  { name: 'billing:read', description: 'View billing info', namespace: 'billing', action: 'read' },
  { name: 'billing:update', description: 'Update billing settings', namespace: 'billing', action: 'update', dangerous: true },

  // API permissions
  { name: 'api:create_key', description: 'Create API keys', namespace: 'api', action: 'create' },
  { name: 'api:read_key', description: 'View API keys', namespace: 'api', action: 'read' },
  { name: 'api:revoke_key', description: 'Revoke API keys', namespace: 'api', action: 'delete' },
  { name: 'api:admin', description: 'Full API key management', namespace: 'api', action: 'admin' },

  // Integration permissions
  { name: 'integration:create', description: 'Create integrations', namespace: 'integration', action: 'create' },
  { name: 'integration:read', description: 'View integrations', namespace: 'integration', action: 'read' },
  { name: 'integration:update', description: 'Update integrations', namespace: 'integration', action: 'update' },
  { name: 'integration:delete', description: 'Delete integrations', namespace: 'integration', action: 'delete' },
];

// Namespace display names
export const NAMESPACE_DISPLAY_NAMES: Record<PermissionNamespace, string> = {
  user: 'Users',
  team: 'Teams',
  agent: 'Agents',
  workflow: 'Workflows',
  task: 'Tasks',
  config: 'Configuration',
  audit: 'Audit Logs',
  log: 'System Logs',
  metric: 'Metrics',
  billing: 'Billing',
  api: 'API Keys',
  integration: 'Integrations',
};

/**
 * Permission Manager
 */
export class PermissionManager extends EventEmitter {
  private permissions: Map<string, Permission> = new Map();

  constructor() {
    super();
    this.initializePermissions();
  }

  /**
   * Initialize system permissions
   */
  private initializePermissions(): void {
    for (const permData of SYSTEM_PERMISSIONS) {
      const permission: Permission = {
        ...permData,
        id: this.generatePermissionId(permData.name),
        name: permData.name as PermissionString,
      };
      this.permissions.set(permission.id, permission);
      this.permissions.set(permission.name, permission); // Also index by name
    }
  }

  /**
   * Get permission by ID or name
   */
  getPermission(idOrName: string): Permission | undefined {
    return this.permissions.get(idOrName);
  }

  /**
   * List all permissions
   */
  listPermissions(): Permission[] {
    // Return unique permissions (avoid duplicates from name indexing)
    const uniquePerms = new Map<string, Permission>();
    for (const perm of this.permissions.values()) {
      uniquePerms.set(perm.id, perm);
    }
    return Array.from(uniquePerms.values());
  }

  /**
   * List permissions grouped by namespace
   */
  listPermissionGroups(): PermissionGroup[] {
    const groups = new Map<PermissionNamespace, Permission[]>();

    for (const perm of this.listPermissions()) {
      if (!groups.has(perm.namespace)) {
        groups.set(perm.namespace, []);
      }
      groups.get(perm.namespace)!.push(perm);
    }

    return Array.from(groups.entries()).map(([namespace, permissions]) => ({
      namespace,
      displayName: NAMESPACE_DISPLAY_NAMES[namespace],
      description: `Permissions for managing ${NAMESPACE_DISPLAY_NAMES[namespace].toLowerCase()}`,
      permissions: permissions.sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }

  /**
   * Get permissions by namespace
   */
  getPermissionsByNamespace(namespace: PermissionNamespace): Permission[] {
    return this.listPermissions().filter(p => p.namespace === namespace);
  }

  /**
   * Validate permission string
   */
  validatePermission(permission: string): boolean {
    // Wildcard is always valid
    if (permission === '*') {
      return true;
    }

    // Check if it's a wildcard pattern
    if (permission.endsWith(':*')) {
      const namespace = permission.slice(0, -2);
      return this.isValidNamespace(namespace);
    }

    // Check exact permission
    return this.permissions.has(permission);
  }

  /**
   * Check if namespace is valid
   */
  isValidNamespace(namespace: string): namespace is PermissionNamespace {
    return namespace in NAMESPACE_DISPLAY_NAMES;
  }

  /**
   * Parse permission string
   */
  parsePermission(permission: string): {
    namespace?: string;
    action?: string;
    scope?: string;
    wildcard: boolean;
  } {
    if (permission === '*') {
      return { wildcard: true };
    }

    if (permission.endsWith(':*')) {
      return {
        namespace: permission.slice(0, -2),
        wildcard: true,
      };
    }

    const parts = permission.split(':');
    return {
      namespace: parts[0],
      action: parts[1],
      scope: parts[2],
      wildcard: false,
    };
  }

  /**
   * Check if permission matches pattern
   */
  matchesPermission(permission: string, pattern: string): boolean {
    // Exact match
    if (permission === pattern) {
      return true;
    }

    // Wildcard match
    if (pattern === '*') {
      return true;
    }

    // Namespace wildcard
    if (pattern.endsWith(':*')) {
      const namespace = pattern.slice(0, -2);
      return permission.startsWith(`${namespace}:`);
    }

    // Sub-permission wildcard
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return permission.startsWith(prefix);
    }

    return false;
  }

  /**
   * Get required permissions for a permission
   */
  getRequiredPermissions(permissionName: string): string[] {
    const perm = this.getPermission(permissionName);
    return perm?.requires || [];
  }

  /**
   * Check if permission is dangerous
   */
  isDangerous(permissionName: string): boolean {
    const perm = this.getPermission(permissionName);
    return perm?.dangerous || false;
  }

  /**
   * Get permission description
   */
  getPermissionDescription(permissionName: string): string {
    const perm = this.getPermission(permissionName);
    if (perm) {
      return perm.description;
    }

    // Generate description for unknown permissions
    const parsed = this.parsePermission(permissionName);
    if (parsed.namespace && parsed.action) {
      const scopeDesc = parsed.scope ? ` (${parsed.scope})` : '';
      return `${parsed.action} ${parsed.namespace}${scopeDesc}`;
    }

    return permissionName;
  }

  /**
   * Filter permissions by action
   */
  filterByAction(action: PermissionAction): Permission[] {
    return this.listPermissions().filter(p => p.action === action);
  }

  /**
   * Get all dangerous permissions
   */
  getDangerousPermissions(): Permission[] {
    return this.listPermissions().filter(p => p.dangerous);
  }

  /**
   * Expand wildcard permission to all matching permissions
   */
  expandWildcard(wildcard: string): string[] {
    if (wildcard === '*') {
      return this.listPermissions().map(p => p.name);
    }

    if (wildcard.endsWith(':*')) {
      const namespace = wildcard.slice(0, -2);
      return this.listPermissions()
        .filter(p => p.namespace === namespace)
        .map(p => p.name);
    }

    return [wildcard];
  }

  /**
   * Check permission compatibility
   */
  checkCompatibility(permissions: string[]): {
    compatible: boolean;
    conflicts?: string[];
    warnings?: string[];
  } {
    const conflicts: string[] = [];
    const warnings: string[] = [];

    // Check for redundant permissions
    const hasWildcard = permissions.includes('*');
    if (hasWildcard && permissions.length > 1) {
      warnings.push('Wildcard (*) permission makes other permissions redundant');
    }

    // Check for namespace wildcards
    const namespaceWildcards = permissions.filter(p => p.endsWith(':*') && p !== '*');
    const specificPerms = permissions.filter(p => !p.endsWith('*'));

    for (const wildcard of namespaceWildcards) {
      const namespace = wildcard.slice(0, -2);
      const redundant = specificPerms.filter(p => p.startsWith(`${namespace}:`));
      if (redundant.length > 0) {
        warnings.push(`Wildcard ${wildcard} already covers: ${redundant.join(', ')}`);
      }
    }

    return {
      compatible: conflicts.length === 0,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Suggest permissions based on use case
   */
  suggestPermissions(useCase: string): string[] {
    const suggestions: Record<string, string[]> = {
      'agent_developer': [
        'agent:create', 'agent:read', 'agent:update:own', 'agent:delete:own',
        'agent:execute', 'agent:monitor',
        'workflow:create', 'workflow:read', 'workflow:update:own', 'workflow:delete:own',
        'workflow:execute',
        'task:create', 'task:read', 'task:update:own', 'task:delete:own',
        'log:read', 'metric:read',
      ],
      'team_manager': [
        'user:read', 'user:update:team', 'user:manage_roles:team',
        'team:read', 'team:update', 'team:manage_members',
        'agent:read', 'agent:monitor',
        'workflow:read',
        'task:read',
        'audit:read',
        'metric:read',
      ],
      'observer': [
        'agent:read', 'agent:monitor',
        'workflow:read',
        'task:read',
        'log:read', 'metric:read',
      ],
      'api_user': [
        'agent:read', 'agent:execute',
        'workflow:read', 'workflow:execute',
        'task:create', 'task:read',
        'api:create_key', 'api:read_key', 'api:revoke_key',
      ],
    };

    return suggestions[useCase] || [];
  }

  /**
   * Generate permission ID
   */
  private generatePermissionId(name: string): string {
    return `perm_${name.replace(/:/g, '_')}`;
  }

  /**
   * Get permission statistics
   */
  getStats(): {
    totalPermissions: number;
    namespaces: number;
    dangerousPermissions: number;
    actions: Record<PermissionAction, number>;
  } {
    const perms = this.listPermissions();
    const actions: Record<PermissionAction, number> = {
      create: 0,
      read: 0,
      update: 0,
      delete: 0,
      list: 0,
      execute: 0,
      manage: 0,
      admin: 0,
    };

    for (const perm of perms) {
      actions[perm.action]++;
    }

    return {
      totalPermissions: perms.length,
      namespaces: new Set(perms.map(p => p.namespace)).size,
      dangerousPermissions: perms.filter(p => p.dangerous).length,
      actions,
    };
  }
}

// Singleton instance
let permissionManagerInstance: PermissionManager | null = null;

export function getPermissionManager(): PermissionManager {
  if (!permissionManagerInstance) {
    permissionManagerInstance = new PermissionManager();
  }
  return permissionManagerInstance;
}

// Factory function
export function createPermissionManager(): PermissionManager {
  return new PermissionManager();
}

export default PermissionManager;
