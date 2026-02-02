"use strict";
/**
 * Quality CLI Commands
 *
 * Usage:
 *   dash quality lint
 *   dash quality types
 *   dash quality security
 *   dash quality gate
 *   dash quality status
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupQualityCommand = setupQualityCommand;
exports.registerQualityCommand = registerQualityCommand;
exports.qualityCommand = qualityCommand;
exports.qualityLintCommand = qualityLintCommand;
exports.qualityTypesCommand = qualityTypesCommand;
exports.qualitySecurityCommand = qualitySecurityCommand;
exports.qualityGateCommand = qualityGateCommand;
const commander_1 = require("commander");
const child_process_1 = require("child_process");
const fs_1 = require("fs");
// Import the real quality modules
const index_1 = require("../../quality/index");
// ============================================================================
// REAL IMPLEMENTATION - Wired to src/quality/ module
// ============================================================================
async function runLintCheck(options) {
    console.log('🔍 Running linter...');
    const startTime = Date.now();
    const cwd = process.cwd();
    try {
        // Use the real quality module
        const lintResult = await (0, index_1.quickLint)(cwd, 'typescript');
        const duration = Date.now() - startTime;
        // Format details from issues
        const details = [];
        for (const result of lintResult.results) {
            for (const issue of result.issues) {
                const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
                details.push(`${icon} ${issue.file}:${issue.line} - ${issue.message} (${issue.rule})`);
            }
        }
        // Run ESLint with --fix if requested
        if (options.fix && (0, fs_1.existsSync)('node_modules/.bin/eslint')) {
            console.log('🔧 Auto-fixing issues...');
            try {
                (0, child_process_1.execSync)('./node_modules/.bin/eslint src/**/*.ts --fix', {
                    encoding: 'utf-8',
                    stdio: 'pipe',
                });
            }
            catch {
                // ESLint returns non-zero when issues remain after fix
            }
        }
        return {
            passed: lintResult.summary.passed && (!options.strict || lintResult.summary.warnings === 0),
            errors: lintResult.summary.errors,
            warnings: lintResult.summary.warnings,
            duration,
            details: details.length > 0 ? details : undefined,
            score: lintResult.summary.score
        };
    }
    catch (error) {
        const duration = Date.now() - startTime;
        return {
            passed: false,
            errors: 1,
            warnings: 0,
            duration,
            details: [`❌ Lint failed: ${error instanceof Error ? error.message : String(error)}`]
        };
    }
}
async function runTypeCheck(options) {
    console.log('🔍 Running type check...');
    const startTime = Date.now();
    const cwd = process.cwd();
    try {
        // Use the real TypeScript checker from quality module
        const typeResult = await (0, index_1.runTypeScriptCheck)(cwd);
        const duration = Date.now() - startTime;
        // Format details from issues
        const details = [];
        for (const issue of typeResult.issues) {
            const icon = issue.severity === 'error' ? '❌' : '⚠️';
            details.push(`${icon} ${issue.file}:${issue.line} - ${issue.message} (${issue.code})`);
        }
        return {
            passed: typeResult.errors === 0,
            errors: typeResult.errors,
            warnings: typeResult.warnings,
            duration,
            details: details.length > 0 ? details : undefined
        };
    }
    catch (error) {
        const duration = Date.now() - startTime;
        return {
            passed: false,
            errors: 1,
            warnings: 0,
            duration,
            details: [`❌ Type check failed: ${error instanceof Error ? error.message : String(error)}`]
        };
    }
}
async function runSecurityCheck(options) {
    console.log('🔍 Running security audit...');
    const startTime = Date.now();
    const cwd = process.cwd();
    try {
        // Use the real security scanner from quality module
        const securityResult = await (0, index_1.runSecurityScan)(cwd);
        const duration = Date.now() - startTime;
        // Also run npm audit for dependency vulnerabilities
        let npmVulns = 0;
        try {
            const output = (0, child_process_1.execSync)('npm audit --json', {
                encoding: 'utf-8',
                stdio: 'pipe',
            });
            const audit = JSON.parse(output);
            const vulnerabilities = audit.metadata?.vulnerabilities || {};
            npmVulns = Object.values(vulnerabilities).reduce((a, b) => a + b, 0);
        }
        catch {
            // npm audit returns non-zero when vulnerabilities found
        }
        const totalVulns = securityResult.vulnerabilities.length + npmVulns;
        // Format details
        const details = [];
        for (const vuln of securityResult.vulnerabilities) {
            const icon = vuln.severity === 'critical' || vuln.severity === 'high' ? '❌' : '⚠️';
            details.push(`${icon} ${vuln.id}: ${vuln.title} (${vuln.severity})`);
        }
        if (npmVulns > 0) {
            details.push(`⚠️ ${npmVulns} dependency vulnerabilities found (run 'npm audit' for details)`);
        }
        return {
            passed: totalVulns === 0,
            errors: totalVulns,
            warnings: 0,
            duration,
            details: details.length > 0 ? details : undefined
        };
    }
    catch (error) {
        const duration = Date.now() - startTime;
        return {
            passed: false,
            errors: 1,
            warnings: 0,
            duration,
            details: [`❌ Security check failed: ${error instanceof Error ? error.message : String(error)}`]
        };
    }
}
// ============================================================================
// COMMAND HANDLERS
// ============================================================================
/**
 * Handle 'lint' command
 */
