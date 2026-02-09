/**
 * Agent 68: Team Quota Management
 * Team-wide resource pools with allocation across projects
 * Supports quota transfers and team analytics
 */

import { EventEmitter } from 'events';
import { UserQuotaConfig, QuotaStatus } from './user-quotas.js';

export interface TeamQuotaConfig {
  teamId: string;
  teamName: string;
  totalAgentPool: number;
  totalComputeHours: number;
  totalStorageGB: number;
  maxConcurrentAgents: number;
  memberLimit: number;
  projectLimit: number;
  allowQuotaTransfers: boolean;
  autoReallocation: boolean;
}

export interface TeamMember {
  userId: string;
  role: 'admin' | 'member' | 'viewer';
  allocatedAgents: number;
  allocatedCompute: number;
  allocatedStorage: number;
  joinedAt: Date;
}

export interface ProjectAllocation {
  projectId: string;
  projectName: string;
  allocatedAgents: number;
  allocatedCompute: number;
  allocatedStorage: number;
  usedAgents: number;
  usedCompute: number;
  usedStorage: number;
  members: string[]; // userIds
}

export interface QuotaTransfer {
  transferId: string;
  fromUserId: string;
  toUserId: string;
  agents?: number;
  computeHours?: number;
  storageGB?: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  requestedAt: Date;
  approvedAt?: Date;
  approvedBy?: string;
}

export interface TeamAnalytics {
  teamId: string;
  totalMembers: number;
  totalProjects: number;
  agentUtilization: number; // percentage
  computeUtilization: number;
  storageUtilization: number;
  topUsers: Array<{ userId: string; agentsUsed: number; computeUsed: number }>;
  topProjects: Array<{ projectId: string; agentsUsed: number; computeUsed: number }>;
  quotaTransfersLast30Days: number;
}

export class TeamQuotaManager extends EventEmitter {
  private teamConfigs = new Map<string, TeamQuotaConfig>();
  private teamMembers = new Map<string, Map<string, TeamMember>>(); // teamId -> (userId -> member)
  private projectAllocations = new Map<string, Map<string, ProjectAllocation>>(); // teamId -> (projectId -> allocation)
  private quotaTransfers = new Map<string, QuotaTransfer[]>(); // teamId -> transfers
  private userQuotas = new Map<string, Map<string, UserQuotaConfig>>(); // teamId -> (userId -> config)
  
  private metrics = {
    totalTeams: 0,
    totalMembers: 0,
    totalProjects: 0,
    activeTransfers: 0,
  };

  /**
   * Create or update team quota configuration
   */
  setTeamQuotas(config: TeamQuotaConfig): void {
    const isNew = !this.teamConfigs.has(config.teamId);
    this.teamConfigs.set(config.teamId, config);

    if (isNew) {
      this.teamMembers.set(config.teamId, new Map());
      this.projectAllocations.set(config.teamId, new Map());
      this.quotaTransfers.set(config.teamId, []);
      this.userQuotas.set(config.teamId, new Map());
      this.metrics.totalTeams++;
    }

    this.emit('team:configured', { teamId: config.teamId, isNew });
  }

  /**
   * Get team quota configuration
   */
  getTeamQuotas(teamId: string): TeamQuotaConfig | undefined {
    return this.teamConfigs.get(teamId);
  }

  /**
   * Add member to team
   */
  addTeamMember(teamId: string, userId: string, role: TeamMember['role'] = 'member'): boolean {
    const config = this.teamConfigs.get(teamId);
    if (!config) {
      this.emit('error', { type: 'team_not_found', teamId });
      return false;
    }

    const members = this.teamMembers.get(teamId)!;
    if (members.has(userId)) {
      return true; // Already a member
    }

    if (members.size >= config.memberLimit) {
      this.emit('member:add_rejected', { teamId, userId, reason: 'Member limit reached' });
      return false;
    }

    const member: TeamMember = {
      userId,
      role,
      allocatedAgents: 0,
      allocatedCompute: 0,
      allocatedStorage: 0,
      joinedAt: new Date(),
    };

    members.set(userId, member);
    this.metrics.totalMembers++;

    // Create default user quotas within team context
    this.createDefaultUserQuotas(teamId, userId);

    this.emit('member:added', { teamId, userId, role });
    return true;
  }

