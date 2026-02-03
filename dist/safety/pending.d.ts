/**
 * Pending Approval Queue Module
 *
 * Manages the queue of pending approval requests with
 * list, get, and filtering operations.
 */
import { ApprovalRequest, ApprovalStatus, OperationType, RiskLevel } from './approval';
export declare function addToQueue(request: ApprovalRequest): void;
export declare function removeFromQueue(requestId: string): ApprovalRequest | undefined;
export declare function getFromQueue(requestId: string): ApprovalRequest | undefined;
export declare function getAllRequests(): ApprovalRequest[];
export interface ListOptions {
    status?: ApprovalStatus | 'all';
    agentId?: string;
    operationType?: OperationType;
    riskLevel?: RiskLevel;
    limit?: number;
    offset?: number;
    sortBy?: 'createdAt' | 'risk' | 'priority';
    sortOrder?: 'asc' | 'desc';
}
export declare function listPending(options?: ListOptions): ApprovalRequest[];
export declare function countPending(options?: ListOptions): number;
export declare function getApprovalDetails(requestId: string, includeContext?: boolean): ApprovalRequest | null;
export declare function getRequestHistory(requestId: string): ApprovalRequest[];
export declare function filterByAgent(agentId: string): ApprovalRequest[];
export declare function filterByStatus(status: ApprovalStatus): ApprovalRequest[];
export declare function filterByRisk(riskLevel: RiskLevel): ApprovalRequest[];
export declare function filterByOperationType(operationType: OperationType): ApprovalRequest[];
export declare function findExpiredRequests(): ApprovalRequest[];
export declare function findStaleRequests(olderThanMinutes: number): ApprovalRequest[];
export interface ApprovalStats {
    total: number;
    pending: number;
    approved: number;
    denied: number;
    expired: number;
    escalated: number;
    byRisk: Record<RiskLevel, number>;
    byType: Record<OperationType, number>;
    avgResponseTime?: number;
}
export declare function getStats(): ApprovalStats;
export declare function formatListForDisplay(requests: ApprovalRequest[], format?: 'table' | 'json'): string;
export declare function formatDetailsForDisplay(request: ApprovalRequest): string;
export declare function clearAllRequests(): void;
//# sourceMappingURL=pending.d.ts.map