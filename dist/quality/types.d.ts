/**
 * Quality Gate Framework - Type Definitions
 *
 * Defines interfaces for linting results, quality gates, and scoring.
 * Matches SPEC_V3.md Part IV (Quality Gate Framework)
 */
export type SeverityLevel = 'error' | 'warning' | 'info' | 'hint';
export declare const SEVERITY_ORDER: Record<SeverityLevel, number>;
export interface LintIssue {
    /** Unique identifier for the issue */
    id: string;
    /** The lint rule that triggered this issue */
    rule: string;
    /** Human-readable rule category */
    category: 'correctness' | 'completeness' | 'consistency' | 'clarity' | 'performance' | 'security' | 'style' | 'type_safety';
    /** Severity level of the issue */
    severity: SeverityLevel;
    /** File path where the issue was found */
    file: string;
    /** Line number (1-indexed) */
    line: number;
    /** Column number (1-indexed) */
    column?: number;
    /** End line number for multi-line issues */
    endLine?: number;
    /** End column number for multi-line issues */
    endColumn?: number;
    /** Human-readable message describing the issue */
    message: string;
    /** Suggested fix (if available) */
    fix?: {
        range: {
            start: {
                line: number;
                column: number;
            };
            end: {
                line: number;
                column: number;
            };
        };
        text: string;
    };
    /** Documentation URL for this rule */
    docsUrl?: string;
    /** The linter that reported this issue */
    source: LinterType;
}
export interface LintResult {
    /** The linter that was run */
    tool: LinterType;
    /** Exit code from the linter */
    exitCode: number;
    /** Whether the linter completed successfully */
    success: boolean;
    /** List of issues found */
    issues: LintIssue[];
    /** Summary statistics */
    summary: {
        errors: number;
        warnings: number;
        hints: number;
        info: number;
        total: number;
    };
    /** Execution metadata */
    metadata: {
        startTime: Date;
        endTime: Date;
        duration: number;
        filesScanned: number;
        command?: string;
        error?: string;
    };
}
export interface LintSummary {
    /** Combined results from all linters */
    results: LintResult[];
    /** Aggregate statistics across all linters */
    aggregate: {
        errors: number;
        warnings: number;
        hints: number;
        info: number;
        total: number;
        filesWithIssues: Set<string>;
    };
    /** Overall quality score (0-1) */
    score: number;
    /** Whether the quality gate passed */
    passed: boolean;
}
export type LinterType = 'eslint' | 'prettier' | 'pylint' | 'mypy' | 'rustfmt' | 'cargo-check' | 'golangci-lint' | 'shellcheck' | 'typescript' | 'tsc' | 'eslint-disable-next-line' | 'custom';
export interface LinterConfig {
    /** The type of linter */
    type: LinterType;
    /** Whether this linter is enabled */
    enabled: boolean;
    /** Custom linter command (for custom linters) */
    command?: string;
    /** File patterns to lint */
    patterns: string[];
    /** Rules to ignore */
    ignoreRules?: string[];
    /** Severity overrides */
    severityOverrides?: Partial<Record<string, SeverityLevel>>;
    /** Additional arguments */
    args?: string[];
    /** Working directory */
    cwd?: string;
}
export interface QualityCriterion {
    /** The quality dimension being measured */
    dimension: 'correctness' | 'completeness' | 'consistency' | 'clarity' | 'performance' | 'security' | 'style' | 'type_safety' | 'test_coverage';
    /** Weight of this criterion in the overall score (0-1) */
    weight: number;
    /** Minimum passing score for this criterion (0-1) */
    threshold: number;
}
export interface QualityGate {
    /** Type of quality gate */
    type: 'critique' | 'test' | 'lint' | 'types' | 'security' | 'manual' | 'multi';
    /** Individual quality criteria */
    criteria: QualityCriterion[];
    /** Minimum weighted average score to pass (0-1) */
    passingThreshold: number;
    /** Maximum iterations allowed */
    maxIterations: number;
    /** Whether to auto-retry on failure */
    autoRetry: boolean;
    /** Gate name (optional) */
    name?: string;
}
export interface GateEvaluationResult {
    /** The quality gate that was evaluated */
    gate: QualityGate;
    /** Whether the gate passed */
    passed: boolean;
    /** Overall score (0-1) */
    score: number;
    /** Scores per criterion */
    criterionScores: {
        dimension: string;
        weight: number;
        threshold: number;
        score: number;
        passed: boolean;
    }[];
    /** Issues that caused failures */
    failedCriteria: string[];
    /** Recommendations for improvement */
    recommendations: string[];
    /** Timestamp of evaluation */
    evaluatedAt: Date;
}
export interface TypeCheckResult {
    tool: 'typescript' | 'mypy' | 'cargo' | 'golangci-lint';
    success: boolean;
    errors: number;
    warnings: number;
    issues: TypeIssue[];
    metadata: {
        duration: number;
        filesScanned: number;
    };
}
export interface TypeIssue {
    file: string;
    line: number;
    column?: number;
    code: string;
    message: string;
    severity: SeverityLevel;
}
export interface SecurityScanResult {
    tool: 'trivy' | 'semgrep' | 'gosec' | 'bandit' | 'eslint-plugin-security';
    success: boolean;
    vulnerabilities: SecurityVulnerability[];
    metadata: {
        duration: number;
        dependenciesScanned: number;
    };
}
export interface SecurityVulnerability {
    id: string;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    title: string;
    description: string;
    file: string;
    line?: number;
    cwe?: string;
    remediation?: string;
    references?: string[];
}
export interface QualityCLIOptions {
    /** Agent ID to run quality checks on */
    agentId?: string;
    /** Task ID for gate evaluation */
    taskId?: string;
    /** Quality criteria as JSON string */
    criteria?: string;
    /** Strict mode (stricter thresholds) */
    strict?: boolean;
    /** Output format */
    format?: 'json' | 'table' | 'summary';
    /** Specific CWE list for security scans */
    cweList?: string[];
}
//# sourceMappingURL=types.d.ts.map