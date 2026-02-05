/**
 * Config Command Tests
 */

describe('config command', () => {
  const originalExit = process.exit;
  const originalLog = console.log;
  const originalError = console.error;
  const originalStdoutWrite = process.stdout.write;
  
  beforeEach(() => {
    jest.resetModules();
    process.exit = jest.fn() as any;
    console.log = jest.fn();
    console.error = jest.fn();
    process.stdout.write = jest.fn() as any;
  });
  
  afterEach(() => {
    process.exit = originalExit;
    console.log = originalLog;
    console.error = originalError;
    process.stdout.write = originalStdoutWrite;
    jest.restoreAllMocks();
  });
  
  it('should have get subcommand', async () => {
    const { configCommand } = require('../../src/cli/commands/config');
    const { Command } = require('commander');
    
    const program = new Command();
    program.addCommand(configCommand());
    
    await program.parseAsync(['config', 'get', 'server.port'], { from: 'user' });
    
    const outputCalls = (process.stdout.write as jest.Mock).mock.calls.length + (console.error as jest.Mock).mock.calls.length;
    expect(outputCalls).toBeGreaterThan(0);
    expect(process.exit).toHaveBeenCalled();
  });
  
  it('should have list subcommand', async () => {
    const { configCommand } = require('../../src/cli/commands/config');
    const { Command } = require('commander');
    
    const program = new Command();
    program.addCommand(configCommand());
    
    await program.parseAsync(['config', 'list'], { from: 'user' });
    
    expect(process.stdout.write).toHaveBeenCalled();
  });
  
  it('should show helpful error for missing key', async () => {
    const { configCommand } = require('../../src/cli/commands/config');
    const { Command } = require('commander');
    
    const program = new Command();
    program.addCommand(configCommand());
    
    await program.parseAsync(['config', 'get', 'nonexistent.key'], { from: 'user' });
    
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Config key not found'));
  });
  
  it('should exit with code 1 for missing key', async () => {
    const { configCommand } = require('../../src/cli/commands/config');
    const { Command } = require('commander');
    
    const program = new Command();
    program.addCommand(configCommand());
    
    await program.parseAsync(['config', 'get', 'nonexistent.key'], { from: 'user' });
    
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
