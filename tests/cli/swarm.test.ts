/**
 * Swarm Command Tests
 */

describe('swarm command', () => {
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
  
  it('should show validation error without name and task', async () => {
    const { swarmCommand } = require('../../src/cli/commands/swarm');
    const { Command } = require('commander');
    
    const program = new Command();
    program.addCommand(swarmCommand());
    
    await program.parseAsync(['swarm', 'create']);
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Validation failed'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('--name'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('--task'));
    expect(process.exit).toHaveBeenCalledWith(1);
  });
  
  it('should create swarm with name and task', async () => {
    const { swarmCommand } = require('../../src/cli/commands/swarm');
    const { Command } = require('commander');
    
    const program = new Command();
    program.addCommand(swarmCommand());
    
    await program.parseAsync(['swarm', 'create', '-n', 'test-swarm', '-t', 'test task']);
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Swarm created'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('test-swarm'));
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('test task'));
  });
  
  it('should have list subcommand', async () => {
    const { swarmCommand } = require('../../src/cli/commands/swarm');
    const { Command } = require('commander');
    
    const program = new Command();
    program.addCommand(swarmCommand());
    
    await program.parseAsync(['swarm', 'list']);
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('=== Swarms ==='));
  });
  
  it('should have status subcommand', async () => {
    const { swarmCommand } = require('../../src/cli/commands/swarm');
    const { Command } = require('commander');
    
    const program = new Command();
    program.addCommand(swarmCommand());
    
    await program.parseAsync(['swarm', 'status']);
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Swarm ID required'));
    expect(process.exit).toHaveBeenCalledWith(1);
  });
  
  it('should show swarm status with id', async () => {
    const { swarmCommand } = require('../../src/cli/commands/swarm');
    const { Command } = require('commander');
    
    const program = new Command();
    program.addCommand(swarmCommand());
    
    await program.parseAsync(['swarm', 'status', 'test-id']);
    
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('=== Swarm: test-id ==='));
  });
});