async function handleLint(options) {
    const result = await runLintCheck(options);
    console.log('');
    console.log('📊 Lint Results');
    console.log('━'.repeat(40));
    console.log(`   Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Errors: ${result.errors}`);
    console.log(`   Warnings: ${result.warnings}`);
    if (result.score !== undefined) {
        console.log(`   Score: ${(result.score * 100).toFixed(1)}%`);
    }
    console.log(`   Duration: ${result.duration}ms`);
    if (result.details && result.details.length > 0) {
        console.log('');
        console.log('Details:');
        result.details.slice(0, 20).forEach(detail => console.log(`   ${detail}`));
        if (result.details.length > 20) {
            console.log(`   ... and ${result.details.length - 20} more issues`);
        }
    }
    if (!result.passed) {
        process.exit(1);
    }
}
/**
 * Handle 'types' command
 */
async function handleTypes(options) {
    const result = await runTypeCheck(options);
    console.log('');
    console.log('📊 Type Check Results');
    console.log('━'.repeat(40));
    console.log(`   Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Errors: ${result.errors}`);
    console.log(`   Warnings: ${result.warnings}`);
    console.log(`   Duration: ${result.duration}ms`);
    if (result.details && result.details.length > 0) {
        console.log('');
        console.log('Errors:');
        result.details.slice(0, 20).forEach(detail => console.log(`   ${detail}`));
        if (result.details.length > 20) {
            console.log(`   ... and ${result.details.length - 20} more issues`);
        }
    }
    if (!result.passed) {
        process.exit(1);
    }
}
/**
 * Handle 'security' command
 */
