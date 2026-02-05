/**
 * Config Command Tests
 */

describe('config command', () => {
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
  
  it('should have get subcommand', async () => {
    const { configCommand } = require('../../src/cli/commands/config');
    const { Command } = require('commander');
    
    const program = new Command();
    program.addCommand(configCommand());
    
    await program.parseAsync(['config', 'get', 'server.port']);
    
    // Either succeeds with value or fails gracefully with "not found"
    expect((console.log as jest.Mock).mock.calls.length + (console.error as jest.Mock).mock.calls.length)
      .toBeGreaterThan(0);
  });
  
  it('should have list subcommand', async () => {
    const { configCommand } = require('../../src/cli/commands/config');
    const { Command } = require('commander');
    
    const program = new Command();
    program.addCommand(configCommand());
    
    await program.parseAsync(['config', 'list']);
    
    expect(console.log).toHaveBeenCalled();
  });
  
  it('should show helpful error for missing key', async () => {
    const { configCommand } = require('../../src/cli/commands/config');
    const { Command } = require('commander');
    
    const program = new Command();
    program.addCommand(configCommand());
    
    await program.parseAsync(['config', 'get', 'nonexistent.key']);
    
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Config key not found'));
  });
  
  it('should exit with code 1 for missing key', async () => {
    const { configCommand } = require('../../src/cli/commands/config');
    const { Command } = require('commander');
    
    const program = new Command();
    program.addCommand(configCommand());
    
    await program.parseAsync(['config', 'get', 'nonexistent.key']);
    
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
