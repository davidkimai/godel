/**
 * Agent 69: Enterprise Quota Management
 * Multi-tenant quota isolation with organization hierarchies
 * Custom quota policies and admin controls
 */

import { EventEmitter } from 'events';
import { UserQuotaConfig } from './user-quotas.js';
import { TeamQuotaConfig, TeamMember, ProjectAllocation } from './team-quotas.js';

export interface Organization {
  orgId: string;
  orgName: string;
  parentOrgId?: string;
  level: number; // 0 = root, 1 = division, 2 = department, etc.
  totalAgentPool: number;
  totalComputeHours: number;
  totalStorageGB: number;
  maxTeams: number;
  maxUsers: number;
  children: string[]; // orgIds of child organizations
  teams: string[]; // teamIds
  settings: OrganizationSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrganizationSettings {
  enforceStrictHierarchy: boolean;
  allowCrossOrgSharing: boolean;
  requireApprovalForLargeAllocations: boolean;
  largeAllocationThreshold: number;
  autoSuspendOnViolation: boolean;
  violationThreshold: number;
  customPolicies: CustomPolicy[];
}

export interface CustomPolicy {
  policyId: string;
  name: string;
  type: 'time_based' | 'usage_based' | 'priority_based' | 'conditional';
  rules: PolicyRule[];
  priority: number;
  enabled: boolean;
}

export interface PolicyRule {
  condition: 'time_of_day' | 'day_of_week' | 'usage_threshold' | 'user_role' | 'project_type';
  operator: 'equals' | 'greater_than' | 'less_than' | 'in' | 'not_in';
  value: unknown;
  action: 'allow' | 'deny' | 'increase_quota' | 'decrease_quota' | 'require_approval';
  actionValue?: unknown;
}

export interface TenantIsolation {
  tenantId: string;
  orgId: string;
  dataIsolationLevel: 'strict' | 'logical' | 'shared';
  networkIsolation: boolean;
  storageEncryption: boolean;
  auditLogging: boolean;
  complianceFrameworks: string[];
}

export interface AdminAction {
  actionId: string;
  adminId: string;
  orgId?: string;
  teamId?: string;
  userId?: string;
  actionType: 'create_org' | 'update_quota' | 'suspend_user' | 'transfer_quota' | 'apply_policy' | 'audit_export';
  details: Record<string, unknown>;
  timestamp: Date;
  ipAddress: string;
}

export interface QuotaTemplate {
  templateId: string;
  name: string;
  description: string;
  userQuotas: Partial<UserQuotaConfig>;
  teamQuotas: Partial<TeamQuotaConfig>;
  applicableOrgs: string[];
  isDefault: boolean;
}

export class EnterpriseQuotaManager extends EventEmitter {
  private organizations = new Map<string, Organization>();
  private tenantIsolations = new Map<string, TenantIsolation>();
  private adminActions: AdminAction[] = [];
  private quotaTemplates = new Map<string, QuotaTemplate>();
  private orgHierarchy = new Map<string, Set<string>>(); // parent -> children
  
  private metrics = {
    totalOrganizations: 0,
    totalTenants: 0,
    totalUsers: 0,
    totalTeams: 0,
    activePolicies: 0,
    adminActionsLast30Days: 0,
  };

  /**
   * Create organization
   */
  createOrganization(
    orgId: string,
    orgName: string,
    parentOrgId: string | undefined,
    quotas: { agents: number; computeHours: number; storageGB: number }
  ): Organization | null {
    let level = 0;
    
    if (parentOrgId) {
      const parent = this.organizations.get(parentOrgId);
      if (!parent) {
        this.emit('error', { type: 'parent_not_found', parentOrgId });
        return null;
      }
      level = parent.level + 1;
      
      // Check parent has available quotas
      const parentUsage = this.getOrganizationUsage(parentOrgId);
      if (parentUsage.availableAgents < quotas.agents) {
        this.emit('org:create_rejected', { orgId, reason: 'Parent has insufficient agent quota' });
        return null;
      }
    }

    const now = new Date();
    const org: Organization = {
      orgId,
      orgName,
      parentOrgId,
      level,
      totalAgentPool: quotas.agents,
      totalComputeHours: quotas.computeHours,
      totalStorageGB: quotas.storageGB,
      maxTeams: 10 * (4 - level), // Fewer teams at deeper levels
      maxUsers: 100 * (4 - level),
      children: [],
      teams: [],
      settings: {
        enforceStrictHierarchy: true,
        allowCrossOrgSharing: false,
        requireApprovalForLargeAllocations: true,
        largeAllocationThreshold: 100,
        autoSuspendOnViolation: false,
        violationThreshold: 3,
        customPolicies: [],
      },
      createdAt: now,
      updatedAt: now,
    };

    this.organizations.set(orgId, org);
    this.metrics.totalOrganizations++;

    // Update parent's children list
    if (parentOrgId) {
      const parent = this.organizations.get(parentOrgId)!;
      parent.children.push(orgId);
      
      const siblings = this.orgHierarchy.get(parentOrgId) || new Set();
      siblings.add(orgId);
      this.orgHierarchy.set(parentOrgId, siblings);
    }

    this.emit('org:created', { orgId, orgName, parentOrgId, level });
    return org;
  }

