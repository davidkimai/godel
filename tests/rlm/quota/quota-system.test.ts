/**
 * Agent 67-69: Quota System Tests
 * Tests for user, team, and enterprise quota management
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { UserQuotaManager } from '../../../src/core/rlm/quota/user-quotas.js';
import { TeamQuotaManager } from '../../../src/core/rlm/quota/team-quotas.js';
import { EnterpriseQuotaManager } from '../../../src/core/rlm/quota/enterprise-quotas.js';

describe('User Quota Manager', () => {
  let manager: UserQuotaManager;

  beforeEach(() => {
    manager = new UserQuotaManager();
  });

  describe('Quota Configuration', () => {
    it('should set and retrieve user quotas', () => {
      manager.setUserQuotas({
        userId: 'user-1',
        dailyAgentLimit: 100,
        weeklyAgentLimit: 500,
        monthlyAgentLimit: 2000,
        dailyComputeHours: 24,
        maxConcurrentAgents: 10,
        maxStorageGB: 100,
      });

      const quotas = manager.getUserQuotas('user-1');
      expect(quotas).toBeDefined();
      expect(quotas?.dailyAgentLimit).toBe(100);
    });

    it('should emit event when quotas configured', () => {
      let eventReceived = false;
      manager.on('quota:configured', (event) => {
        eventReceived = true;
        expect(event.userId).toBe('user-1');
      });

      manager.setUserQuotas({
        userId: 'user-1',
        dailyAgentLimit: 100,
        weeklyAgentLimit: 500,
        monthlyAgentLimit: 2000,
        dailyComputeHours: 24,
        maxConcurrentAgents: 10,
        maxStorageGB: 100,
      });

      expect(eventReceived).toBe(true);
    });
  });

  describe('Agent Allocation', () => {
    beforeEach(() => {
      manager.setUserQuotas({
        userId: 'user-1',
        dailyAgentLimit: 10,
        weeklyAgentLimit: 50,
        monthlyAgentLimit: 200,
        dailyComputeHours: 24,
        maxConcurrentAgents: 5,
        maxStorageGB: 100,
      });
    });

    it('should allow allocation within quota', () => {
      const result = manager.canAllocateAgents('user-1', 3, 'session-1');
      expect(result.allowed).toBe(true);
    });

    it('should track daily quota usage', () => {
      // Allocate agents first
      manager.allocateAgents('user-1', 5, 'session-1');
      
      // Check quota tracking
      const status = manager.getDailyQuotaStatus('user-1');
      expect(status.agentsUsed).toBe(5);
      expect(status.agentsRemaining).toBe(5);
    });

    it('should deny allocation exceeding concurrent limit', () => {
      const result = manager.canAllocateAgents('user-1', 10, 'session-1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Concurrent agent limit exceeded');
    });

    it('should successfully allocate agents', () => {
      const result = manager.allocateAgents('user-1', 3, 'session-1');
      expect(result).toBe(true);

      const status = manager.getDailyQuotaStatus('user-1');
      expect(status.agentsUsed).toBe(3);
      expect(status.currentConcurrentAgents).toBe(3);
    });

    it('should release agents correctly', () => {
      manager.allocateAgents('user-1', 3, 'session-1');
      manager.releaseAgents('user-1', 2, 'session-1');

      const status = manager.getDailyQuotaStatus('user-1');
      expect(status.currentConcurrentAgents).toBe(1);
    });
  });

  describe('Quota Status', () => {
    beforeEach(() => {
      manager.setUserQuotas({
        userId: 'user-1',
        dailyAgentLimit: 100,
        weeklyAgentLimit: 500,
        monthlyAgentLimit: 2000,
        dailyComputeHours: 24,
        maxConcurrentAgents: 10,
        maxStorageGB: 100,
      });
      manager.allocateAgents('user-1', 10, 'session-1');
    });

    it('should return daily quota status', () => {
      const status = manager.getDailyQuotaStatus('user-1');
      expect(status.period).toBe('daily');
      expect(status.agentsUsed).toBe(10);
      expect(status.agentsLimit).toBe(100);
      expect(status.agentsRemaining).toBe(90);
    });

    it('should return weekly quota status', () => {
      const status = manager.getWeeklyQuotaStatus('user-1');
      expect(status.period).toBe('weekly');
      expect(status.agentsLimit).toBe(500);
    });

    it('should return monthly quota status', () => {
      const status = manager.getMonthlyQuotaStatus('user-1');
      expect(status.period).toBe('monthly');
      expect(status.agentsLimit).toBe(2000);
    });

    it('should return all quota statuses', () => {
      const statuses = manager.getAllQuotaStatuses('user-1');
      expect(statuses.daily).toBeDefined();
      expect(statuses.weekly).toBeDefined();
      expect(statuses.monthly).toBeDefined();
    });

    it('should track quota usage accurately', () => {
      // Note: session-1 already has 10 agents (max concurrent)
      // Additional allocations would fail concurrent limit check
      const status = manager.getDailyQuotaStatus('user-1');
      expect(status.agentsUsed).toBe(10); // from beforeEach
      expect(status.exceeded).toBe(false);
    });
  });

  describe('Dashboard API', () => {
    it('should return quota overview', () => {
      manager.setUserQuotas({
        userId: 'user-1',
        dailyAgentLimit: 100,
        weeklyAgentLimit: 500,
        monthlyAgentLimit: 2000,
        dailyComputeHours: 24,
        maxConcurrentAgents: 10,
        maxStorageGB: 100,
      });

      const overview = manager.getDashboardOverview();
      expect(overview.totalUsers).toBe(1);
      expect(overview.usersOverLimit).toEqual([]);
    });

    it('should return user details', () => {
      manager.setUserQuotas({
        userId: 'user-1',
        dailyAgentLimit: 100,
        weeklyAgentLimit: 500,
        monthlyAgentLimit: 2000,
        dailyComputeHours: 24,
        maxConcurrentAgents: 10,
        maxStorageGB: 100,
      });

      const details = manager.getUserDetails('user-1');
      expect(details).not.toBeNull();
      expect(details?.quotas?.userId).toBe('user-1');
      expect(details?.statuses.daily).toBeDefined();
    });
  });
});

describe('Team Quota Manager', () => {
  let manager: TeamQuotaManager;

  beforeEach(() => {
    manager = new TeamQuotaManager();
  });

  describe('Team Configuration', () => {
    it('should create team quotas', () => {
      manager.setTeamQuotas({
        teamId: 'team-1',
        teamName: 'Engineering',
        totalAgentPool: 1000,
        totalComputeHours: 10000,
        totalStorageGB: 5000,
        maxConcurrentAgents: 100,
        memberLimit: 20,
        projectLimit: 10,
        allowQuotaTransfers: true,
        autoReallocation: true,
      });

      const quotas = manager.getTeamQuotas('team-1');
      expect(quotas?.teamName).toBe('Engineering');
    });
  });

  describe('Member Management', () => {
    beforeEach(() => {
      manager.setTeamQuotas({
        teamId: 'team-1',
        teamName: 'Engineering',
        totalAgentPool: 1000,
        totalComputeHours: 10000,
        totalStorageGB: 5000,
        maxConcurrentAgents: 100,
        memberLimit: 5,
        projectLimit: 10,
        allowQuotaTransfers: true,
        autoReallocation: false,
      });
    });

    it('should add team members', () => {
      const result = manager.addTeamMember('team-1', 'user-1', 'admin');
      expect(result).toBe(true);
    });

    it('should reject member when limit reached', () => {
      manager.addTeamMember('team-1', 'user-1');
      manager.addTeamMember('team-1', 'user-2');
      manager.addTeamMember('team-1', 'user-3');
      manager.addTeamMember('team-1', 'user-4');
      manager.addTeamMember('team-1', 'user-5');
      
      const result = manager.addTeamMember('team-1', 'user-6');
      expect(result).toBe(false);
    });
  });

  describe('Project Management', () => {
    beforeEach(() => {
      manager.setTeamQuotas({
        teamId: 'team-1',
        teamName: 'Engineering',
        totalAgentPool: 1000,
        totalComputeHours: 10000,
        totalStorageGB: 5000,
        maxConcurrentAgents: 100,
        memberLimit: 20,
        projectLimit: 3,
        allowQuotaTransfers: true,
        autoReallocation: false,
      });
      manager.addTeamMember('team-1', 'user-1');
    });

    it('should create project with quotas', () => {
      const result = manager.createProject(
        'team-1',
        'project-1',
        'Web App',
        { agents: 100, computeHours: 1000, storageGB: 500 },
        ['user-1']
      );
      expect(result).toBe(true);
    });

    it('should reject project exceeding quota', () => {
      const result = manager.createProject(
        'team-1',
        'project-1',
        'Big Project',
        { agents: 2000, computeHours: 1000, storageGB: 500 },
        ['user-1']
      );
      expect(result).toBe(false);
    });
  });
});

describe('Enterprise Quota Manager', () => {
  let manager: EnterpriseQuotaManager;

  beforeEach(() => {
    manager = new EnterpriseQuotaManager();
  });

  describe('Organization Management', () => {
    it('should create root organization', () => {
      const org = manager.createOrganization(
        'org-1',
        'Acme Corp',
        undefined,
        { agents: 10000, computeHours: 100000, storageGB: 50000 }
      );
      expect(org).not.toBeNull();
      expect(org?.orgName).toBe('Acme Corp');
      expect(org?.level).toBe(0);
    });

    it('should create child organization', () => {
      manager.createOrganization(
        'org-1',
        'Acme Corp',
        undefined,
        { agents: 10000, computeHours: 100000, storageGB: 50000 }
      );

      const child = manager.createOrganization(
        'org-2',
        'Engineering',
        'org-1',
        { agents: 5000, computeHours: 50000, storageGB: 25000 }
      );
      expect(child?.level).toBe(1);
      expect(child?.parentOrgId).toBe('org-1');
    });

    it('should reject org exceeding parent quota', () => {
      manager.createOrganization(
        'org-1',
        'Acme Corp',
        undefined,
        { agents: 100, computeHours: 1000, storageGB: 500 }
      );

      const child = manager.createOrganization(
        'org-2',
        'Engineering',
        'org-1',
        { agents: 200, computeHours: 1000, storageGB: 500 }
      );
      expect(child).toBeNull();
    });
  });

  describe('Hierarchy', () => {
    beforeEach(() => {
      manager.createOrganization(
        'org-1',
        'Acme Corp',
        undefined,
        { agents: 10000, computeHours: 100000, storageGB: 50000 }
      );
      manager.createOrganization(
        'org-2',
        'Engineering',
        'org-1',
        { agents: 5000, computeHours: 50000, storageGB: 25000 }
      );
      manager.createOrganization(
        'org-3',
        'Product',
        'org-1',
        { agents: 3000, computeHours: 30000, storageGB: 15000 }
      );
    });

    it('should return organization hierarchy', () => {
      const hierarchy = manager.getOrganizationHierarchy('org-2');
      expect(hierarchy).not.toBeNull();
      expect(hierarchy?.ancestors.length).toBe(1);
      expect(hierarchy?.ancestors[0].orgId).toBe('org-1');
      expect(hierarchy?.siblings.length).toBe(1);
    });

    it('should list all organizations', () => {
      const orgs = manager.listOrganizations();
      expect(orgs.length).toBe(3);
      expect(orgs[0].level).toBe(0); // Root first
    });
  });

  describe('Compliance', () => {
    it('should export compliance report', () => {
      manager.createOrganization(
        'org-1',
        'Acme Corp',
        undefined,
        { agents: 10000, computeHours: 100000, storageGB: 50000 }
      );

      const report = manager.exportComplianceReport();
      expect(report.organizations).toBe(1);
      expect(report.violations).toEqual([]);
    });
  });
});
