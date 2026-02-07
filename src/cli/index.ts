#!/usr/bin/env node
/**
 * godel - Godel CLI
 * 
 * A comprehensive CLI for managing Godel agent orchestration platform.
 * 
 * Usage:
 *   godel <command> [options]
 * 
 * Commands:
 *   do          Execute intents using agent teams
 *   team       Manage agent teams
 *   agent       Manage AI agents
 *   task        Manage tasks
 *   events      Event streaming and management
 *   bus         Message bus operations
 *   metrics     System metrics and monitoring
 *   status      Overall system status
 *   health      Health check
 *   config      Configuration management
 * 
 * Global Options:
 *   -h, --help     Show help
 *   -V, --version  Show version
 *   --format       Output format (table|json|jsonl)
 */

import { logger } from '../utils/logger';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { registerTeamCommand } from './commands/team';
import { registerAgentCommand } from './commands/agent';
import { registerTaskCommand } from './commands/task';
import { registerTaskListCommand } from './commands/tasklist';
import { registerEventsCommand } from './commands/events';
import { registerBusCommand } from './commands/bus';
import { 
  registerMetricsCommand, 
  registerHealthCommand 
} from './commands/metrics';
import { configCommand } from './commands/config';
import { statusCommand } from './commands/status';
import { registerDoCommand } from './intent';
import { registerDashboardCommand } from './commands/dashboard';
import { registerWorktreeCommand } from './commands/worktree';
import { registerPiCommand } from './commands/pi';
import { registerFederationCommand } from './commands/federation';
import { registerStateCommands } from './commands/state';
import { registerWorkflowCommand } from './commands/workflow';
import { registerAutonomicCommand } from './commands/autonomic';
import { registerClusterCommands } from './commands/cluster';
import { registerInteractiveCommands } from './enhanced';
import { showError } from './interactive';

// Get version from package.json
function getVersion(): string {
  try {
    const packagePath = resolve(__dirname, '../../package.json');
    const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
    return packageJson.version || '2.0.0';
  } catch {
    return '2.0.0';
  }
}

// Create the CLI program
const program = new Command();

program
  .name('godel')
  .description('Godel - Agent Orchestration Platform CLI')
  .version(getVersion(), '-V, --version', 'Output the version number')
  .usage('<command> [options]')
  .configureOutput({
    outputError: (str, write) => write(`❌ ${str}`),
  });

// Add global options
program.option(
  '--format <format>',
  'Output format (table|json|jsonl)',
  'table'
);

// Register all commands
registerTeamCommand(program);
registerAgentCommand(program);
registerTaskCommand(program);
registerTaskListCommand(program);
registerEventsCommand(program);
registerBusCommand(program);
registerMetricsCommand(program);
program.addCommand(statusCommand());
program.addCommand(configCommand());
registerHealthCommand(program);
registerDoCommand(program);
registerDashboardCommand(program);
registerWorktreeCommand(program);
registerPiCommand(program);
registerFederationCommand(program);
registerStateCommands(program);
registerWorkflowCommand(program);
registerAutonomicCommand(program);

// Add completion command
program
  .command('completion')
  .description('Generate shell completion script')
  .argument('<shell>', 'Shell type (bash|zsh)')
  .action((shell) => {
    if (shell === 'bash') {
      logger.info(generateBashCompletion());
    } else if (shell === 'zsh') {
      logger.info(generateZshCompletion());
    } else {
      logger.error(`❌ Unknown shell: ${shell}. Supported shells: bash, zsh`);
      process.exit(1);
    }
  });

// ============================================================================
// CLI Entry Point - Can be used as module or run directly
// ============================================================================

export type { RegisterCommandsOptions } from './lib/types';

// Export for use as module
export function registerCommands(program: Command): void {
  registerTeamCommand(program);
  registerAgentCommand(program);
  registerTaskCommand(program);
  registerTaskListCommand(program);
  registerEventsCommand(program);
  registerBusCommand(program);
  registerMetricsCommand(program);
  program.addCommand(statusCommand());
  program.addCommand(configCommand());
  registerHealthCommand(program);
  registerDoCommand(program);
  registerDashboardCommand(program);
  registerWorktreeCommand(program);
  registerPiCommand(program);
  registerFederationCommand(program);
  registerStateCommands(program);
  registerWorkflowCommand(program);
  registerAutonomicCommand(program);
registerClusterCommands(program);
}

// Run if executed directly
if (require.main === module) {
  // Show help if no command provided
  if (process.argv.length <= 2) {
    program.help();
  }
  
  // Handle errors gracefully
  process.on('unhandledRejection', (error) => {
    showError(error instanceof Error ? error : String(error), 'Unhandled Promise Rejection');
    process.exit(1);
  });
  
  process.on('uncaughtException', (error) => {
    showError(error, 'Uncaught Exception');
    process.exit(1);
  });
  
  // Parse arguments
  program.parse();
}

// ============================================================================
// Shell Completion Generators
// ============================================================================