  /**
   * Delete organization
   */
  deleteOrganization(orgId: string, adminId: string): boolean {
    const org = this.organizations.get(orgId);
    if (!org) return false;

    // Cannot delete if has children
    if (org.children.length > 0) {
      this.emit('org:delete_rejected', { orgId, reason: 'Organization has child organizations' });
      return false;
    }

    // Cannot delete if has teams
    if (org.teams.length > 0) {
      this.emit('org:delete_rejected', { orgId, reason: 'Organization has teams' });
      return false;
    }

    // Remove from parent's children
    if (org.parentOrgId) {
      const parent = this.organizations.get(org.parentOrgId);
      if (parent) {
        const idx = parent.children.indexOf(orgId);
        if (idx >= 0) parent.children.splice(idx, 1);
      }

      const siblings = this.orgHierarchy.get(org.parentOrgId);
      if (siblings) {
        siblings.delete(orgId);
      }
    }

    this.organizations.delete(orgId);
    this.metrics.totalOrganizations--;

    this.logAdminAction(adminId, 'create_org', { orgId, deleted: true });
    this.emit('org:deleted', { orgId });
    return true;
  }

  /**
   * Update organization quotas
   */
  updateOrganizationQuotas(
    orgId: string,
    quotas: { agents?: number; computeHours?: number; storageGB?: number },
    adminId: string
  ): boolean {
    const org = this.organizations.get(orgId);
    if (!org) return false;

    // Check parent has capacity for increase
    if (org.parentOrgId && (quotas.agents || quotas.computeHours || quotas.storageGB)) {
      const parent = this.organizations.get(org.parentOrgId);
      if (parent) {
        const parentUsage = this.getOrganizationUsage(org.parentOrgId);
        const agentIncrease = (quotas.agents || org.totalAgentPool) - org.totalAgentPool;
        
        if (agentIncrease > 0 && parentUsage.availableAgents < agentIncrease) {
          this.emit('quota:update_rejected', { orgId, reason: 'Parent has insufficient capacity' });
          return false;
        }
      }
    }

    if (quotas.agents !== undefined) org.totalAgentPool = quotas.agents;
    if (quotas.computeHours !== undefined) org.totalComputeHours = quotas.computeHours;
    if (quotas.storageGB !== undefined) org.totalStorageGB = quotas.storageGB;
    
    org.updatedAt = new Date();

    this.logAdminAction(adminId, 'update_quota', { orgId, quotas });
    this.emit('org:quotas_updated', { orgId, quotas });
    return true;
  }

  /**
   * Add team to organization
   */
  addTeamToOrganization(orgId: string, teamId: string, adminId: string): boolean {
    const org = this.organizations.get(orgId);
    if (!org) return false;

    if (org.teams.length >= org.maxTeams) {
      this.emit('team:add_rejected', { orgId, teamId, reason: 'Team limit reached' });
      return false;
    }

    org.teams.push(teamId);
    this.metrics.totalTeams++;

    this.logAdminAction(adminId, 'create_org', { orgId, teamId, action: 'add_team' });
    this.emit('team:added_to_org', { orgId, teamId });
    return true;
  }

  /**
   * Remove team from organization
   */
  removeTeamFromOrganization(orgId: string, teamId: string, adminId: string): boolean {
    const org = this.organizations.get(orgId);
    if (!org) return false;

    const idx = org.teams.indexOf(teamId);
    if (idx < 0) return false;

    org.teams.splice(idx, 1);
    this.metrics.totalTeams--;

    this.logAdminAction(adminId, 'create_org', { orgId, teamId, action: 'remove_team' });
    this.emit('team:removed_from_org', { orgId, teamId });
    return true;
  }

  /**
   * Create tenant isolation configuration
   */
  createTenantIsolation(config: Omit<TenantIsolation, 'tenantId'> & { tenantId: string }): TenantIsolation {
    this.tenantIsolations.set(config.tenantId, config);
    this.metrics.totalTenants++;

    this.emit('tenant:created', { tenantId: config.tenantId, orgId: config.orgId });
    return config;
  }

  /**
   * Get tenant isolation configuration
   */
  getTenantIsolation(tenantId: string): TenantIsolation | undefined {
    return this.tenantIsolations.get(tenantId);
  }

