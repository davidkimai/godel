"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bugMonitor = exports.BugMonitor = exports.BugStatus = exports.BugSeverity = void 0;
exports.reportBug = reportBug;
exports.getBugDashboard = getBugDashboard;
exports.startBugMonitoring = startBugMonitoring;
exports.stopBugMonitoring = stopBugMonitoring;
const events_1 = require("events");
const logger_1 = require("../utils/logger");
const decision_engine_1 = require("./decision-engine");
// ============================================================================
// BUG MONITOR TYPES
// ============================================================================
var BugSeverity;
(function (BugSeverity) {
    BugSeverity["CRITICAL"] = "CRITICAL";
    BugSeverity["HIGH"] = "HIGH";
    BugSeverity["MEDIUM"] = "MEDIUM";
    BugSeverity["LOW"] = "LOW";
    BugSeverity["INFO"] = "INFO";
})(BugSeverity || (exports.BugSeverity = BugSeverity = {}));
var BugStatus;
(function (BugStatus) {
    BugStatus["DETECTED"] = "DETECTED";
    BugStatus["ANALYZING"] = "ANALYZING";
    BugStatus["AUTO_FIXING"] = "AUTO_FIXING";
    BugStatus["AWAITING_REVIEW"] = "AWAITING_REVIEW";
    BugStatus["FIXED"] = "FIXED";
    BugStatus["IGNORED"] = "IGNORED";
})(BugStatus || (exports.BugStatus = BugStatus = {}));
// ============================================================================
// BUG MONITOR
// ============================================================================
class BugMonitor extends events_1.EventEmitter {
    constructor() {
        super();
        this.activeBugs = new Map();
        this.bugHistory = [];
        this.isMonitoring = false;
        this.config = {
            enabled: true,
            autoFixEnabled: true,
            autoFixMaxCost: 5.0,
            autoFixMaxRetries: 3,
            monitorLogFiles: ['./logs/app.log'],
            monitorTestResults: true,
            monitorBuildStatus: true,
            severityThreshold: BugSeverity.MEDIUM,
        };
    }
    // =========================================================================
    // PUBLIC METHODS
    // =========================================================================
    /**
     * Start monitoring for bugs
     */
    startMonitoring() {
        if (this.isMonitoring) {
            logger_1.logger.warn('bug-monitor', 'Already monitoring');
            return;
        }
        this.isMonitoring = true;
        logger_1.logger.info('bug-monitor', 'Started bug monitoring');
        // Set up periodic checks
        this.monitorInterval = setInterval(() => {
            this.performChecks();
        }, 60000); // Check every minute
        // Listen for events
        this.setupEventListeners();
    }
    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = undefined;
        }
        this.isMonitoring = false;
        logger_1.logger.info('bug-monitor', 'Stopped bug monitoring');
    }
    /**
     * Report a bug
     */
    async reportBug(source, title, description, options) {
        const bug = {
            id: this.generateBugId(),
            timestamp: new Date(),
            severity: options?.severity || this.inferSeverity(source, description),
            status: BugStatus.DETECTED,
            source,
            title,
            description,
            stackTrace: options?.stackTrace,
            filePath: options?.filePath,
            lineNumber: options?.lineNumber,
            suggestedFix: options?.suggestedFix,
            autoFixAttempted: false,
            retryCount: 0,
            ...options,
        };
        this.activeBugs.set(bug.id, bug);
        this.emit('bug:detected', { bug });
        logger_1.logger.warn('bug-monitor', `Bug detected: ${bug.id} - ${bug.title}`, {
            bugId: bug.id,
            severity: bug.severity,
            source: bug.source,
        });
        // Auto-fix if enabled and severity meets threshold
        if (this.config.autoFixEnabled && this.shouldAutoFix(bug)) {
            await this.attemptAutoFix(bug);
        }
        return bug;
    }
    /**
     * Attempt to auto-fix a bug using a swarm
     */
    async attemptAutoFix(bug) {
        if (bug.autoFixAttempted && bug.retryCount >= this.config.autoFixMaxRetries) {
            logger_1.logger.warn('bug-monitor', 'Max auto-fix retries reached', { bugId: bug.id });
            bug.status = BugStatus.AWAITING_REVIEW;
            this.emit('bug:review_required', { bug });
            return false;
        }
        bug.status = BugStatus.AUTO_FIXING;
        bug.autoFixAttempted = true;
        bug.retryCount++;
        // Create decision request for the fix swarm
        const request = {
            swarmId: bug.id,
            estimatedCost: Math.min(this.config.autoFixMaxCost, 5.0),
            agentCount: 3,
            operationType: 'fix',
            riskLevel: bug.severity === BugSeverity.CRITICAL ? 'critical' : 'medium',
            description: `Auto-fix: ${bug.title}`,
            urgency: bug.severity === BugSeverity.CRITICAL ? 'critical' : 'normal',
            source: 'automation',
        };
        // Check authorization
        const auth = (0, decision_engine_1.authorizeSwarm)(request);
        if (!auth.allowed) {
            logger_1.logger.warn('bug-monitor', 'Auto-fix not authorized', {
                bugId: bug.id,
                reason: auth.reason,
            });
            bug.status = BugStatus.AWAITING_REVIEW;
            this.emit('bug:review_required', { bug });
            return false;
        }
        // Execute fix swarm (simulated)
        try {
            logger_1.logger.info('bug-monitor', 'Executing auto-fix swarm', { bugId: bug.id });
            // In real implementation, this would spawn a fix swarm
            // For now, simulate the fix
            await this.simulateFix(bug);
            bug.status = BugStatus.FIXED;
            bug.autoFixSuccess = true;
            logger_1.logger.info('bug-monitor', `Bug fixed: ${bug.id}`, { bugId: bug.id });
            this.emit('bug:fixed', { bug });
            // Move to history
            setTimeout(() => {
                this.activeBugs.delete(bug.id);
                this.bugHistory.push(bug);
            }, 60000);
            return true;
        }
        catch (error) {
            bug.autoFixSuccess = false;
            logger_1.logger.error('bug-monitor', `Auto-fix failed for ${bug.id}`, {
                bugId: bug.id,
                error: error instanceof Error ? error.message : String(error),
            });
            if (bug.retryCount < this.config.autoFixMaxRetries) {
                // Will retry on next check
                bug.status = BugStatus.DETECTED;
            }
            else {
                bug.status = BugStatus.AWAITING_REVIEW;
                this.emit('bug:review_required', { bug });
            }
            return false;
        }
    }
    /**
     * Get all active bugs
     */
    getActiveBugs() {
        return Array.from(this.activeBugs.values());
    }
    /**
     * Get bug by ID
     */
    getBug(bugId) {
        return this.activeBugs.get(bugId);
    }
    /**
     * Get bug statistics
     */
    getBugStats() {
        const bySeverity = {};
        const bySource = {};
        let fixedAuto = 0;
        let fixedTotal = 0;
        for (const bug of this.activeBugs.values()) {
            bySeverity[bug.severity] = (bySeverity[bug.severity] || 0) + 1;
            bySource[bug.source] = (bySource[bug.source] || 0) + 1;
        }
        for (const bug of this.bugHistory) {
            if (bug.status === BugStatus.FIXED) {
                fixedTotal++;
                if (bug.autoFixSuccess)
                    fixedAuto++;
            }
            bySeverity[bug.severity] = (bySeverity[bug.severity] || 0) + 1;
            bySource[bug.source] = (bySource[bug.source] || 0) + 1;
        }
        return {
            total: this.activeBugs.size + this.bugHistory.length,
            active: this.activeBugs.size,
            fixed: fixedTotal,
            bySeverity,
            bySource,
            autoFixRate: fixedTotal > 0 ? fixedAuto / fixedTotal : 0,
        };
    }
    /**
     * Ignore a bug (mark as won't fix)
     */
    ignoreBug(bugId, reason) {
        const bug = this.activeBugs.get(bugId);
        if (!bug)
            return false;
        bug.status = BugStatus.IGNORED;
        this.emit('bug:ignored', { bug, reason });
        this.activeBugs.delete(bugId);
        this.bugHistory.push(bug);
        return true;
    }
    /**
     * Manually trigger a check
     */
    async performChecks() {
        if (!this.isMonitoring)
            return;
        logger_1.logger.debug('bug-monitor', 'Performing periodic checks');
        // Check test results
        if (this.config.monitorTestResults) {
            await this.checkTestResults();
        }
        // Check build status
        if (this.config.monitorBuildStatus) {
            await this.checkBuildStatus();
        }
        // Check log files
        await this.checkLogFiles();
        // Retry failed auto-fixes
        await this.retryFailedAutoFixes();
    }
    // =========================================================================
    // PRIVATE METHODS
    // =========================================================================
    setupEventListeners() {
        // Listen for test completion
        this.on('test:completed', async (data) => {
            if (data.failed > 0) {
                await this.reportBug('test_failure', `${data.failed} test(s) failed`, `Test suite: ${data.suiteName}\nFailures: ${data.failed.join(', ')}`, { severity: this.inferSeverity('test_failure', data.failed.join(', ')) });
            }
        });
        // Listen for build completion
        this.on('build:completed', async (data) => {
            if (!data.success) {
                await this.reportBug('build_error', 'Build failed', `Build error: ${data.error}`, { severity: BugSeverity.HIGH });
            }
        });
        // Listen for runtime errors
        this.on('error:caught', async (data) => {
            await this.reportBug('runtime_error', data.error.message || 'Runtime error caught', data.error.stack || 'No stack trace available', {
                stackTrace: data.error.stack,
                filePath: data.error.file,
                lineNumber: data.error.line,
                severity: this.inferSeverity('runtime_error', data.error.message),
            });
        });
    }
    async checkTestResults() {
        // In real implementation, check test output files or test service
        logger_1.logger.debug('bug-monitor', 'Checking test results');
    }
    async checkBuildStatus() {
        // In real implementation, check build status or CI/CD
        logger_1.logger.debug('bug-monitor', 'Checking build status');
    }
    async checkLogFiles() {
        // In real implementation, parse log files for errors
        for (const logFile of this.config.monitorLogFiles) {
            logger_1.logger.debug('bug-monitor', `Checking log file: ${logFile}`);
        }
    }
    async retryFailedAutoFixes() {
        for (const bug of this.activeBugs.values()) {
            if (bug.status === BugStatus.DETECTED &&
                bug.autoFixAttempted &&
                bug.retryCount < this.config.autoFixMaxRetries) {
                await this.attemptAutoFix(bug);
            }
        }
    }
    shouldAutoFix(bug) {
        // Only auto-fix if severity meets threshold
        const severityOrder = [BugSeverity.INFO, BugSeverity.LOW, BugSeverity.MEDIUM, BugSeverity.HIGH, BugSeverity.CRITICAL];
        const bugIndex = severityOrder.indexOf(bug.severity);
        const thresholdIndex = severityOrder.indexOf(this.config.severityThreshold);
        return bugIndex >= thresholdIndex;
    }
    inferSeverity(source, description) {
        const lowerDesc = description.toLowerCase();
        // Check for critical keywords
        if (lowerDesc.includes('uncaught exception') ||
            lowerDesc.includes('cannot read') ||
            lowerDesc.includes('undefined is not') ||
            lowerDesc.includes('production') ||
            lowerDesc.includes('data loss')) {
            return BugSeverity.CRITICAL;
        }
        // Check for high severity
        if (lowerDesc.includes('error') &&
            (lowerDesc.includes('fail') || lowerDesc.includes('broken'))) {
            return BugSeverity.HIGH;
        }
        // Check for medium severity
        if (lowerDesc.includes('warning') ||
            lowerDesc.includes('test fail') ||
            lowerDesc.includes('build fail')) {
            return BugSeverity.MEDIUM;
        }
        // Default to low
        return BugSeverity.LOW;
    }
    generateBugId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 6);
        return `bug_${timestamp}_${random}`;
    }
    async simulateFix(bug) {
        // Simulate fix time
        await new Promise((resolve) => setTimeout(resolve, 500));
        // For demo purposes, mark as fixed
        bug.suggestedFix = `Automated fix for: ${bug.title}`;
    }
}
exports.BugMonitor = BugMonitor;
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
exports.bugMonitor = new BugMonitor();
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Quick bug report
 */
async function reportBug(source, title, description, options) {
    return exports.bugMonitor.reportBug(source, title, description, options);
}
/**
 * Get bug status dashboard
 */
function getBugDashboard() {
    return {
        ...exports.bugMonitor.getBugStats(),
        activeBugs: exports.bugMonitor.getActiveBugs(),
    };
}
/**
 * Start bug monitoring
 */
function startBugMonitoring() {
    exports.bugMonitor.startMonitoring();
}
/**
 * Stop bug monitoring
 */
function stopBugMonitoring() {
    exports.bugMonitor.stopMonitoring();
}
//# sourceMappingURL=bug-monitor.js.map