function generateBashCompletion(): string {
  return `#!/bin/bash
# godel bash completion script
# Source this file: source <(godel completion bash)

_godel_completions() {
  local cur prev opts
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  
  # Top-level commands
  local commands="do team agent task events bus metrics status health config dashboard worktree pi completion"
  
  # Team subcommands
  local team_cmds="list create get scale destroy"
  
  # Agent subcommands
  local agent_cmds="list spawn get kill logs"
  
  # Task subcommands
  local task_cmds="list create get assign complete cancel"
  
  # Events subcommands
  local events_cmds="list stream get"
  
  # Bus subcommands
  local bus_cmds="publish subscribe topics status"
  
  # Metrics subcommands
  local metrics_cmds="show agents teams"
  
  # Config subcommands
  local config_cmds="show set"
  
  # Global options
  local global_opts="--help --version --format"
  local format_opts="table json jsonl"
  
  # First level - top commands
  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${commands}" -- \${cur}) )
    return 0
  fi
  
  # Second level - subcommands
  case "\${COMP_WORDS[1]}" in
    team)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "\${team_cmds}" -- \${cur}) )
        return 0
      fi
      # Team options
      if [[ \${prev} == "--format" ]]; then
        COMPREPLY=( $(compgen -W "\${format_opts}" -- \${cur}) )
        return 0
      fi
      ;;
    agent)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "\${agent_cmds}" -- \${cur}) )
        return 0
      fi
      # Agent options
      if [[ \${prev} == "--format" ]]; then
        COMPREPLY=( $(compgen -W "\${format_opts}" -- \${cur}) )
        return 0
      fi
      if [[ \${prev} == "--status" ]]; then
        COMPREPLY=( $(compgen -W "pending running paused completed failed killed" -- \${cur}) )
        return 0
      fi
      ;;
    task)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "\${task_cmds}" -- \${cur}) )
        return 0
      fi
      # Task options
      if [[ \${prev} == "--format" ]]; then
        COMPREPLY=( $(compgen -W "\${format_opts}" -- \${cur}) )
        return 0
      fi
      if [[ \${prev} == "--priority" ]]; then
        COMPREPLY=( $(compgen -W "low medium high critical" -- \${cur}) )
        return 0
      fi
      if [[ \${prev} == "--status" ]]; then
        COMPREPLY=( $(compgen -W "pending in_progress completed failed cancelled" -- \${cur}) )
        return 0
      fi
      ;;
    events)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "\${events_cmds}" -- \${cur}) )
        return 0
      fi
      # Events options
      if [[ \${prev} == "--format" ]]; then
        COMPREPLY=( $(compgen -W "\${format_opts}" -- \${cur}) )
        return 0
      fi
      if [[ \${prev} == "--severity" ]]; then
        COMPREPLY=( $(compgen -W "debug info warning error critical" -- \${cur}) )
        return 0
      fi
      ;;
    bus)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "\${bus_cmds}" -- \${cur}) )
        return 0
      fi
      # Bus options
      if [[ \${prev} == "--priority" ]]; then
        COMPREPLY=( $(compgen -W "low medium high critical" -- \${cur}) )
        return 0
      fi
      ;;
    metrics)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "\${metrics_cmds}" -- \${cur}) )
        return 0
      fi
      # Metrics options
      if [[ \${prev} == "--format" ]]; then
        COMPREPLY=( $(compgen -W "\${format_opts}" -- \${cur}) )
        return 0
      fi
      ;;
    config)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "\${config_cmds}" -- \${cur}) )
        return 0
      fi
      ;;
    completion)
      if [[ \${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "bash zsh" -- \${cur}) )
        return 0
      fi
      ;;
  esac
  
  # Default to global options
  COMPREPLY=( $(compgen -W "\${global_opts}" -- \${cur}) )
  return 0
}

complete -F _godel_completions godel
`;
}

