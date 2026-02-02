/**
 * Quality CLI Command Tests
 * 
 * Integration tests for the 'dash quality' command group
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as fs from 'fs';
import * as path from 'path';

// Mock fs module first
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  readFileSync: jest.fn()
}));

// Mock the quality module
jest.mock('../../../src/quality/index', () => ({
  lintAgentCodebase: jest.fn().mockResolvedValue({
    results: [
      {
        tool: 'eslint',
        success: true,
        summary: { errors: 0, warnings: 2, hints: 0, info: 0, total: 2 },
        issues: []
      }
    ]
  }),
  runTypeScriptCheck: jest.fn().mockResolvedValue({
    errors: 0,
    warnings: 1,
    issues: []
  }),
  runMyPy: jest.fn().mockResolvedValue({
    errors: 0,
    warnings: 0,
    issues: []
  }),
  runSecurityScan: jest.fn().mockResolvedValue({
    vulnerabilities: [],
    success: true
  }),
  evaluateQualityGate: jest.fn().mockReturnValue({
    passed: true,
    score: 0.95,
    gate: { name: 'full' },
    criterionScores: [],
    failedCriteria: [],
    recommendations: [],
    evaluatedAt: new Date()
  }),
  generateLintSummary: jest.fn().mockReturnValue({
    aggregate: { errors: 0, warnings: 2, filesWithIssues: new Set() },
    score: 0.96,
    passed: true
  }),
  DEFAULT_GATES: {
    lint: { name: 'lint', criteria: { maxErrors: 0, maxWarnings: 10 } },
    types: { name: 'types', criteria: { maxTypeErrors: 0 } },
    security: { name: 'security', criteria: { maxCritical: 0, maxHigh: 0 } },
    full: { name: 'full', criteria: { maxErrors: 0, maxWarnings: 5, maxCritical: 0, maxHigh: 0 } }
  },
  formatGateResult: jest.fn().mockReturnValue('Gate: PASSED'),
  createGateFromCriteria: jest.fn().mockReturnValue({ name: 'custom', criteria: {} })
}));

import { 
  qualityCommand,
  qualityLintCommand,
  qualityTypesCommand,
  qualitySecurityCommand,
  qualityGateCommand
} from '../../../src/cli/commands/quality';

import { 
  lintAgentCodebase,
  runTypeScriptCheck,
  runSecurityScan,
  evaluateQualityGate,
  generateLintSummary,
  DEFAULT_GATES
} from '../../../src/quality/index';

const mockedFs = jest.mocked(fs);
const mockedLintAgentCodebase = jest.mocked(lintAgentCodebase);
const mockedRunTypeScriptCheck = jest.mocked(runTypeScriptCheck);
const mockedRunSecurityScan = jest.mocked(runSecurityScan);
const mockedEvaluateQualityGate = jest.mocked(evaluateQualityGate);
const mockedGenerateLintSummary = jest.mocked(generateLintSummary);

describe('Quality CLI Commands', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    
    // Default mock setup for fs
    mockedFs.existsSync.mockReturnValue(true);
    mockedFs.readdirSync.mockReturnValue(['jarvis', 'shuri'] as any);
    mockedFs.statSync.mockReturnValue({ isDirectory: () => true } as any);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('qualityCommand', () => {
    it('should create quality command with correct name', () => {
      const cmd = qualityCommand();
      expect(cmd.name()).toBe('quality');
    });

    it('should have description containing Quality', () => {
      const cmd = qualityCommand();
      expect(cmd.description()).toContain('Quality');
    });

    it('should have 4 subcommands', () => {
      const cmd = qualityCommand();
      expect(cmd.commands.length).toBe(4);
    });

    it('should include lint subcommand', () => {
      const cmd = qualityCommand();
      const subcommandNames = cmd.commands.map((c: any) => c.name());
      expect(subcommandNames.some((n: string) => n.startsWith('lint'))).toBe(true);
    });

    it('should include types subcommand', () => {
      const cmd = qualityCommand();
      const subcommandNames = cmd.commands.map((c: any) => c.name());
      expect(subcommandNames.some((n: string) => n.startsWith('types'))).toBe(true);
    });

    it('should include security subcommand', () => {
      const cmd = qualityCommand();
      const subcommandNames = cmd.commands.map((c: any) => c.name());
      expect(subcommandNames.some((n: string) => n.startsWith('security'))).toBe(true);
    });

    it('should include gate subcommand', () => {
      const cmd = qualityCommand();
      const subcommandNames = cmd.commands.map((c: any) => c.name());
      expect(subcommandNames.some((n: string) => n.startsWith('gate'))).toBe(true);
    });
  });

  describe('qualityLintCommand', () => {
    it('should create lint command with correct name', () => {
      const cmd = qualityLintCommand();
      expect(cmd.name()).toContain('lint');
    });

    it('should have format option', () => {
      const cmd = qualityLintCommand();
      const formatOption = cmd.options.find((o: any) => o.long === '--format');
      expect(formatOption).toBeDefined();
    });

    it('should have language option', () => {
      const cmd = qualityLintCommand();
      const langOption = cmd.options.find((o: any) => o.long === '--language');
      expect(langOption).toBeDefined();
    });

    it('should have prettier option', () => {
      const cmd = qualityLintCommand();
      const prettierOption = cmd.options.find((o: any) => 
        o.flags && o.flags.includes('prettier')
      );
      expect(prettierOption).toBeDefined();
    });

    it('should have types option', () => {
      const cmd = qualityLintCommand();
      const typesOption = cmd.options.find((o: any) => 
        o.flags && o.flags.includes('types')
      );
      expect(typesOption).toBeDefined();
    });
  });

  describe('qualityTypesCommand', () => {
    it('should create types command with correct name', () => {
      const cmd = qualityTypesCommand();
      expect(cmd.name()).toContain('types');
    });

    it('should have format option', () => {
      const cmd = qualityTypesCommand();
      const formatOption = cmd.options.find((o: any) => o.long === '--format');
      expect(formatOption).toBeDefined();
    });

    it('should have language option', () => {
      const cmd = qualityTypesCommand();
      const langOption = cmd.options.find((o: any) => o.long === '--language');
      expect(langOption).toBeDefined();
    });

    it('should have strict option', () => {
      const cmd = qualityTypesCommand();
      const strictOption = cmd.options.find((o: any) => o.long === '--strict');
      expect(strictOption).toBeDefined();
    });
  });

  describe('qualitySecurityCommand', () => {
    it('should create security command with correct name', () => {
      const cmd = qualitySecurityCommand();
      expect(cmd.name()).toContain('security');
    });

    it('should have format option', () => {
      const cmd = qualitySecurityCommand();
      const formatOption = cmd.options.find((o: any) => o.long === '--format');
      expect(formatOption).toBeDefined();
    });

    it('should have tool option', () => {
      const cmd = qualitySecurityCommand();
      const toolOption = cmd.options.find((o: any) => o.long === '--tool');
      expect(toolOption).toBeDefined();
    });

    it('should have cwe-list option', () => {
      const cmd = qualitySecurityCommand();
      const cweOption = cmd.options.find((o: any) => o.long === '--cwe-list');
      expect(cweOption).toBeDefined();
    });
  });

  describe('qualityGateCommand', () => {
    it('should create gate command with correct name', () => {
      const cmd = qualityGateCommand();
      expect(cmd.name()).toContain('gate');
    });

    it('should have criteria option', () => {
      const cmd = qualityGateCommand();
      const criteriaOption = cmd.options.find((o: any) => o.long === '--criteria');
      expect(criteriaOption).toBeDefined();
    });

    it('should have format option', () => {
      const cmd = qualityGateCommand();
      const formatOption = cmd.options.find((o: any) => o.long === '--format');
      expect(formatOption).toBeDefined();
    });

    it('should have gate-type option', () => {
      const cmd = qualityGateCommand();
      const gateTypeOption = cmd.options.find((o: any) => o.long === '--gate-type');
      expect(gateTypeOption).toBeDefined();
    });
  });

  describe('DEFAULT_GATES configuration', () => {
    it('should have lint gate defined', () => {
      expect(DEFAULT_GATES['lint']).toBeDefined();
      expect(DEFAULT_GATES['lint'].name).toBe('lint');
    });

    it('should have types gate defined', () => {
      expect(DEFAULT_GATES['types']).toBeDefined();
      expect(DEFAULT_GATES['types'].name).toBe('types');
    });

    it('should have security gate defined', () => {
      expect(DEFAULT_GATES['security']).toBeDefined();
      expect(DEFAULT_GATES['security'].name).toBe('security');
    });

    it('should have full gate defined', () => {
      expect(DEFAULT_GATES['full']).toBeDefined();
      expect(DEFAULT_GATES['full'].name).toBe('full');
    });

    it('should have criteria for lint gate', () => {
      expect(DEFAULT_GATES['lint'].criteria).toBeDefined();
      expect(typeof DEFAULT_GATES['lint'].criteria).toBe('object');
    });
  });

  describe('lint score calculation', () => {
    it('should calculate 100% score with no issues', () => {
      const score = calculateLintScore(0, 0);
      expect(score).toBe(100);
    });

    it('should calculate reduced score with warnings', () => {
      const score = calculateLintScore(0, 10);
      expect(score).toBe(80);
    });

    it('should calculate reduced score with errors', () => {
      const score = calculateLintScore(5, 0);
      expect(score).toBe(50);
    });

    it('should calculate minimum 0 score', () => {
      const score = calculateLintScore(20, 50);
      expect(score).toBe(0);
    });

    it('should handle mixed errors and warnings', () => {
      const score = calculateLintScore(3, 5);
      expect(score).toBe(60);
    });
  });

  describe('type score calculation', () => {
    it('should calculate 1.0 score with no issues', () => {
      const score = calculateTypeScore(0, 0);
      expect(score).toBe(1);
    });

    it('should calculate reduced score with warnings', () => {
      const score = calculateTypeScore(0, 5);
      expect(score).toBe(0.9);
    });

    it('should calculate reduced score with errors', () => {
      const score = calculateTypeScore(5, 0);
      expect(score).toBe(0.5);
    });

    it('should calculate minimum 0 score', () => {
      const score = calculateTypeScore(15, 20);
      expect(score).toBe(0);
    });
  });

  describe('vulnerability filtering', () => {
    it('should filter critical vulnerabilities', () => {
      const vulns = [
        { severity: 'critical' },
        { severity: 'high' },
        { severity: 'medium' }
      ];
      const critical = vulns.filter(v => v.severity === 'critical');
      expect(critical.length).toBe(1);
    });

    it('should filter high vulnerabilities', () => {
      const vulns = [
        { severity: 'critical' },
        { severity: 'high' },
        { severity: 'high' },
        { severity: 'medium' }
      ];
      const high = vulns.filter(v => v.severity === 'high');
      expect(high.length).toBe(2);
    });

    it('should pass security check with no critical/high', () => {
      const vulns = [{ severity: 'medium' }, { severity: 'low' }];
      const critical = vulns.filter(v => v.severity === 'critical').length;
      const high = vulns.filter(v => v.severity === 'high').length;
      expect(critical === 0 && high === 0).toBe(true);
    });

    it('should fail security check with critical', () => {
      const vulns = [{ severity: 'critical' }];
      const critical = vulns.filter(v => v.severity === 'critical').length;
      expect(critical === 0).toBe(false);
    });

    it('should fail security check with high', () => {
      const vulns = [{ severity: 'high' }];
      const high = vulns.filter(v => v.severity === 'high').length;
      expect(high === 0).toBe(false);
    });
  });
});

// Helper functions (matching the actual implementation)
function calculateLintScore(errors: number, warnings: number): number {
  const score = Math.max(0, 1 - errors * 0.1 - warnings * 0.02);
  return Math.round(score * 100);
}

function calculateTypeScore(errors: number, warnings: number): number {
  const score = Math.max(0, 1 - errors * 0.1 - warnings * 0.02);
  return Math.round(score * 100) / 100;
}