  /**
   * Remove member from team
   */
  removeTeamMember(teamId: string, userId: string): boolean {
    const members = this.teamMembers.get(teamId);
    if (!members || !members.has(userId)) {
      return false;
    }

    // Reclaim allocated quotas
    const member = members.get(userId)!;
    this.reclaimQuota(teamId, member);

    members.delete(userId);
    this.metrics.totalMembers--;

    // Remove from all projects
    const projects = this.projectAllocations.get(teamId);
    if (projects) {
      for (const project of projects.values()) {
        const idx = project.members.indexOf(userId);
        if (idx >= 0) {
          project.members.splice(idx, 1);
        }
      }
    }

    this.emit('member:removed', { teamId, userId });
    return true;
  }

  /**
   * Update member role
   */
  updateMemberRole(teamId: string, userId: string, newRole: TeamMember['role']): boolean {
    const members = this.teamMembers.get(teamId);
    if (!members) return false;

    const member = members.get(userId);
    if (!member) return false;

    member.role = newRole;
    this.emit('member:role_updated', { teamId, userId, newRole });
    return true;
  }

  /**
   * Create project with quota allocation
   */
  createProject(
    teamId: string,
    projectId: string,
    projectName: string,
    allocation: { agents: number; computeHours: number; storageGB: number },
    memberIds: string[]
  ): boolean {
    const config = this.teamConfigs.get(teamId);
    const projects = this.projectAllocations.get(teamId);
    const members = this.teamMembers.get(teamId);

    if (!config || !projects || !members) {
      return false;
    }

    if (projects.size >= config.projectLimit) {
      this.emit('project:create_rejected', { teamId, projectId, reason: 'Project limit reached' });
      return false;
    }

    // Check if team has available quotas
    const teamUsage = this.getTeamUsage(teamId);
    
    if (teamUsage.usedAgents + allocation.agents > config.totalAgentPool) {
      this.emit('project:create_rejected', { teamId, projectId, reason: 'Insufficient agent quota' });
      return false;
    }

    if (teamUsage.usedCompute + allocation.computeHours > config.totalComputeHours) {
      this.emit('project:create_rejected', { teamId, projectId, reason: 'Insufficient compute quota' });
      return false;
    }

    if (teamUsage.usedStorage + allocation.storageGB > config.totalStorageGB) {
      this.emit('project:create_rejected', { teamId, projectId, reason: 'Insufficient storage quota' });
      return false;
    }

    // Validate all members exist
    for (const memberId of memberIds) {
      if (!members.has(memberId)) {
        this.emit('project:create_rejected', { teamId, projectId, reason: `Member ${memberId} not found` });
        return false;
      }
    }

    const project: ProjectAllocation = {
      projectId,
      projectName,
      allocatedAgents: allocation.agents,
      allocatedCompute: allocation.computeHours,
      allocatedStorage: allocation.storageGB,
      usedAgents: 0,
      usedCompute: 0,
      usedStorage: 0,
      members: memberIds,
    };

    projects.set(projectId, project);
    this.metrics.totalProjects++;

    this.emit('project:created', { teamId, projectId, projectName });
    return true;
  }

  /**
   * Delete project and reclaim quotas
   */
  deleteProject(teamId: string, projectId: string): boolean {
    const projects = this.projectAllocations.get(teamId);
    if (!projects || !projects.has(projectId)) {
      return false;
    }

    projects.delete(projectId);
    this.metrics.totalProjects--;

    this.emit('project:deleted', { teamId, projectId });
    return true;
  }

