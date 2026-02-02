/**
 * Linter Integration Module
 */
import type { LintResult, TypeIssue, SecurityVulnerability } from './types';
export declare function runESLint(cwd: string, patterns?: string[]): Promise<LintResult>;
export declare function runPrettier(cwd: string, patterns?: string[]): Promise<LintResult>;
export declare function runPylint(cwd: string, patterns?: string[]): Promise<LintResult>;
export declare function runMyPy(cwd: string, patterns?: string[]): Promise<{
    errors: number;
    warnings: number;
    issues: TypeIssue[];
}>;
export declare function runRustfmt(cwd: string): Promise<LintResult>;
export declare function runCargoCheck(cwd: string): Promise<LintResult>;
export declare function runGolangciLint(cwd: string, patterns?: string[]): Promise<LintResult>;
export declare function runTypeScriptCheck(cwd: string): Promise<{
    errors: number;
    warnings: number;
    issues: TypeIssue[];
}>;
export declare function runSecurityScan(cwd: string): Promise<{
    vulnerabilities: SecurityVulnerability[];
    success: boolean;
}>;
export interface LinterRunnerOptions {
    cwd: string;
    language: 'javascript' | 'typescript' | 'python' | 'rust' | 'go' | 'all';
    includePrettier?: boolean;
    includeTypes?: boolean;
    includeSecurity?: boolean;
}
export declare function runLinters(options: LinterRunnerOptions): Promise<LintResult[]>;
export interface AgentLintOptions {
    agentId: string;
    agentPath: string;
    language?: 'javascript' | 'typescript' | 'python' | 'rust' | 'go' | 'auto';
    includePrettier?: boolean;
    includeTypes?: boolean;
    includeSecurity?: boolean;
}
export declare function lintAgentCodebase(options: AgentLintOptions): Promise<{
    results: LintResult[];
    summary: {
        totalErrors: number;
        totalWarnings: number;
        totalHints: number;
        filesWithIssues: string[];
        score: number;
    };
}>;
//# sourceMappingURL=linter.d.ts.map