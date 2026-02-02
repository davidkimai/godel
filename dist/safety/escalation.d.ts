/**
 * Escalation Module - SPEC_APPROVAL_WORKFLOW.md
 *
 * Timeout monitoring, escalation triggers, and auto-deny
 * logic for approval workflows.
 */
import { ApprovalRequest, ApproverIdentity } from './approval';
export interface EscalationConfig {
    checkInterval: number;
    enableAutoDeny: boolean;
    notifyOnEscalation: boolean;
    notifyOnExpiry: boolean;
    alternateApprovers: AlternateApprover[];
}
export interface AlternateApprover {
    type: 'human' | 'webhook' | 'agent';
    priority: number;
    identity: string;
    displayName?: string;
}
export declare function startMonitoring(config?: Partial<EscalationConfig>): void;
export declare function stopMonitoring(): void;
export declare function escalateRequest(request: ApprovalRequest, reason: string): ApprovalRequest;
export declare function autoDenyRequest(request: ApprovalRequest, reason: string): ApprovalRequest;
export declare function expireOldRequests(olderThanMinutes: number): number;
export declare function escalateStaleRequests(olderThanMinutes: number): number;
export interface EmergencyOverrideParams {
    requestId: string;
    approver: ApproverIdentity;
    reason: string;
    justification: string;
}
export declare function emergencyOverride(params: EmergencyOverrideParams): ApprovalRequest;
export declare function isMonitoring(): boolean;
export declare function getEscalationConfig(): EscalationConfig;
export declare function setEscalationConfig(config: Partial<EscalationConfig>): void;
export declare function getEscalationStats(): {
    isMonitoring: boolean;
    pendingCount: number;
    config: EscalationConfig;
};
//# sourceMappingURL=escalation.d.ts.map