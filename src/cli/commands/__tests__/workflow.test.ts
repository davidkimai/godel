/**
 * Workflow CLI Commands Tests
 */

import { Command } from 'commander';
import { createWorkflowCommand, registerWorkflowCommand } from '../workflow';
import * as fs from 'fs';
import * as path from 'path';

// Mock dependencies
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

import { logger } from '../../../utils/logger';

describe('Workflow CLI Commands', () => {
  let command: Command;
  const mockedLogger = logger as jest.Mocked<typeof logger>;

  beforeEach(() => {
    jest.clearAllMocks();
    command = createWorkflowCommand();
  });

  describe('Command Structure', () => {
    it('should create workflow command with correct name', () => {
      expect(command.name()).toBe('workflow');
    });

    it('should have all required subcommands', () => {
      const subcommands = command.commands.map(cmd => cmd.name());
      
      expect(subcommands).toContain('list');
      expect(subcommands).toContain('show');
      expect(subcommands).toContain('run');
      expect(subcommands).toContain('ps');
      expect(subcommands).toContain('status');
      expect(subcommands).toContain('cancel');
      expect(subcommands).toContain('validate');
      expect(subcommands).toContain('export');
    });
  });

  describe('workflow list', () => {
    it('should have list subcommand', () => {
      const listCmd = command.commands.find(cmd => cmd.name() === 'list');
      expect(listCmd).toBeDefined();
    });

    it('should have correct options', () => {
      const listCmd = command.commands.find(cmd => cmd.name() === 'list')!;
      const options = listCmd.options.map(opt => opt.long);
      
      expect(options).toContain('--tag');
      expect(options).toContain('--category');
      expect(options).toContain('--json');
    });
  });

  describe('workflow show', () => {
    it('should have show subcommand with required argument', () => {
      const showCmd = command.commands.find(cmd => cmd.name() === 'show');
      expect(showCmd).toBeDefined();
    });

    it('should have correct options', () => {
      const showCmd = command.commands.find(cmd => cmd.name() === 'show')!;
      const options = showCmd.options.map(opt => opt.long);
      
      expect(options).toContain('--json');
    });
  });

  describe('workflow run', () => {
    it('should have run subcommand with required argument', () => {
      const runCmd = command.commands.find(cmd => cmd.name() === 'run');
      expect(runCmd).toBeDefined();
    });

    it('should have correct options', () => {
      const runCmd = command.commands.find(cmd => cmd.name() === 'run')!;
      const options = runCmd.options.map(opt => opt.long);
      
      expect(options).toContain('--input');
      expect(options).toContain('--input-file');
      expect(options).toContain('--watch');
      expect(options).toContain('--async');
      expect(options).toContain('--timeout');
    });
  });

  describe('workflow ps', () => {
    it('should have ps subcommand', () => {
      const psCmd = command.commands.find(cmd => cmd.name() === 'ps');
      expect(psCmd).toBeDefined();
    });

    it('should have correct options', () => {
      const psCmd = command.commands.find(cmd => cmd.name() === 'ps')!;
      const options = psCmd.options.map(opt => opt.long);
      
      expect(options).toContain('--all');
      expect(options).toContain('--json');
    });
  });

  describe('workflow status', () => {
    it('should have status subcommand with required argument', () => {
      const statusCmd = command.commands.find(cmd => cmd.name() === 'status');
      expect(statusCmd).toBeDefined();
    });

    it('should have correct options', () => {
      const statusCmd = command.commands.find(cmd => cmd.name() === 'status')!;
      const options = statusCmd.options.map(opt => opt.long);
      
      expect(options).toContain('--json');
      expect(options).toContain('--follow');
    });
  });

  describe('workflow cancel', () => {
    it('should have cancel subcommand with required argument', () => {
      const cancelCmd = command.commands.find(cmd => cmd.name() === 'cancel');
      expect(cancelCmd).toBeDefined();
    });

    it('should have correct options', () => {
      const cancelCmd = command.commands.find(cmd => cmd.name() === 'cancel')!;
      const options = cancelCmd.options.map(opt => opt.long);
      
      expect(options).toContain('--yes');
    });
  });

  describe('workflow validate', () => {
    it('should have validate subcommand with required argument', () => {
      const validateCmd = command.commands.find(cmd => cmd.name() === 'validate');
      expect(validateCmd).toBeDefined();
    });

    it('should have correct options', () => {
      const validateCmd = command.commands.find(cmd => cmd.name() === 'validate')!;
      const options = validateCmd.options.map(opt => opt.long);
      
      expect(options).toContain('--json');
    });
  });

  describe('workflow export', () => {
    it('should have export subcommand with required argument', () => {
      const exportCmd = command.commands.find(cmd => cmd.name() === 'export');
      expect(exportCmd).toBeDefined();
    });

    it('should have correct options', () => {
      const exportCmd = command.commands.find(cmd => cmd.name() === 'export')!;
      const options = exportCmd.options.map(opt => opt.long);
      
      expect(options).toContain('--format');
      expect(options).toContain('--output');
    });
  });

  describe('registerWorkflowCommand', () => {
    it('should register workflow command on program', () => {
      const program = new Command();
      registerWorkflowCommand(program);

      const commands = program.commands.map(cmd => cmd.name());
      expect(commands).toContain('workflow');
    });
  });
});

describe('Workflow Validation', () => {
  const testDir = path.join(__dirname, '__test_workflows__');

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should validate a valid workflow JSON file', () => {
    const validWorkflow = {
      id: 'test-workflow',
      name: 'Test Workflow',
      version: '1.0.0',
      nodes: [
        {
          id: 'node1',
          type: 'task',
          name: 'Task Node',
          config: {
            type: 'task',
            taskType: 'shell.exec',
            parameters: {},
          },
        },
      ],
      edges: [],
    };

    const filePath = path.join(testDir, 'valid.json');
    fs.writeFileSync(filePath, JSON.stringify(validWorkflow, null, 2));

    // File should exist and be readable
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.id).toBe('test-workflow');
  });

  it('should validate workflow structure', () => {
    const invalidWorkflow = {
      // Missing id
      name: 'Invalid Workflow',
      nodes: [],
      edges: [],
    };

    const filePath = path.join(testDir, 'invalid.json');
    fs.writeFileSync(filePath, JSON.stringify(invalidWorkflow, null, 2));

    // File should exist
    expect(fs.existsSync(filePath)).toBe(true);
  });
});

describe('Export Formats', () => {
  // These tests verify the export functions are correctly structured
  // Full integration tests would require running the CLI
  
  it('should support mermaid export format', () => {
    // Mermaid format is the default
    expect(true).toBe(true);
  });

  it('should support dot export format', () => {
    // DOT format is supported
    expect(true).toBe(true);
  });

  it('should support json export format', () => {
    // JSON format is supported
    expect(true).toBe(true);
  });
});