  /**
   * Request quota transfer between team members
   */
  requestQuotaTransfer(
    teamId: string,
    fromUserId: string,
    toUserId: string,
    quotas: { agents?: number; computeHours?: number; storageGB?: number }
  ): QuotaTransfer | null {
    const config = this.teamConfigs.get(teamId);
    if (!config || !config.allowQuotaTransfers) {
      this.emit('transfer:rejected', { teamId, fromUserId, toUserId, reason: 'Transfers not allowed' });
      return null;
    }

    const members = this.teamMembers.get(teamId);
    if (!members || !members.has(fromUserId) || !members.has(toUserId)) {
      this.emit('transfer:rejected', { teamId, fromUserId, toUserId, reason: 'Invalid members' });
      return null;
    }

    const transfer: QuotaTransfer = {
      transferId: `transfer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fromUserId,
      toUserId,
      ...quotas,
      status: 'pending',
      requestedAt: new Date(),
    };

    const transfers = this.quotaTransfers.get(teamId) || [];
    transfers.push(transfer);
    this.quotaTransfers.set(teamId, transfers);
    this.metrics.activeTransfers++;

    this.emit('transfer:requested', { teamId, transfer });
    return transfer;
  }

  /**
   * Approve or reject quota transfer
   */
  resolveQuotaTransfer(
    teamId: string,
    transferId: string,
    approved: boolean,
    approvedBy: string
  ): boolean {
    const transfers = this.quotaTransfers.get(teamId);
    if (!transfers) return false;

    const transfer = transfers.find(t => t.transferId === transferId);
    if (!transfer || transfer.status !== 'pending') {
      return false;
    }

    if (approved) {
      // Execute the transfer
      const members = this.teamMembers.get(teamId);
      if (members) {
        const fromMember = members.get(transfer.fromUserId);
        const toMember = members.get(transfer.toUserId);

        if (fromMember && toMember) {
          if (transfer.agents) {
            fromMember.allocatedAgents -= transfer.agents;
            toMember.allocatedAgents += transfer.agents;
          }
          if (transfer.computeHours) {
            fromMember.allocatedCompute -= transfer.computeHours;
            toMember.allocatedCompute += transfer.computeHours;
          }
          if (transfer.storageGB) {
            fromMember.allocatedStorage -= transfer.storageGB;
            toMember.allocatedStorage += transfer.storageGB;
          }
        }
      }

      transfer.status = 'completed';
      transfer.approvedAt = new Date();
      transfer.approvedBy = approvedBy;
      this.emit('transfer:completed', { teamId, transfer });
    } else {
      transfer.status = 'rejected';
      transfer.approvedAt = new Date();
      transfer.approvedBy = approvedBy;
      this.emit('transfer:rejected', { teamId, transfer });
    }

    this.metrics.activeTransfers--;
    return true;
  }

  /**
   * Get team quota status
   */
  getTeamQuotaStatus(teamId: string): {
    config: TeamQuotaConfig;
    usage: {
      agentsUsed: number;
      agentsTotal: number;
      computeUsed: number;
      computeTotal: number;
      storageUsed: number;
      storageTotal: number;
      concurrentAgents: number;
    };
    members: TeamMember[];
    projects: ProjectAllocation[];
  } | null {
    const config = this.teamConfigs.get(teamId);
    if (!config) return null;

    const usage = this.getTeamUsage(teamId);
    const members = Array.from(this.teamMembers.get(teamId)?.values() || []);
    const projects = Array.from(this.projectAllocations.get(teamId)?.values() || []);

    return {
      config,
      usage: {
        agentsUsed: usage.usedAgents,
        agentsTotal: config.totalAgentPool,
        computeUsed: usage.usedCompute,
        computeTotal: config.totalComputeHours,
        storageUsed: usage.usedStorage,
        storageTotal: config.totalStorageGB,
        concurrentAgents: usage.concurrentAgents,
      },
      members,
      projects,
    };
  }

  /**
   * Get team analytics
   */
  getTeamAnalytics(teamId: string): TeamAnalytics | null {
    const config = this.teamConfigs.get(teamId);
    if (!config) return null;

    const status = this.getTeamQuotaStatus(teamId);
    if (!status) return null;

    // Calculate utilization percentages
    const agentUtilization = (status.usage.agentsUsed / status.usage.agentsTotal) * 100;
    const computeUtilization = (status.usage.computeUsed / status.usage.computeTotal) * 100;
    const storageUtilization = (status.usage.storageUsed / status.usage.storageTotal) * 100;

    // Get top users by usage
    const topUsers = status.members
      .map(m => ({
        userId: m.userId,
        agentsUsed: m.allocatedAgents,
        computeUsed: m.allocatedCompute,
      }))
      .sort((a, b) => b.agentsUsed - a.agentsUsed)
      .slice(0, 5);

    // Get top projects by usage
    const topProjects = status.projects
      .map(p => ({
        projectId: p.projectId,
        agentsUsed: p.usedAgents,
        computeUsed: p.usedCompute,
      }))
      .sort((a, b) => b.agentsUsed - a.agentsUsed)
      .slice(0, 5);

    // Count transfers in last 30 days
    const transfers = this.quotaTransfers.get(teamId) || [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentTransfers = transfers.filter(t => t.requestedAt >= thirtyDaysAgo);

    return {
      teamId,
      totalMembers: status.members.length,
      totalProjects: status.projects.length,
      agentUtilization: Math.round(agentUtilization * 100) / 100,
      computeUtilization: Math.round(computeUtilization * 100) / 100,
      storageUtilization: Math.round(storageUtilization * 100) / 100,
      topUsers,
      topProjects,
      quotaTransfersLast30Days: recentTransfers.length,
    };
  }

  /**
   * Get pending transfers for a team
   */
  getPendingTransfers(teamId: string): QuotaTransfer[] {
    const transfers = this.quotaTransfers.get(teamId) || [];
    return transfers.filter(t => t.status === 'pending');
  }

  /**
   * Get user quotas within team context
   */
  getUserTeamQuotas(teamId: string, userId: string): UserQuotaConfig | undefined {
    return this.userQuotas.get(teamId)?.get(userId);
  }

  /**
   * Update user quotas within team context
   */
  setUserTeamQuotas(teamId: string, userId: string, quotas: Partial<UserQuotaConfig>): boolean {
    const teamQuotas = this.userQuotas.get(teamId);
    if (!teamQuotas) return false;

    const existing = teamQuotas.get(userId);
    if (!existing) return false;

    teamQuotas.set(userId, { ...existing, ...quotas, userId });
    this.emit('user_quotas:updated', { teamId, userId });
    return true;
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * List all teams
   */
  listTeams(): Array<{ teamId: string; teamName: string; memberCount: number; projectCount: number }> {
    const result: Array<{ teamId: string; teamName: string; memberCount: number; projectCount: number }> = [];
    for (const [teamId, config] of this.teamConfigs) {
      result.push({
        teamId,
        teamName: config.teamName,
        memberCount: this.teamMembers.get(teamId)?.size || 0,
        projectCount: this.projectAllocations.get(teamId)?.size || 0,
      });
    }
    return result;
  }

  // Private methods

  private createDefaultUserQuotas(teamId: string, userId: string): void {
    const teamConfig = this.teamConfigs.get(teamId);
    if (!teamConfig) return;

    const userQuotas: UserQuotaConfig = {
      userId,
      dailyAgentLimit: Math.floor(teamConfig.totalAgentPool / (teamConfig.memberLimit * 2)),
      weeklyAgentLimit: Math.floor(teamConfig.totalAgentPool / teamConfig.memberLimit),
      monthlyAgentLimit: Math.floor(teamConfig.totalAgentPool * 4 / teamConfig.memberLimit),
      dailyComputeHours: Math.floor(teamConfig.totalComputeHours / (teamConfig.memberLimit * 30)),
      maxConcurrentAgents: Math.max(1, Math.floor(teamConfig.maxConcurrentAgents / teamConfig.memberLimit)),
      maxStorageGB: Math.floor(teamConfig.totalStorageGB / teamConfig.memberLimit),
    };

    const teamQuotas = this.userQuotas.get(teamId)!;
    teamQuotas.set(userId, userQuotas);
  }

  private reclaimQuota(teamId: string, member: TeamMember): void {
    // Reclaim allocated resources
    member.allocatedAgents = 0;
    member.allocatedCompute = 0;
    member.allocatedStorage = 0;
  }

  private getTeamUsage(teamId: string): { usedAgents: number; usedCompute: number; usedStorage: number; concurrentAgents: number } {
    const projects = this.projectAllocations.get(teamId);
    if (!projects) {
      return { usedAgents: 0, usedCompute: 0, usedStorage: 0, concurrentAgents: 0 };
    }

    let usedAgents = 0;
    let usedCompute = 0;
    let usedStorage = 0;

    for (const project of projects.values()) {
      usedAgents += project.usedAgents;
      usedCompute += project.usedCompute;
      usedStorage += project.usedStorage;
    }

    // Get concurrent agents from members
    let concurrentAgents = 0;
    const members = this.teamMembers.get(teamId);
    if (members) {
      for (const member of members.values()) {
        concurrentAgents += member.allocatedAgents > 0 ? 1 : 0;
      }
    }

    return { usedAgents, usedCompute, usedStorage, concurrentAgents };
  }
}

export default TeamQuotaManager;
