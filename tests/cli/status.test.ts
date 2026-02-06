/**
 * Status Command Tests
 */

describe('status command', () => {
  const originalExit = process.exit;
  const originalLog = console.log;
  const originalError = console.error;
  
  beforeEach(() => {
    jest.resetModules();
    process.exit = jest.fn() as any;
    console.log = jest.fn();
    console.error = jest.fn();
  });
  
  afterEach(() => {
    process.exit = originalExit;
    console.log = originalLog;
    console.error = originalError;
    jest.restoreAllMocks();
  });
  
  it('should show status without crashing', async () => {
    // Import fresh module
    const { statusCommand } = require('../../src/cli/commands/status');
    const { Command } = require('commander');
    
    const program = new Command();
    program.addCommand(statusCommand());
    
    await program.parseAsync(['status']);
    
    expect(console.log).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('=== Godel Status ==='));
  });
  
  it('should support --simple flag', async () => {
    const { statusCommand } = require('../../src/cli/commands/status');
    const { Command } = require('commander');
    
    const program = new Command();
    program.addCommand(statusCommand());
    
    await program.parseAsync(['status', '--simple']);
    
    expect(console.log).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('=== Godel Status ==='));
  });
  
  it('should support --json flag', async () => {
    const { statusCommand } = require('../../src/cli/commands/status');
    const { Command } = require('commander');
    
    const program = new Command();
    program.addCommand(statusCommand());
    
    await program.parseAsync(['status', '--json']);
    
    expect(console.log).toHaveBeenCalled();
    const output = JSON.parse((console.log as jest.Mock).mock.calls[0][0]);
    expect(output).toHaveProperty('version');
    expect(output).toHaveProperty('uptime');
    expect(output).toHaveProperty('memory');
    expect(output).toHaveProperty('timestamp');
    expect(output).toHaveProperty('pid');
  });
});