function generateZshCompletion(): string {
  return `#compdef godel
# godel zsh completion script
# Install: godel completion zsh > /usr/local/share/zsh/site-functions/_godel

_godel() {
  local curcontext="$curcontext" state line
  typeset -A opt_args

  local -a commands
  commands=(
    'do:Execute intents using agent teams'
    'team:Manage agent teams'
    'agent:Manage AI agents'
    'task:Manage tasks'
    'events:Event streaming and management'
    'bus:Message bus operations'
    'metrics:System metrics and monitoring'
    'status:Overall system status'
    'health:Health check'
    'config:Configuration management'
    'completion:Generate shell completion script'
  )

  _arguments -C \\
    '(-h --help)'{-h,--help}'[Show help]' \\
    '(-V --version)'{-V,--version}'[Show version]' \\
    '--format[Output format]:format:(table json jsonl)' \\
    '1: :->command' \\
    '*:: :->args'

  case "$state" in
    command)
      _describe -t commands 'godel commands' commands
      ;;
    args)
      case "$line[1]" in
        team)
          local -a team_cmds
          team_cmds=(
            'list:List all teams'
            'create:Create a new team'
            'get:Get team details'
            'scale:Scale a team'
            'destroy:Destroy a team'
          )
          _describe -t commands 'team commands' team_cmds
          _arguments \\
            '--format[Output format]:format:(table json jsonl)' \\
            '--active[Show only active teams]' \\
            '--name[Team name]:name:' \\
            '--task[Task description]:task:' \\
            '--count[Initial agent count]:count:' \\
            '--max[Maximum agent count]:max:' \\
            '--strategy[Team strategy]:strategy:(parallel map-reduce pipeline tree)' \\
            '--model[Model to use]:model:' \\
            '--budget[Budget limit]:budget:' \\
            '--force[Force destroy without confirmation]' \\
            '--yes[Skip confirmation prompt]'
          ;;
        agent)
          local -a agent_cmds
          agent_cmds=(
            'list:List all agents'
            'spawn:Spawn a new agent'
            'get:Get agent details'
            'kill:Kill an agent'
            'logs:Get agent logs'
          )
          _describe -t commands 'agent commands' agent_cmds
          _arguments \\
            '--format[Output format]:format:(table json jsonl)' \\
            '--team[Filter by team ID]:team:' \\
            '--status[Filter by status]:status:(pending running paused completed failed killed)' \\
            '--model[Model to use]:model:' \\
            '--label[Agent label]:label:' \\
            '--parent[Parent agent ID]:parent:' \\
            '--retries[Max retry attempts]:retries:' \\
            '--budget[Budget limit]:budget:' \\
            '--follow[Follow log output]' \\
            '--lines[Number of lines]:lines:' \\
            '--force[Force kill without confirmation]' \\
            '--yes[Skip confirmation prompt]'
          ;;
        task)
          local -a task_cmds
          task_cmds=(
            'list:List all tasks'
            'create:Create a new task'
            'get:Get task details'
            'assign:Assign task to agent'
            'complete:Mark task as complete'
            'cancel:Cancel a task'
          )
          _describe -t commands 'task commands' task_cmds
          _arguments \\
            '--format[Output format]:format:(table json jsonl)' \\
            '--status[Filter by status]:status:(pending in_progress completed failed cancelled)' \\
            '--assignee[Filter by assignee]:assignee:' \\
            '--title[Task title]:title:' \\
            '--description[Task description]:description:' \\
            '--priority[Priority]:priority:(low medium high critical)' \\
            '--depends-on[Dependencies]:depends:' \\
            '--yes[Skip confirmation prompt]'
          ;;
        events)
          local -a events_cmds
          events_cmds=(
            'list:List historical events'
            'stream:Stream events in real-time'
            'get:Get event details'
          )
          _describe -t commands 'events commands' events_cmds
          _arguments \\
            '--format[Output format]:format:(table json jsonl)' \\
            '--agent[Filter by agent ID]:agent:' \\
            '--task[Filter by task ID]:task:' \\
            '--type[Filter by event type]:type:' \\
            '--since[Time window]:since:' \\
            '--until[End time]:until:' \\
            '--limit[Maximum events]:limit:' \\
            '--severity[Filter by severity]:severity:(debug info warning error critical)' \\
            '--follow[Keep listening]' \\
            '--raw[Output raw JSON]'
          ;;
        bus)
          local -a bus_cmds
          bus_cmds=(
            'publish:Publish a message'
            'subscribe:Subscribe to a topic'
            'topics:List active topics'
            'status:Show message bus status'
          )
          _describe -t commands 'bus commands' bus_cmds
          _arguments \\
            '--message[Message payload]:message:' \\
            '--priority[Message priority]:priority:(low medium high critical)' \\
            '--source[Message source]:source:' \\
            '--follow[Keep listening]' \\
            '--raw[Output raw JSON]'
          ;;
        metrics)
          local -a metrics_cmds
          metrics_cmds=(
            'show:Show system metrics'
            'agents:Show agent metrics'
            'teams:Show team metrics'
          )
          _describe -t commands 'metrics commands' metrics_cmds
          _arguments \\
            '--format[Output format]:format:(table json jsonl)'
          ;;
        config)
          local -a config_cmds
          config_cmds=(
            'show:Show current configuration'
            'set:Set configuration value'
          )
          _describe -t commands 'config commands' config_cmds
          _arguments \\
            '--format[Output format]:format:(table json jsonl)'
          ;;
        do)
          _arguments \\
            '--strategy[Execution strategy]:strategy:(parallel sequential careful)' \\
            '--agents[Number of agents]:count:' \\
            '--timeout[Timeout in minutes]:timeout:' \\
            '--dry-run[Show plan without executing]' \\
            '--yes[Skip confirmation prompts]'
          ;;
      completion)
          _arguments '1: :(bash zsh)'
          ;;
        status|health)
          _arguments '--format[Output format]:format:(table json jsonl)'
          ;;
      esac
      ;;
  esac
}

_godel "$@"
`;
}
