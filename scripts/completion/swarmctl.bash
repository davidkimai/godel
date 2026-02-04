#!/bin/bash
# swarmctl bash completion script
# Source this file: source <(swarmctl completion bash)
# Or install to: /etc/bash_completion.d/swarmctl

_swarmctl_completions() {
  local cur prev opts
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"
  
  # Top-level commands
  local commands="swarm agent task events bus metrics status health config completion"
  
  # Swarm subcommands
  local swarm_cmds="list create get scale destroy"
  
  # Agent subcommands
  local agent_cmds="list spawn get kill logs"
  
  # Task subcommands
  local task_cmds="list create get assign complete cancel"
  
  # Events subcommands
  local events_cmds="list stream get"
  
  # Bus subcommands
  local bus_cmds="publish subscribe topics status"
  
  # Metrics subcommands
  local metrics_cmds="show agents swarms"
  
  # Config subcommands
  local config_cmds="show set"
  
  # Global options
  local global_opts="--help --version --format"
  local format_opts="table json jsonl"
  
  # First level - top commands
  if [[ ${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "${commands}" -- ${cur}) )
    return 0
  fi
  
  # Second level - subcommands
  case "${COMP_WORDS[1]}" in
    swarm)
      if [[ ${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${swarm_cmds}" -- ${cur}) )
        return 0
      fi
      # Swarm options
      if [[ ${prev} == "--format" ]]; then
        COMPREPLY=( $(compgen -W "${format_opts}" -- ${cur}) )
        return 0
      fi
      if [[ ${prev} == "--strategy" ]]; then
        COMPREPLY=( $(compgen -W "parallel map-reduce pipeline tree" -- ${cur}) )
        return 0
      fi
      ;;
    agent)
      if [[ ${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${agent_cmds}" -- ${cur}) )
        return 0
      fi
      # Agent options
      if [[ ${prev} == "--format" ]]; then
        COMPREPLY=( $(compgen -W "${format_opts}" -- ${cur}) )
        return 0
      fi
      if [[ ${prev} == "--status" ]]; then
        COMPREPLY=( $(compgen -W "pending running paused completed failed killed" -- ${cur}) )
        return 0
      fi
      if [[ ${prev} == "--model" ]]; then
        COMPREPLY=( $(compgen -W "kimi-k2.5 gpt-4o claude-sonnet" -- ${cur}) )
        return 0
      fi
      ;;
    task)
      if [[ ${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${task_cmds}" -- ${cur}) )
        return 0
      fi
      # Task options
      if [[ ${prev} == "--format" ]]; then
        COMPREPLY=( $(compgen -W "${format_opts}" -- ${cur}) )
        return 0
      fi
      if [[ ${prev} == "--priority" ]]; then
        COMPREPLY=( $(compgen -W "low medium high critical" -- ${cur}) )
        return 0
      fi
      if [[ ${prev} == "--status" ]]; then
        COMPREPLY=( $(compgen -W "pending in_progress completed failed cancelled" -- ${cur}) )
        return 0
      fi
      ;;
    events)
      if [[ ${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${events_cmds}" -- ${cur}) )
        return 0
      fi
      # Events options
      if [[ ${prev} == "--format" ]]; then
        COMPREPLY=( $(compgen -W "${format_opts}" -- ${cur}) )
        return 0
      fi
      if [[ ${prev} == "--severity" ]]; then
        COMPREPLY=( $(compgen -W "debug info warning error critical" -- ${cur}) )
        return 0
      fi
      ;;
    bus)
      if [[ ${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${bus_cmds}" -- ${cur}) )
        return 0
      fi
      # Bus options
      if [[ ${prev} == "--priority" ]]; then
        COMPREPLY=( $(compgen -W "low medium high critical" -- ${cur}) )
        return 0
      fi
      ;;
    metrics)
      if [[ ${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${metrics_cmds}" -- ${cur}) )
        return 0
      fi
      # Metrics options
      if [[ ${prev} == "--format" ]]; then
        COMPREPLY=( $(compgen -W "${format_opts}" -- ${cur}) )
        return 0
      fi
      ;;
    config)
      if [[ ${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${config_cmds}" -- ${cur}) )
        return 0
      fi
      ;;
    completion)
      if [[ ${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "bash zsh" -- ${cur}) )
        return 0
      fi
      ;;
  esac
  
  # Default to global options
  COMPREPLY=( $(compgen -W "${global_opts}" -- ${cur}) )
  return 0
}

complete -F _swarmctl_completions swarmctl