  /**
   * Create custom policy
   */
  createCustomPolicy(orgId: string, policy: Omit<CustomPolicy, 'policyId'>): CustomPolicy | null {
    const org = this.organizations.get(orgId);
    if (!org) return null;

    const newPolicy: CustomPolicy = {
      ...policy,
      policyId: `policy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    org.settings.customPolicies.push(newPolicy);
    if (newPolicy.enabled) {
      this.metrics.activePolicies++;
    }

    this.emit('policy:created', { orgId, policy: newPolicy });
    return newPolicy;
  }

  /**
   * Update custom policy
   */
  updateCustomPolicy(orgId: string, policyId: string, updates: Partial<CustomPolicy>): boolean {
    const org = this.organizations.get(orgId);
    if (!org) return false;

    const policy = org.settings.customPolicies.find(p => p.policyId === policyId);
    if (!policy) return false;

    const wasEnabled = policy.enabled;
    Object.assign(policy, updates);

    if (wasEnabled !== policy.enabled) {
      this.metrics.activePolicies += policy.enabled ? 1 : -1;
    }

    this.emit('policy:updated', { orgId, policyId, updates });
    return true;
  }

  /**
   * Delete custom policy
   */
  deleteCustomPolicy(orgId: string, policyId: string): boolean {
    const org = this.organizations.get(orgId);
    if (!org) return false;

    const idx = org.settings.customPolicies.findIndex(p => p.policyId === policyId);
    if (idx < 0) return false;

    const policy = org.settings.customPolicies[idx];
    if (policy.enabled) {
      this.metrics.activePolicies--;
    }

    org.settings.customPolicies.splice(idx, 1);
    this.emit('policy:deleted', { orgId, policyId });
    return true;
  }

  /**
   * Create quota template
   */
  createQuotaTemplate(template: Omit<QuotaTemplate, 'templateId'>): QuotaTemplate {
    const newTemplate: QuotaTemplate = {
      ...template,
      templateId: `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    this.quotaTemplates.set(newTemplate.templateId, newTemplate);

    if (newTemplate.isDefault) {
      // Unset other defaults for same orgs
      for (const t of this.quotaTemplates.values()) {
        if (t.templateId !== newTemplate.templateId && 
            t.isDefault && 
            t.applicableOrgs.some(org => newTemplate.applicableOrgs.includes(org))) {
          t.isDefault = false;
        }
      }
    }

    this.emit('template:created', { template: newTemplate });
    return newTemplate;
  }

  /**
   * Apply quota template to organization
   */
  applyQuotaTemplate(templateId: string, orgId: string, adminId: string): boolean {
    const template = this.quotaTemplates.get(templateId);
    const org = this.organizations.get(orgId);
    
    if (!template || !org) return false;
    if (!template.applicableOrgs.includes(orgId) && template.applicableOrgs.length > 0) {
      this.emit('template:apply_rejected', { templateId, orgId, reason: 'Template not applicable to organization' });
      return false;
    }

    // Apply user quota defaults (would integrate with UserQuotaManager)
    // Apply team quota defaults (would integrate with TeamQuotaManager)

    this.logAdminAction(adminId, 'apply_policy', { templateId, orgId });
    this.emit('template:applied', { templateId, orgId });
    return true;
  }

  /**
   * Get organization hierarchy
   */
  getOrganizationHierarchy(orgId: string): {
    org: Organization;
    ancestors: Organization[];
    descendants: Organization[];
    siblings: Organization[];
  } | null {
    const org = this.organizations.get(orgId);
    if (!org) return null;

    // Get ancestors
    const ancestors: Organization[] = [];
    let currentId = org.parentOrgId;
    while (currentId) {
      const parent = this.organizations.get(currentId);
      if (parent) {
        ancestors.unshift(parent);
        currentId = parent.parentOrgId;
      } else {
        break;
      }
    }

    // Get descendants
    const descendants: Organization[] = [];
    const collectDescendants = (parentId: string) => {
      const parent = this.organizations.get(parentId);
      if (parent) {
        for (const childId of parent.children) {
          const child = this.organizations.get(childId);
          if (child) {
            descendants.push(child);
            collectDescendants(childId);
          }
        }
      }
    };
    collectDescendants(orgId);

    // Get siblings
    const siblings: Organization[] = [];
    if (org.parentOrgId) {
      const parent = this.organizations.get(org.parentOrgId);
      if (parent) {
        for (const siblingId of parent.children) {
          if (siblingId !== orgId) {
            const sibling = this.organizations.get(siblingId);
            if (sibling) siblings.push(sibling);
          }
        }
      }
    }

    return { org, ancestors, descendants, siblings };
  }

  /**
   * Get organization usage
   */
  getOrganizationUsage(orgId: string): {
    usedAgents: number;
    usedCompute: number;
    usedStorage: number;
    availableAgents: number;
    availableCompute: number;
    availableStorage: number;
    teamCount: number;
    userCount: number;
  } {
    const org = this.organizations.get(orgId);
    if (!org) {
      return { usedAgents: 0, usedCompute: 0, usedStorage: 0, availableAgents: 0, availableCompute: 0, availableStorage: 0, teamCount: 0, userCount: 0 };
    }

    // Sum quotas from all descendant orgs
    let usedAgents = 0;
    let usedCompute = 0;
    let usedStorage = 0;

    const hierarchy = this.getOrganizationHierarchy(orgId);
    if (hierarchy) {
      for (const child of hierarchy.descendants) {
        usedAgents += child.totalAgentPool;
        usedCompute += child.totalComputeHours;
        usedStorage += child.totalStorageGB;
      }
    }

    return {
      usedAgents,
      usedCompute,
      usedStorage,
      availableAgents: org.totalAgentPool - usedAgents,
      availableCompute: org.totalComputeHours - usedCompute,
      availableStorage: org.totalStorageGB - usedStorage,
      teamCount: org.teams.length,
      userCount: 0, // Would need to integrate with UserQuotaManager
    };
  }

  /**
   * Get admin audit log
   */
  getAdminAuditLog(options?: {
    adminId?: string;
    orgId?: string;
    actionType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): AdminAction[] {
    let logs = [...this.adminActions];

    if (options?.adminId) {
      logs = logs.filter(a => a.adminId === options.adminId);
    }
    if (options?.orgId) {
      logs = logs.filter(a => a.orgId === options.orgId);
    }
    if (options?.actionType) {
      logs = logs.filter(a => a.actionType === options.actionType);
    }
    if (options?.startDate) {
      logs = logs.filter(a => a.timestamp >= options.startDate!);
    }
    if (options?.endDate) {
      logs = logs.filter(a => a.timestamp <= options.endDate!);
    }

    logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (options?.limit) {
      logs = logs.slice(0, options.limit);
    }

    return logs;
  }

  /**
   * Export compliance report
   */
  exportComplianceReport(orgId?: string): {
    generatedAt: Date;
    organizations: number;
    tenants: number;
    policies: number;
    adminActions: number;
    violations: Array<{ orgId: string; type: string; details: unknown }>;
  } {
    const violations: Array<{ orgId: string; type: string; details: unknown }> = [];

    for (const [id, org] of this.organizations) {
      if (orgId && id !== orgId) continue;

      const usage = this.getOrganizationUsage(id);
      
      // Check for quota violations
      if (usage.usedAgents > org.totalAgentPool) {
        violations.push({ orgId: id, type: 'agent_overallocation', details: { used: usage.usedAgents, limit: org.totalAgentPool } });
      }
      if (usage.usedCompute > org.totalComputeHours) {
        violations.push({ orgId: id, type: 'compute_overallocation', details: { used: usage.usedCompute, limit: org.totalComputeHours } });
      }
    }

    return {
      generatedAt: new Date(),
      organizations: orgId ? 1 : this.organizations.size,
      tenants: this.tenantIsolations.size,
      policies: this.metrics.activePolicies,
      adminActions: this.adminActions.length,
      violations,
    };
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * List all organizations
   */
  listOrganizations(): Array<{
    orgId: string;
    orgName: string;
    level: number;
    parentOrgId: string | undefined;
    teamCount: number;
    userCount: number;
  }> {
    const result: Array<{
      orgId: string;
      orgName: string;
      level: number;
      parentOrgId: string | undefined;
      teamCount: number;
      userCount: number;
    }> = [];
    for (const [orgId, org] of this.organizations) {
      const usage = this.getOrganizationUsage(orgId);
      result.push({
        orgId,
        orgName: org.orgName,
        level: org.level,
        parentOrgId: org.parentOrgId,
        teamCount: org.teams.length,
        userCount: usage.userCount,
      });
    }
    return result.sort((a, b) => a.level - b.level);
  }

  // Private methods

  private logAdminAction(
    adminId: string,
    actionType: AdminAction['actionType'],
    details: Record<string, unknown>,
    orgId?: string
  ): void {
    const action: AdminAction = {
      actionId: `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      adminId,
      orgId,
      actionType,
      details,
      timestamp: new Date(),
      ipAddress: '0.0.0.0', // Would be provided by request context
    };

    this.adminActions.push(action);
    this.metrics.adminActionsLast30Days++;

    // Trim old actions
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    this.adminActions = this.adminActions.filter(a => a.timestamp >= thirtyDaysAgo);
  }
}

export default EnterpriseQuotaManager;
