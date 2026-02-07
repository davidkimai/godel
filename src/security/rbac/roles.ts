/**
 * Role-Based Access Control - Role Definitions
 * 
 * Defines the role hierarchy and role management for Godel.
 * Role Hierarchy:
 * - super_admin: Full access to all resources
 * - admin: Team and user management
 * - operator: Agent operations and monitoring
 * - viewer: Read-only access
 */

import { EventEmitter } from 'events';

// Role Types
export type RoleType = 'super_admin' | 'admin' | 'operator' | 'viewer' | 'custom';

export interface Role {
  id: string;
  name: RoleType;
  displayName: string;
  description: string;
  level: number; // Higher level = more permissions
  permissions: string[];
  inheritedRoles?: string[]; // Role IDs to inherit permissions from
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleAssignment {
  id: string;
  userId: string;
  roleId: string;
  scope?: {
    type: 'global' | 'team' | 'project' | 'agent';
    id: string;
  };
  grantedBy: string;
  grantedAt: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface RoleHierarchy {
  [roleName: string]: {
    level: number;
    inherits?: string[];
  };
}

// Default Role Definitions
export const DEFAULT_ROLES: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'super_admin',
    displayName: 'Super Administrator',
    description: 'Full system access. Can manage all resources, users, and configurations.',
    level: 100,
    permissions: ['*'], // Wildcard permission
    inheritedRoles: [],
  },
  {
    name: 'admin',
    displayName: 'Administrator',
    description: 'Team and user management. Can manage teams, users, and most configurations.',
    level: 80,
    permissions: [
      'user:create',
      'user:read',
      'user:update',
      'user:delete',
      'user:manage_roles',
      'team:create',
      'team:read',
      'team:update',
      'team:delete',
      'team:manage_members',
      'agent:read',
      'agent:update',
      'agent:delete',
      'workflow:read',
      'workflow:update',
      'workflow:delete',
      'config:read',
      'config:update',
      'audit:read',
      'billing:read',
      'billing:update',
    ],
    inheritedRoles: [],
  },
  {
    name: 'operator',
    displayName: 'Operator',
    description: 'Agent operations and monitoring. Can run agents and view operational data.',
    level: 50,
    permissions: [
      'user:read',
      'team:read',
      'agent:create',
      'agent:read',
      'agent:update:own',
      'agent:delete:own',
      'agent:execute',
      'agent:monitor',
      'workflow:create',
      'workflow:read',
      'workflow:update:own',
      'workflow:delete:own',
      'workflow:execute',
      'task:create',
      'task:read',
      'task:update:own',
      'task:delete:own',
      'log:read',
      'metric:read',
      'config:read',
    ],
    inheritedRoles: [],
  },
  {
    name: 'viewer',
    displayName: 'Viewer',
    description: 'Read-only access. Can view agents, workflows, and operational data.',
    level: 20,
    permissions: [
      'user:read',
      'team:read',
      'agent:read',
      'workflow:read',
      'task:read',
      'log:read',
      'metric:read',
      'config:read',
    ],
    inheritedRoles: [],
  },
];

// Role hierarchy for level comparisons
export const ROLE_HIERARCHY: RoleHierarchy = {
  super_admin: { level: 100 },
  admin: { level: 80, inherits: ['operator'] },
  operator: { level: 50, inherits: ['viewer'] },
  viewer: { level: 20 },
};

/**
 * Role Manager
 */
export class RoleManager extends EventEmitter {
  private roles: Map<string, Role> = new Map();
  private assignments: Map<string, RoleAssignment> = new Map();
  private userRoles: Map<string, Set<string>> = new Map(); // userId -> roleIds

  constructor() {
    super();
    this.initializeDefaultRoles();
  }

