/**
 * OpenClaw Permission Manager Tests
 * 
 * Verifies that permission enforcement actually works.
 * Anti-stub protocol: Tests must pass before reporting success.
 */

import {
  PermissionManager,
  PermissionDeniedError,
  ToolNotAllowedError,
  ToolBlacklistedError,
  SandboxRequiredError,
  ResourceLimitExceededError,
} from '../../../src/integrations/openclaw/PermissionManager';
import {
  DEFAULT_PERMISSIONS,
  RESTRICTED_PERMISSIONS,
  SECURITY_PROFILES,
  DANGEROUS_TOOLS,
  computeInheritedPermissions,
} from '../../../src/integrations/openclaw/defaults';

describe('PermissionManager', () => {
  let pm: PermissionManager;

  beforeEach(() => {
    pm = new PermissionManager({ strictMode: true });
  });

  afterEach(() => {
    pm.dispose();
  });

  // ============================================================================
  // Agent Registration
  // ============================================================================

  describe('Agent Registration', () => {
    it('should register agent with default permissions', () => {
      const perms = pm.registerAgent('agent-1');
      
      expect(perms.allowedTools).toContain('read');
      expect(perms.allowedTools).toContain('write');
      expect(perms.sandboxMode).toBe('non-main');
      expect(pm.isRegistered('agent-1')).toBe(true);
    });

    it('should register agent with custom permissions', () => {
      const perms = pm.registerAgent('agent-1', {
        allowedTools: ['read'],
        maxTokens: 5000,
      });

      expect(perms.allowedTools).toEqual(['read']);
      expect(perms.maxTokens).toBe(5000);
    });

    it('should register agent with security profile', () => {
      const perms = pm.registerAgentWithProfile('agent-1', 'untrusted');
      
      expect(perms.sandboxMode).toBe('docker');
      expect(perms.canSpawnAgents).toBe(false);
      expect(perms.requireApproval).toBe(true);
    });

    it('should unregister agent and clean up', () => {
      pm.registerAgent('agent-1');
      pm.unregisterAgent('agent-1');
      
      expect(pm.isRegistered('agent-1')).toBe(false);
    });
  });

  // ============================================================================
  // Tool Permission Checks
  // ============================================================================

  describe('Tool Permission Checks', () => {
    beforeEach(() => {
      pm.registerAgent('agent-1', {
        allowedTools: ['read', 'write', 'browser'],
        deniedTools: ['exec'],
      });
    });

    it('should allow whitelisted tools', () => {
      expect(pm.checkToolPermission('agent-1', 'read', false)).toBe(true);
      expect(pm.checkToolPermission('agent-1', 'write', false)).toBe(true);
    });

    it('should deny blacklisted tools', () => {
      expect(pm.checkToolPermission('agent-1', 'exec', false)).toBe(false);
    });

    it('should deny tools not in whitelist', () => {
      expect(pm.checkToolPermission('agent-1', 'nodes', false)).toBe(false);
      expect(pm.checkToolPermission('agent-1', 'unknown-tool', false)).toBe(false);
    });

    it('should throw ToolBlacklistedError in strict mode', () => {
      expect(() => pm.checkToolPermission('agent-1', 'exec', true)).toThrow(ToolBlacklistedError);
    });

    it('should throw ToolNotAllowedError for non-whitelisted tools in strict mode', () => {
      expect(() => pm.checkToolPermission('agent-1', 'nodes', true)).toThrow(ToolNotAllowedError);
    });

    it('should allow all tools when wildcard is used', () => {
      pm.registerAgent('agent-2', { allowedTools: ['*'] });
      
      expect(pm.checkToolPermission('agent-2', 'any-tool', false)).toBe(true);
      expect(pm.checkToolPermission('agent-2', 'unknown', false)).toBe(true);
    });

    it('should deny blacklisted tools even with wildcard', () => {
      pm.registerAgent('agent-2', { 
        allowedTools: ['*'],
        deniedTools: ['gateway'],
      });
      
      expect(pm.checkToolPermission('agent-2', 'read', false)).toBe(true);
      expect(pm.checkToolPermission('agent-2', 'gateway', false)).toBe(false);
    });

    it('should check multiple tools at once', () => {
      const results = pm.checkToolsPermission('agent-1', ['read', 'write', 'exec', 'nodes']);
      
      expect(results).toEqual({
        read: true,
        write: true,
        exec: false,
        nodes: false,
      });
    });
  });

  // ============================================================================
  // Sandbox Mode Checks
  // ============================================================================

  describe('Sandbox Mode Checks', () => {
    it('should require sandbox for dangerous tools', () => {
      pm.registerAgent('agent-1', { sandboxMode: 'docker' });
      
      const requiredMode = pm.checkSandboxRequired('agent-1', 'exec');
      expect(requiredMode).toBe('docker');
    });

    it('should not require sandbox for safe tools', () => {
      pm.registerAgent('agent-1', { sandboxMode: 'docker' });
      
      const requiredMode = pm.checkSandboxRequired('agent-1', 'read');
      expect(requiredMode).toBeNull();
    });

    it('should throw SandboxRequiredError when current mode insufficient', () => {
      pm.registerAgent('agent-1', { sandboxMode: 'docker' });
      
      expect(() => pm.assertSandboxMode('agent-1', 'exec', 'none')).toThrow(SandboxRequiredError);
    });

    it('should accept sufficient sandbox mode', () => {
      pm.registerAgent('agent-1', { sandboxMode: 'docker' });
      
      // docker mode is sufficient for docker-required tools
      expect(() => pm.assertSandboxMode('agent-1', 'exec', 'docker')).not.toThrow();
      // non-main mode is insufficient for docker-required tools
      expect(() => pm.assertSandboxMode('agent-1', 'exec', 'non-main')).toThrow(SandboxRequiredError);
    });
  });

  // ============================================================================
  // Resource Limit Checks
  // ============================================================================

  describe('Resource Limit Checks', () => {
    beforeEach(() => {
      pm.registerAgent('agent-1', {
        maxTokens: 1000,
        maxCost: 1.0,
        maxDuration: 60,
      });
    });

    it('should allow usage within limits', () => {
      const result = pm.checkResourceLimits('agent-1', {
        tokens: 500,
        cost: 0.5,
        duration: 30,
      });

      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect token limit violation', () => {
      const result = pm.checkResourceLimits('agent-1', {
        tokens: 1500,
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v: string) => v.includes('Token'))).toBe(true);
    });

    it('should detect cost limit violation', () => {
      const result = pm.checkResourceLimits('agent-1', {
        cost: 1.5,
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v: string) => v.includes('Cost'))).toBe(true);
    });

    it('should detect duration limit violation', () => {
      const result = pm.checkResourceLimits('agent-1', {
        duration: 120,
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v: string) => v.includes('Duration'))).toBe(true);
    });

    it('should throw ResourceLimitExceededError in assert mode', () => {
      expect(() => pm.assertResourceLimits('agent-1', { tokens: 1500 })).toThrow(ResourceLimitExceededError);
    });

    it('should handle multiple violations', () => {
      const result = pm.checkResourceLimits('agent-1', {
        tokens: 2000,
        cost: 2.0,
        duration: 300,
      });

      expect(result.allowed).toBe(false);
      expect(result.violations).toHaveLength(3);
    });
  });

  // ============================================================================
  // Permission Inheritance
  // ============================================================================

  describe('Permission Inheritance', () => {
    it('should inherit permissions from parent', () => {
      pm.registerAgent('parent', {
        allowedTools: ['read', 'write'],
        maxTokens: 10000,
        canSpawnAgents: true,
      });

      const childPerms = pm.registerAgent('child', {}, 'parent');

      expect(childPerms.allowedTools).toContain('read');
      expect(childPerms.allowedTools).toContain('write');
    });

    it('should track parent-child relationships', () => {
      pm.registerAgent('parent', {});
      pm.registerAgent('child', {}, 'parent');

      expect(pm.getParentId('child')).toBe('parent');
      expect(pm.getChildIds('parent')).toContain('child');
    });

    it('should compute ancestry chain', () => {
      pm.registerAgent('grandparent', {});
      pm.registerAgent('parent', {}, 'grandparent');
      pm.registerAgent('child', {}, 'parent');

      const ancestry = pm.getAncestry('child');
      expect(ancestry).toEqual(['parent', 'grandparent']);
    });

    it('should calculate permission depth', () => {
      pm.registerAgent('root', {});
      pm.registerAgent('level1', {}, 'root');
      pm.registerAgent('level2', {}, 'level1');

      expect(pm.getPermissionDepth('root')).toBe(0);
      expect(pm.getPermissionDepth('level1')).toBe(1);
      expect(pm.getPermissionDepth('level2')).toBe(2);
    });

    it('should propagate resource limit changes to children', () => {
      pm.registerAgent('parent', { maxTokens: 10000 });
      pm.registerAgent('child', {}, 'parent');

      pm.updatePermissions('parent', { maxTokens: 5000 });

      const childPerms = pm.getPermissions('child');
      // Child's resource limits should be updated (with multiplier applied)
      expect(childPerms?.maxTokens).toBeLessThanOrEqual(5000);
    });
  });

  // ============================================================================
  // Violation Handling
  // ============================================================================

  describe('Violation Handling', () => {
    it('should record violations', () => {
      pm.registerAgent('agent-1', {});

      pm.recordViolation({
        agentId: 'agent-1',
        tool: 'exec',
        action: 'attempted_unauthorized_exec',
        severity: 'high',
      });

      const violations = pm.getViolations('agent-1');
      expect(violations).toHaveLength(1);
      expect(violations[0].tool).toBe('exec');
      expect(violations[0].severity).toBe('high');
    });

    it('should track violation count', () => {
      pm.registerAgent('agent-1', {});

      pm.recordViolation({ agentId: 'agent-1', tool: 't1', action: 'a1', severity: 'low' });
      pm.recordViolation({ agentId: 'agent-1', tool: 't2', action: 'a2', severity: 'medium' });

      expect(pm.getViolationCount('agent-1')).toBe(2);
    });

    it('should reset violation count', () => {
      pm.registerAgent('agent-1', {});
      pm.recordViolation({ agentId: 'agent-1', tool: 't1', action: 'a1', severity: 'low' });

      pm.resetViolationCount('agent-1');

      expect(pm.getViolationCount('agent-1')).toBe(0);
    });

    it('should emit violation events', () => {
      pm.registerAgent('agent-1', {});
      
      const handler = jest.fn();
      pm.on('violation.detected', handler);

      pm.recordViolation({ agentId: 'agent-1', tool: 'exec', action: 'a1', severity: 'high' });

      expect(handler).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // Audit Logging
  // ============================================================================

  describe('Audit Logging', () => {
    beforeEach(() => {
      pm.registerAgent('agent-1', { allowedTools: ['read'], deniedTools: ['exec'] });
    });

    it('should log permission checks', () => {
      pm.checkToolPermission('agent-1', 'read', false);
      pm.checkToolPermission('agent-1', 'exec', false);

      const log = pm.getAuditLog('agent-1');
      expect(log?.checks).toHaveLength(2);
    });

    it('should retrieve recent checks', () => {
      pm.checkToolPermission('agent-1', 'read', false);
      pm.checkToolPermission('agent-1', 'read', false);
      pm.checkToolPermission('agent-1', 'write', false);

      const recent = pm.getRecentChecks('agent-1', 2);
      expect(recent).toHaveLength(2);
    });

    it('should track allowed and denied checks', () => {
      pm.checkToolPermission('agent-1', 'read', false);
      pm.checkToolPermission('agent-1', 'exec', false);

      const recent = pm.getRecentChecks('agent-1');
      expect(recent[0].allowed).toBe(true);
      expect(recent[1].allowed).toBe(false);
    });
  });

  // ============================================================================
  // Queries
  // ============================================================================

  describe('Queries', () => {
    beforeEach(() => {
      pm.registerAgent('agent-1', { sandboxMode: 'docker', canSpawnAgents: true });
      pm.registerAgent('agent-2', { sandboxMode: 'none', canSpawnAgents: false });
      pm.registerAgent('agent-3', { sandboxMode: 'docker', allowedTools: ['read'], canSpawnAgents: false });
    });

    it('should get all agent IDs', () => {
      const ids = pm.getAllAgentIds();
      expect(ids).toHaveLength(3);
      expect(ids).toContain('agent-1');
      expect(ids).toContain('agent-2');
      expect(ids).toContain('agent-3');
    });

    it('should filter agents by spawn permission', () => {
      const canSpawn = pm.filterAgents({ canSpawnAgents: true });
      expect(canSpawn).toEqual(['agent-1']);

      const cannotSpawn = pm.filterAgents({ canSpawnAgents: false });
      expect(cannotSpawn).toContain('agent-2');
      expect(cannotSpawn).toContain('agent-3');
    });

    it('should filter agents by sandbox mode', () => {
      const dockerAgents = pm.filterAgents({ sandboxMode: 'docker' });
      expect(dockerAgents).toContain('agent-1');
      expect(dockerAgents).toContain('agent-3');
    });

    it('should filter agents by tool permission', () => {
      const canRead = pm.filterAgents({ hasTool: 'read' });
      expect(canRead).toContain('agent-3');
    });

    it('should provide summary statistics', () => {
      const summary = pm.getSummary();

      expect(summary.totalAgents).toBe(3);
      expect(summary.bySandboxMode.docker).toBe(2);
      expect(summary.bySandboxMode.none).toBe(1);
      expect(summary.bySpawnPermission.canSpawn).toBe(1);
      expect(summary.bySpawnPermission.cannotSpawn).toBe(2);
    });
  });

  // ============================================================================
  // Permission Updates
  // ============================================================================

  describe('Permission Updates', () => {
    beforeEach(() => {
      pm.registerAgent('agent-1', { allowedTools: ['read'], maxTokens: 1000 });
    });

    it('should update permissions', () => {
      const updated = pm.updatePermissions('agent-1', { maxTokens: 2000 });

      expect(updated.maxTokens).toBe(2000);
      expect(pm.getPermissions('agent-1')?.maxTokens).toBe(2000);
    });

    it('should validate permission updates', () => {
      expect(() => pm.updatePermissions('agent-1', { maxDuration: -1 })).toThrow();
    });

    it('should revoke specific permissions', () => {
      pm.revokePermission('agent-1', 'canSpawnAgents');

      const perms = pm.getPermissions('agent-1');
      expect(perms?.canSpawnAgents).toBe(false);
    });

    it('should deny all tools when allowedTools revoked', () => {
      pm.revokePermission('agent-1', 'allowedTools');

      const perms = pm.getPermissions('agent-1');
      expect(perms?.allowedTools).toEqual([]);
    });
  });
});

describe('computeInheritedPermissions', () => {
  it('should inherit all parent permissions when inheritance enabled', () => {
    const parent: typeof DEFAULT_PERMISSIONS = {
      ...DEFAULT_PERMISSIONS,
      allowedTools: ['read', 'write'],
      maxTokens: 10000,
    };

    const child = computeInheritedPermissions(parent, {}, { 
      inheritPermissions: true, 
      restrictChildPermissions: true,
      resourceMultiplier: 0.5,
      alwaysDenyChildren: [],
      alwaysAllowChildren: [],
      maxInheritanceDepth: 3,
    });

    expect(child.allowedTools).toContain('read');
    expect(child.maxTokens).toBe(5000); // Should be reduced by multiplier
  });

  it('should not inherit when inheritance disabled', () => {
    const parent: typeof DEFAULT_PERMISSIONS = {
      ...DEFAULT_PERMISSIONS,
      allowedTools: ['read', 'write', 'exec'],  // Parent has extra tools
    };

    const child = computeInheritedPermissions(parent, {}, { 
      inheritPermissions: false,
      restrictChildPermissions: false,
      resourceMultiplier: 1,
      alwaysDenyChildren: [],
      alwaysAllowChildren: [],
      maxInheritanceDepth: 3,
    });

    // Child should have defaults, not parent's tools
    expect(child.allowedTools).not.toEqual(parent.allowedTools);
    // Child should have default allowed tools
    expect(child.allowedTools).toContain('read');
  });

  it('should apply alwaysDenyChildren', () => {
    const parent: typeof DEFAULT_PERMISSIONS = {
      ...DEFAULT_PERMISSIONS,
      allowedTools: ['read', 'exec'],
      deniedTools: [],
    };

    const child = computeInheritedPermissions(
      parent,
      {},
      { 
        inheritPermissions: true, 
        alwaysDenyChildren: ['exec'],
        restrictChildPermissions: true,
        resourceMultiplier: 0.5,
        alwaysAllowChildren: [],
        maxInheritanceDepth: 3,
      }
    );

    expect(child.allowedTools).toContain('read');
    expect(child.deniedTools).toContain('exec');
    expect(child.allowedTools).not.toContain('exec');
  });

  it('should apply resource multiplier', () => {
    const parent: typeof DEFAULT_PERMISSIONS = {
      ...DEFAULT_PERMISSIONS,
      maxTokens: 10000,
      maxCost: 10,
    };

    const child = computeInheritedPermissions(
      parent,
      {},
      { 
        inheritPermissions: true, 
        restrictChildPermissions: true, 
        resourceMultiplier: 0.5,
        alwaysDenyChildren: [],
        alwaysAllowChildren: [],
        maxInheritanceDepth: 3,
      }
    );

    expect(child.maxTokens).toBe(5000);
    expect(child.maxCost).toBe(5);
  });
});

describe('Security Profiles', () => {
  it('should have main profile with full access', () => {
    const profile = SECURITY_PROFILES['main'];
    expect(profile.permissions.canSpawnAgents).toBe(true);
    expect(profile.allowedPaths).toContain('*');
  });

  it('should have untrusted profile with restrictions', () => {
    const profile = SECURITY_PROFILES['untrusted'];
    expect(profile.permissions.sandboxMode).toBe('docker');
    expect(profile.permissions.requireApproval).toBe(true);
    expect(profile.deniedPaths).toContain('*');
  });

  it('should have analysis profile with read-only access', () => {
    const profile = SECURITY_PROFILES['analysis'];
    expect(profile.permissions.allowedTools).toContain('read');
    expect(profile.permissions.allowedTools).not.toContain('write');
  });
});

describe('DANGEROUS_TOOLS', () => {
  it('should include exec', () => {
    expect(DANGEROUS_TOOLS).toContain('exec');
  });

  it('should include browser', () => {
    expect(DANGEROUS_TOOLS).toContain('browser');
  });

  it('should include sessions_spawn', () => {
    expect(DANGEROUS_TOOLS).toContain('sessions_spawn');
  });
});
