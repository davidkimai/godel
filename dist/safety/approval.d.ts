/**
 * Approval Workflow Module - SPEC_APPROVAL_WORKFLOW.md
 *
 * Core approval types, request creation, response handling,
 * and risk assessment for human-in-loop approval workflows.
 */
export type ApprovalType = 'critical' | 'standard' | 'auto';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'escalated';
export type OperationType = 'file_write' | 'file_delete' | 'api_call' | 'budget_overrun' | 'agent_termination';
export type DecisionType = 'approve' | 'deny' | 'escalate';
export interface ApproverIdentity {
    type: 'human' | 'agent' | 'webhook' | 'system';
    identity: string;
    displayName?: string;
    sessionId?: string;
    ipAddress?: string;
}
export interface RequestingAgent {
    agentId: string;
    agentLabel?: string;
    swarmId?: string;
    parentAgentId?: string;
    model?: string;
}
export interface OperationDetails {
    type: OperationType;
    target: string;
    details: Record<string, unknown>;
    estimatedCost?: number;
    estimatedTokens?: number;
    estimatedImpact?: string;
}
export interface ApprovalDecision {
    decision: DecisionType;
    decidedAt: Date;
    approver: ApproverIdentity;
    justification?: string;
    notes?: string;
    alternativeSuggestion?: string;
}
export interface TaskContext {
    taskId?: string;
    taskTitle?: string;
}
export interface ApprovalContext {
    previousOperations?: string[];
    relatedRequests?: string[];
    userConfig?: string;
}
export interface RiskAssessment {
    level: RiskLevel;
    classificationReason: string;
    affectedSystems?: string[];
    autoEscalate?: boolean;
}
export interface ApprovalRequest {
    id: string;
    requestId: string;
    createdAt: Date;
    expiresAt?: Date;
    requestingAgent: RequestingAgent;
    operation: OperationDetails;
    approvalType: ApprovalType;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    risk: RiskAssessment;
    task?: TaskContext;
    context?: ApprovalContext;
    status: ApprovalStatus;
    decision?: ApprovalDecision;
    escalationCount: number;
    maxEscalations: number;
}
export interface ApprovalConfig {
    timeout: {
        critical: number;
        standard: number;
        urgent: number;
    };
    maxEscalations: {
        critical: number;
        standard: number;
        urgent: number;
    };
    autoContinueOnTimeout: boolean;
    requireJustification: boolean;
}
export interface ApprovalResponse {
    requestId: string;
    decision: DecisionType;
    approver: ApproverIdentity;
    justification: string;
    notes?: string;
    respondedAt: Date;
    effectiveAt: Date;
    expiresAt?: Date;
}
export interface BatchApprovalRequest {
    filter: {
        agentId?: string;
        operationType?: OperationType;
        riskLevel?: RiskLevel;
        status?: 'pending';
        pattern?: string;
    };
    count?: number;
}
export interface BatchApprovalResponse {
    approved: string[];
    denied: string[];
    skipped: string[];
    errors: Array<{
        requestId: string;
        error: string;
    }>;
}
export interface AuditLogEntry {
    id: string;
    requestId: string;
    createdAt: Date;
    respondedAt?: Date;
    completedAt?: Date;
    requestingAgent: RequestingAgent;
    operation: OperationDetails;
    risk: RiskAssessment;
    approver?: ApproverIdentity;
    decision?: ApprovalDecision;
    escalationHistory?: Array<{
        fromApprover: ApproverIdentity;
        toApprover: ApproverIdentity;
        reason: string;
        timestamp: Date;
    }>;
    execution?: {
        executedAt: Date;
        success: boolean;
        actualCost?: number;
        actualTokens?: number;
        error?: string;
    };
    metadata: {
        taskId?: string;
        taskTitle?: string;
        sessionId: string;
        correlationId?: string;
    };
}
export declare const DEFAULT_CONFIG: ApprovalConfig;
export declare function getConfig(): ApprovalConfig;
export declare function setConfig(config: Partial<ApprovalConfig>): void;
export declare function assessRisk(operationType: OperationType, target: string, details?: Record<string, unknown>): RiskAssessment;
export declare function getTimeoutForRisk(risk: RiskLevel, config?: ApprovalConfig): number;
export declare function getMaxEscalationsForRisk(risk: RiskLevel, config?: ApprovalConfig): number;
export declare function createApprovalRequest(params: {
    requestingAgent: RequestingAgent;
    operation: OperationDetails;
    task?: TaskContext;
    context?: ApprovalContext;
    overrideRisk?: RiskLevel;
}): ApprovalRequest;
export declare function respondToRequest(request: ApprovalRequest, decision: DecisionType, approver: ApproverIdentity, justification: string, notes?: string): ApprovalResponse;
export declare function logApprovalAudit(entry: Omit<AuditLogEntry, 'id'>): AuditLogEntry;
export declare function getAuditLogs(filter?: {
    requestId?: string;
    agentId?: string;
    since?: Date;
    riskLevel?: RiskLevel;
}): AuditLogEntry[];
export declare function isExpired(request: ApprovalRequest): boolean;
export declare function canAutoApprove(request: ApprovalRequest): boolean;
export declare function getStatusColor(status: ApprovalStatus): string;
export declare function formatApprovalForDisplay(request: ApprovalRequest): Record<string, unknown>;
//# sourceMappingURL=approval.d.ts.map