  /**
   * Initialize default roles
   */
  private initializeDefaultRoles(): void {
    for (const roleData of DEFAULT_ROLES) {
      const role: Role = {
        ...roleData,
        id: this.generateRoleId(roleData.name),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.roles.set(role.id, role);
    }
  }

  /**
   * Create a new role
   */
  createRole(roleData: Omit<Role, 'id' | 'createdAt' | 'updatedAt'>): Role {
    const id = this.generateRoleId(roleData.name);
    
    if (this.roles.has(id)) {
      throw new Error(`Role '${roleData.name}' already exists`);
    }

    const role: Role = {
      ...roleData,
      id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.roles.set(id, role);
    this.emit('role:created', { roleId: id, name: role.name });

    return role;
  }

  /**
   * Get role by ID
   */
  getRole(roleId: string): Role | undefined {
    return this.roles.get(roleId);
  }

  /**
   * Get role by name
   */
  getRoleByName(name: RoleType): Role | undefined {
    return Array.from(this.roles.values()).find(r => r.name === name);
  }

  /**
   * Update role
   */
  updateRole(roleId: string, updates: Partial<Omit<Role, 'id' | 'createdAt'>>): Role {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role '${roleId}' not found`);
    }

    // Don't allow updating system roles' names
    if (['super_admin', 'admin', 'operator', 'viewer'].includes(role.name) && updates.name) {
      throw new Error(`Cannot rename system role '${role.name}'`);
    }

    const updated: Role = {
      ...role,
      ...updates,
      updatedAt: new Date(),
    };

    this.roles.set(roleId, updated);
    this.emit('role:updated', { roleId, name: updated.name });

    return updated;
  }

  /**
   * Delete role
   */
  deleteRole(roleId: string): boolean {
    const role = this.roles.get(roleId);
    if (!role) {
      return false;
    }

    // Don't allow deleting system roles
    if (['super_admin', 'admin', 'operator', 'viewer'].includes(role.name)) {
      throw new Error(`Cannot delete system role '${role.name}'`);
    }

    // Remove all assignments of this role
    for (const [assignmentId, assignment] of this.assignments.entries()) {
      if (assignment.roleId === roleId) {
        this.removeRoleAssignment(assignmentId);
      }
    }

    this.roles.delete(roleId);
    this.emit('role:deleted', { roleId, name: role.name });

    return true;
  }

  /**
   * List all roles
   */
  listRoles(): Role[] {
    return Array.from(this.roles.values()).sort((a, b) => b.level - a.level);
  }

  /**
   * Assign role to user
   */
  assignRole(
    userId: string, 
    roleId: string, 
    grantedBy: string,
    scope?: RoleAssignment['scope'],
    expiresAt?: Date
  ): RoleAssignment {
    const role = this.roles.get(roleId);
    if (!role) {
      throw new Error(`Role '${roleId}' not found`);
    }

    // Check if user already has this role with same scope
    const existingAssignment = this.findAssignment(userId, roleId, scope);
    if (existingAssignment) {
      throw new Error(`User already has role '${role.name}' with this scope`);
    }

    const assignment: RoleAssignment = {
      id: this.generateAssignmentId(),
      userId,
      roleId,
      scope,
      grantedBy,
      grantedAt: new Date(),
      expiresAt,
    };

    this.assignments.set(assignment.id, assignment);

    // Update user roles index
    if (!this.userRoles.has(userId)) {
      this.userRoles.set(userId, new Set());
    }
    this.userRoles.get(userId)!.add(roleId);

    this.emit('role:assigned', { 
      assignmentId: assignment.id, 
      userId, 
      roleId, 
      roleName: role.name,
    });

    return assignment;
  }

  /**
   * Remove role assignment
   */
  removeRoleAssignment(assignmentId: string): boolean {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) {
      return false;
    }

    this.assignments.delete(assignmentId);

    // Update user roles index
    const userRoles = this.userRoles.get(assignment.userId);
    if (userRoles) {
      // Check if user has any other assignments of this role
      const hasOtherAssignments = Array.from(this.assignments.values())
        .some(a => a.userId === assignment.userId && a.roleId === assignment.roleId);
      
      if (!hasOtherAssignments) {
        userRoles.delete(assignment.roleId);
      }
    }

    this.emit('role:unassigned', { 
      assignmentId, 
      userId: assignment.userId, 
      roleId: assignment.roleId,
    });

    return true;
  }

  /**
   * Get user roles
   */
  getUserRoles(userId: string): Role[] {
    const roleIds = this.userRoles.get(userId);
    if (!roleIds) {
      return [];
    }

    return Array.from(roleIds)
      .map(id => this.roles.get(id))
      .filter((role): role is Role => role !== undefined);
  }

  /**
   * Get user role assignments
   */
  getUserAssignments(userId: string): RoleAssignment[] {
    return Array.from(this.assignments.values())
      .filter(a => a.userId === userId);
  }

  /**
   * Check if user has role
   */
  hasRole(userId: string, roleName: RoleType): boolean {
    const roles = this.getUserRoles(userId);
    return roles.some(r => r.name === roleName);
  }

  /**
   * Get user's highest role level
   */
  getUserLevel(userId: string): number {
    const roles = this.getUserRoles(userId);
    if (roles.length === 0) {
      return 0;
    }
    return Math.max(...roles.map(r => r.level));
  }

  /**
   * Check if user outranks another user
   */
  outranks(userId: string, targetUserId: string): boolean {
    return this.getUserLevel(userId) > this.getUserLevel(targetUserId);
  }

  /**
   * Get effective permissions for user (including inherited)
   */
  getUserPermissions(userId: string): string[] {
    const roles = this.getUserRoles(userId);
    const permissions = new Set<string>();

    for (const role of roles) {
      // Add direct permissions
      for (const perm of role.permissions) {
        permissions.add(perm);
      }

      // Add inherited permissions
      if (role.inheritedRoles) {
        for (const inheritedRoleId of role.inheritedRoles) {
          const inheritedRole = this.roles.get(inheritedRoleId);
          if (inheritedRole) {
            for (const perm of inheritedRole.permissions) {
              permissions.add(perm);
            }
          }
        }
      }
    }

    return Array.from(permissions);
  }

  /**
   * Check if user has permission
   */
  hasPermission(userId: string, permission: string): boolean {
    const permissions = this.getUserPermissions(userId);
    
    // Check for wildcard
    if (permissions.includes('*')) {
      return true;
    }

    // Check exact permission
    if (permissions.includes(permission)) {
      return true;
    }

    // Check wildcard patterns
    const parts = permission.split(':');
    for (let i = parts.length - 1; i > 0; i--) {
      const wildcardPattern = parts.slice(0, i).join(':') + ':*';
      if (permissions.includes(wildcardPattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if user has any of the permissions
   */
  hasAnyPermission(userId: string, permissions: string[]): boolean {
    return permissions.some(p => this.hasPermission(userId, p));
  }

  /**
   * Check if user has all permissions
   */
  hasAllPermissions(userId: string, permissions: string[]): boolean {
    return permissions.every(p => this.hasPermission(userId, p));
  }

  /**
   * Clean up expired assignments
   */
  cleanupExpiredAssignments(): number {
    const now = new Date();
    let count = 0;

    for (const [assignmentId, assignment] of this.assignments.entries()) {
      if (assignment.expiresAt && assignment.expiresAt <= now) {
        this.removeRoleAssignment(assignmentId);
        count++;
      }
    }

    return count;
  }

  /**
   * Find existing assignment
   */
  private findAssignment(
    userId: string, 
    roleId: string, 
    scope?: RoleAssignment['scope']
  ): RoleAssignment | undefined {
    return Array.from(this.assignments.values()).find(a => {
      if (a.userId !== userId || a.roleId !== roleId) {
        return false;
      }
      
      if (!scope && !a.scope) return true;
      if (!scope || !a.scope) return false;
      
      return scope.type === a.scope.type && scope.id === a.scope.id;
    });
  }

  /**
   * Generate role ID
   */
  private generateRoleId(name: string): string {
    return `role_${name}_${Date.now().toString(36)}`;
  }

  /**
   * Generate assignment ID
   */
  private generateAssignmentId(): string {
    return `assignment_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all assignments (for admin)
   */
  getAllAssignments(): RoleAssignment[] {
    return Array.from(this.assignments.values());
  }

  /**
   * Get role statistics
   */
  getRoleStats(): {
    totalRoles: number;
    systemRoles: number;
    customRoles: number;
    totalAssignments: number;
    activeUsers: number;
  } {
    const allRoles = Array.from(this.roles.values());
    const systemRoles = ['super_admin', 'admin', 'operator', 'viewer'];
    
    return {
      totalRoles: allRoles.length,
      systemRoles: allRoles.filter(r => systemRoles.includes(r.name)).length,
      customRoles: allRoles.filter(r => !systemRoles.includes(r.name)).length,
      totalAssignments: this.assignments.size,
      activeUsers: this.userRoles.size,
    };
  }
}

// Singleton instance
let roleManagerInstance: RoleManager | null = null;

export function getRoleManager(): RoleManager {
  if (!roleManagerInstance) {
    roleManagerInstance = new RoleManager();
  }
  return roleManagerInstance;
}

// Factory function
export function createRoleManager(): RoleManager {
  return new RoleManager();
}

export default RoleManager;