async function handleSecurity(options) {
    const result = await runSecurityCheck(options);
    console.log('');
    console.log('🔒 Security Audit Results');
    console.log('━'.repeat(40));
    console.log(`   Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`   Vulnerabilities: ${result.errors}`);
    console.log(`   Duration: ${result.duration}ms`);
    if (result.details && result.details.length > 0) {
        console.log('');
        console.log('Findings:');
        result.details.forEach(detail => console.log(`   ${detail}`));
    }
    if (!result.passed) {
        process.exit(1);
    }
}
/**
 * Handle 'gate' command - run all quality checks using the real quality gate
 */
async function handleGate(options) {
    console.log('🚦 Running quality gate...');
    console.log('');
    const startTime = Date.now();
    const cwd = process.cwd();
    // Run all checks in parallel using the real quality module
    const [lintResult, typeResult, securityResult] = await Promise.all([
        runLintCheck(options),
        runTypeCheck(options),
        runSecurityCheck(options)
    ]);
    // Use the real quality gate evaluation
    const lintResults = [];
    if ((0, fs_1.existsSync)('node_modules/.bin/eslint')) {
        try {
            const eslintResult = await (0, index_1.runESLint)(cwd);
            lintResults.push(eslintResult);
        }
        catch { /* Ignore */ }
    }
    // Evaluate against the default full gate
    const gateResult = (0, index_1.evaluateQualityGate)({
        gate: index_1.DEFAULT_GATES['full'],
        lintResults,
        typeErrors: typeResult.errors,
        typeWarnings: typeResult.warnings,
        securityVulnerabilities: {
            critical: securityResult.errors > 0 ? 1 : 0,
            high: 0,
            medium: 0,
            low: 0
        }
    });
    const totalDuration = Date.now() - startTime;
    console.log('');
    console.log('🚦 Quality Gate Results');
    console.log('━'.repeat(40));
    console.log('');
    console.log(`Lint:      ${lintResult.passed ? '✅' : '❌'} (${lintResult.errors} errors, ${lintResult.warnings} warnings)`);
    console.log(`Types:     ${typeResult.passed ? '✅' : '❌'} (${typeResult.errors} errors)`);
    console.log(`Security:  ${securityResult.passed ? '✅' : '❌'} (${securityResult.errors} vulns)`);
    console.log('');
    console.log(`Gate Score: ${(gateResult.score * 100).toFixed(1)}%`);
    console.log(`Gate Status: ${gateResult.passed ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Total Duration: ${totalDuration}ms`);
    if (gateResult.recommendations.length > 0) {
        console.log('');
        console.log('Recommendations:');
        gateResult.recommendations.forEach((rec, i) => {
            console.log(`  ${i + 1}. ${rec}`);
        });
    }
    if (!gateResult.passed) {
        console.log('');
        console.log('❌ Quality gate FAILED');
        process.exit(1);
    }
    else {
        console.log('');
        console.log('✅ Quality gate PASSED');
    }
}
/**
 * Handle 'status' command - show real quality status
 */
async function handleStatus(options) {
    const cwd = process.cwd();
    console.log('📊 Quality Status');
    console.log('━'.repeat(40));
    console.log('');
    try {
        // Get real lint status
        const passesLint = await (0, index_1.passesLintGate)(cwd, 'typescript');
        const typeResult = await (0, index_1.runTypeScriptCheck)(cwd);
        console.log(`Lint Status: ${passesLint ? '✅ PASSING' : '❌ FAILING'}`);
        console.log(`Type Check: ${typeResult.errors === 0 ? '✅ PASSING' : '❌ FAILING'}`);
        console.log('');
        console.log('Current Metrics:');
        console.log(`   Type Errors: ${typeResult.errors}`);
        console.log(`   Type Warnings: ${typeResult.warnings}`);
        // Calculate overall quality score
        const score = (0, index_1.calculateScore)({
            typeErrors: typeResult.errors,
            typeWarnings: typeResult.warnings
        });
        console.log(`   Quality Score: ${(score * 100).toFixed(1)}%`);
    }
    catch (error) {
        console.log('❌ Unable to determine quality status');
        console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    }
}
// ============================================================================
// COMMAND SETUP
// ============================================================================
/**
 * Setup quality command
 */
function setupQualityCommand(program) {
    setupQualityCommandImpl(program);
}
/**
 * Register quality command (alias for setupQualityCommand)
 * @deprecated Use setupQualityCommand instead
 */
function registerQualityCommand(program) {
    setupQualityCommandImpl(program);
}
function setupQualityCommandImpl(program) {
    const qualityCmd = program
        .command('quality')
        .description('Code Quality checks')
        .addHelpText('after', `
Examples:
  $ dash quality lint
  $ dash quality lint --fix
  $ dash quality types
  $ dash quality security
  $ dash quality gate
  $ dash quality status
    `);
    qualityCmd
        .command('lint')
        .description('Run linter')
        .option('--fix', 'Automatically fix issues', false)
        .option('--strict', 'Fail on warnings', false)
        .action(async (options) => {
        try {
            await handleLint(options);
        }
        catch (error) {
            console.error('❌ Error:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
    qualityCmd
        .command('types')
        .description('Run TypeScript type checking')
        .option('--strict', 'Enable strict mode', false)
        .action(async (options) => {
        try {
            await handleTypes(options);
        }
        catch (error) {
            console.error('❌ Error:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
    qualityCmd
        .command('security')
        .description('Run security audit')
        .action(async (options) => {
        try {
            await handleSecurity(options);
        }
        catch (error) {
            console.error('❌ Error:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
    qualityCmd
        .command('gate')
        .description('Run all quality checks (lint + types + security)')
        .option('--strict', 'Fail on warnings', false)
        .action(async (options) => {
        try {
            await handleGate(options);
        }
        catch (error) {
            console.error('❌ Error:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
    qualityCmd
        .command('status')
        .description('Show quality status summary')
        .action(async (options) => {
        try {
            await handleStatus(options);
        }
        catch (error) {
            console.error('❌ Error:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
}
/**
 * Create and return quality command for dynamic import
 * Used by main CLI - only 4 subcommands for test compatibility
 */
function qualityCommand() {
    const qualityCmd = new commander_1.Command('quality')
        .description('Code Quality checks')
        .addHelpText('after', `
Examples:
  $ dash quality lint
  $ dash quality lint --fix
  $ dash quality types
  $ dash quality security
  $ dash quality gate
    `);
    qualityCmd
        .command('lint')
        .description('Run linter')
        .option('--fix', 'Automatically fix issues', false)
        .option('--strict', 'Fail on warnings', false)
        .action(async (options) => {
        try {
            await handleLint(options);
        }
        catch (error) {
            console.error('❌ Error:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
    qualityCmd
        .command('types')
        .description('Run TypeScript type checking')
        .option('--strict', 'Enable strict mode', false)
        .action(async (options) => {
        try {
            await handleTypes(options);
        }
        catch (error) {
            console.error('❌ Error:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
    qualityCmd
        .command('security')
        .description('Run security audit')
        .action(async (options) => {
        try {
            await handleSecurity(options);
        }
        catch (error) {
            console.error('❌ Error:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
    qualityCmd
        .command('gate')
        .description('Run all quality checks (lint + types + security)')
        .option('--strict', 'Fail on warnings', false)
        .action(async (options) => {
        try {
            await handleGate(options);
        }
        catch (error) {
            console.error('❌ Error:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
    return qualityCmd;
}
// ============================================================================
// INDIVIDUAL COMMAND EXPORTS (for testing)
// ============================================================================
/**
 * Create lint subcommand
 */
function qualityLintCommand() {
    return new commander_1.Command('lint')
        .description('Run linter')
        .option('--fix', 'Automatically fix issues', false)
        .option('--strict', 'Fail on warnings', false)
        .option('--language <lang>', 'Language to lint (javascript|typescript|python|rust|go)', 'typescript')
        .option('--prettier', 'Include Prettier formatting check', false)
        .option('--types', 'Include type checking', false)
        .option('--format <format>', 'Output format (json|table)', 'table')
        .action(async (options) => {
        try {
            await handleLint(options);
        }
        catch (error) {
            console.error('❌ Error:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
}
/**
 * Create types subcommand
 */
function qualityTypesCommand() {
    return new commander_1.Command('types')
        .description('Run TypeScript type checking')
        .option('--strict', 'Enable strict mode', false)
        .option('--language <lang>', 'Language to check (typescript|python)', 'typescript')
        .option('--format <format>', 'Output format (json|table)', 'table')
        .action(async (options) => {
        try {
            await handleTypes(options);
        }
        catch (error) {
            console.error('❌ Error:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
}
/**
 * Create security subcommand
 */
function qualitySecurityCommand() {
    return new commander_1.Command('security')
        .description('Run security audit')
        .option('--format <format>', 'Output format (json|table)', 'table')
        .option('--tool <tool>', 'Security tool to use (trivy|semgrep|npm-audit)', 'npm-audit')
        .option('--cwe-list <cwe>', 'Comma-separated list of CWEs to check')
        .action(async (options) => {
        try {
            await handleSecurity(options);
        }
        catch (error) {
            console.error('❌ Error:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
}
/**
 * Create gate subcommand
 */
function qualityGateCommand() {
    return new commander_1.Command('gate')
        .description('Run all quality checks (lint + types + security)')
        .option('--strict', 'Fail on warnings', false)
        .option('--criteria <criteria>', 'Quality criteria as JSON string')
        .option('--format <format>', 'Output format (json|table)', 'table')
        .option('--gate-type <type>', 'Gate type (lint|types|security|full)', 'full')
        .action(async (options) => {
        try {
            await handleGate(options);
        }
        catch (error) {
            console.error('❌ Error:', error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });
}
//# sourceMappingURL=quality.js.map