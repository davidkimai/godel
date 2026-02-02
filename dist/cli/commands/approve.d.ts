/**
 * Approval Command - CLI Interface
 *
 * Provides CLI commands for managing approval workflows:
 * - list: List pending approvals
 * - get: Get approval details
 * - respond: Approve/Deny an approval request
 * - approve-all: Batch approve for an agent
 * - audit: Query audit trail
 */
import { Command } from 'commander';
export declare function createApprovalCommand(): Command;
export default createApprovalCommand;
//# sourceMappingURL=approve.d.ts.map