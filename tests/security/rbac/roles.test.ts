/**
 * Role Manager Tests
 */

import { RoleManager, createRoleManager, DEFAULT_ROLES } from '../../../src/security/rbac/roles';

describe('RoleManager', () => {
  let roleManager: RoleManager;

  beforeEach(() => {
    roleManager = createRoleManager();
  });

  describe('Initialization', () => {
    it('should initialize with default roles', () => {
      const roles = roleManager.listRoles();
      expect(roles.length).toBeGreaterThanOrEqual(4); // super_admin, admin, operator, viewer
    });

    it('should have super_admin role with highest level', () => {
      const superAdmin = roleManager.getRoleByName('super_admin');
      expect(superAdmin).toBeDefined();
      expect(superAdmin?.level).toBe(100);
      expect(superAdmin?.permissions).toContain('*');
    });

    it('should have viewer role with lowest level', () => {
      const viewer = roleManager.getRoleByName('viewer');
      expect(viewer).toBeDefined();
      expect(viewer?.level).toBe(20);
    });
  });

  describe('Role CRUD', () => {
    it('should create a custom role', () => {
      const customRole = roleManager.createRole({
        name: 'custom',
        displayName: 'Custom Role',
        description: 'A custom role for testing',
        level: 30,
        permissions: ['user:read', 'agent:read'],
      });

      expect(customRole.name).toBe('custom');
      expect(customRole.level).toBe(30);
      expect(customRole.permissions).toContain('user:read');
    });

    it('should not allow duplicate role names', () => {
      expect(() => {
        roleManager.createRole({
          name: 'super_admin',
          displayName: 'Duplicate',
          description: 'Test',
          level: 50,
          permissions: [],
        });
      }).toThrow();
    });

    it('should update a role', () => {
      const customRole = roleManager.createRole({
        name: 'custom',
        displayName: 'Custom Role',
        description: 'A custom role',
        level: 30,
        permissions: ['user:read'],
      });

      const updated = roleManager.updateRole(customRole.id, {
        permissions: ['user:read', 'user:update'],
      });

      expect(updated.permissions).toContain('user:update');
    });

    it('should not allow deleting system roles', () => {
      const superAdmin = roleManager.getRoleByName('super_admin');
      expect(() => {
        roleManager.deleteRole(superAdmin!.id);
      }).toThrow();
    });

    it('should delete custom roles', () => {
      const customRole = roleManager.createRole({
        name: 'deletable',
        displayName: 'Deletable',
        description: 'To be deleted',
        level: 30,
        permissions: [],
      });

      const deleted = roleManager.deleteRole(customRole.id);
      expect(deleted).toBe(true);
      expect(roleManager.getRole(customRole.id)).toBeUndefined();
    });
  });

  describe('Role Assignment', () => {
    it('should assign a role to a user', () => {
      const viewer = roleManager.getRoleByName('viewer')!;
      const assignment = roleManager.assignRole('user-123', viewer.id, 'admin-456');

      expect(assignment.userId).toBe('user-123');
      expect(assignment.roleId).toBe(viewer.id);
    });

    it('should get user roles', () => {
      const viewer = roleManager.getRoleByName('viewer')!;
      roleManager.assignRole('user-123', viewer.id, 'admin-456');

      const roles = roleManager.getUserRoles('user-123');
      expect(roles.length).toBe(1);
      expect(roles[0].name).toBe('viewer');
    });

    it('should check if user has role', () => {
      const operator = roleManager.getRoleByName('operator')!;
      roleManager.assignRole('user-456', operator.id, 'admin-789');

      expect(roleManager.hasRole('user-456', 'operator')).toBe(true);
      expect(roleManager.hasRole('user-456', 'admin')).toBe(false);
    });

    it('should remove role assignment', () => {
      const viewer = roleManager.getRoleByName('viewer')!;
      const assignment = roleManager.assignRole('user-789', viewer.id, 'admin-000');

      const removed = roleManager.removeRoleAssignment(assignment.id);
      expect(removed).toBe(true);
      expect(roleManager.getUserRoles('user-789').length).toBe(0);
    });
  });

  describe('Permission Checking', () => {
    beforeEach(() => {
      const superAdmin = roleManager.getRoleByName('super_admin')!;
      roleManager.assignRole('super-user', superAdmin.id, 'system');

      const viewer = roleManager.getRoleByName('viewer')!;
      roleManager.assignRole('view-user', viewer.id, 'system');
    });

    it('should get user permissions', () => {
      const perms = roleManager.getUserPermissions('super-user');
      expect(perms).toContain('*');
    });

    it('should check specific permission', () => {
      expect(roleManager.hasPermission('super-user', 'anything:anything')).toBe(true);
      expect(roleManager.hasPermission('view-user', 'agent:read')).toBe(true);
      expect(roleManager.hasPermission('view-user', 'agent:delete')).toBe(false);
    });

    it('should support wildcard permissions', () => {
      const admin = roleManager.getRoleByName('admin')!;
      roleManager.assignRole('admin-user', admin.id, 'system');

      // Admin has user:* permission
      expect(roleManager.hasPermission('admin-user', 'user:read')).toBe(true);
      expect(roleManager.hasPermission('admin-user', 'user:update')).toBe(true);
    });

    it('should check any permission', () => {
      expect(roleManager.hasAnyPermission('view-user', ['agent:read', 'agent:delete'])).toBe(true);
    });

    it('should check all permissions', () => {
      expect(roleManager.hasAllPermissions('view-user', ['agent:read', 'workflow:read'])).toBe(true);
      expect(roleManager.hasAllPermissions('view-user', ['agent:read', 'agent:delete'])).toBe(false);
    });
  });

  describe('Role Hierarchy', () => {
    it('should calculate user level correctly', () => {
      const superAdmin = roleManager.getRoleByName('super_admin')!;
      roleManager.assignRole('level-test', superAdmin.id, 'system');

      expect(roleManager.getUserLevel('level-test')).toBe(100);
    });

    it('should determine if user outranks another', () => {
      const superAdmin = roleManager.getRoleByName('super_admin')!;
      const viewer = roleManager.getRoleByName('viewer')!;
      
      roleManager.assignRole('high-user', superAdmin.id, 'system');
      roleManager.assignRole('low-user', viewer.id, 'system');

      expect(roleManager.outranks('high-user', 'low-user')).toBe(true);
      expect(roleManager.outranks('low-user', 'high-user')).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should provide role statistics', () => {
      const stats = roleManager.getRoleStats();
      
      expect(stats.totalRoles).toBeGreaterThanOrEqual(4);
      expect(stats.systemRoles).toBe(4);
      expect(stats.customRoles).toBeGreaterThanOrEqual(0);
    });
  });
});
