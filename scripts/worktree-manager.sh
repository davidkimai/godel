#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
WORKTREE_BASE="${GODEL_WORKTREE_BASE:-/Users/jasontang/clawd/worktrees/godel}"

mkdir -p "${WORKTREE_BASE}"

usage() {
  cat <<'EOF'
Usage:
  scripts/worktree-manager.sh list
  scripts/worktree-manager.sh prune
  scripts/worktree-manager.sh add <name> [start-point]
  scripts/worktree-manager.sh remove <name>

Examples:
  scripts/worktree-manager.sh add feature-auth main
  scripts/worktree-manager.sh add fix-rate-limit origin/main
  scripts/worktree-manager.sh remove feature-auth

Environment:
  GODEL_WORKTREE_BASE (default: /Users/jasontang/clawd/worktrees/godel)
EOF
}

cmd="${1:-}"

if [[ -z "${cmd}" ]]; then
  usage
  exit 1
fi

case "${cmd}" in
  list)
    git -C "${ROOT_DIR}" worktree list
    ;;
  prune)
    git -C "${ROOT_DIR}" worktree prune --verbose
    ;;
  add)
    name="${2:-}"
    start_point="${3:-main}"

    if [[ -z "${name}" ]]; then
      echo "[worktree-manager] Missing name"
      usage
      exit 1
    fi

    path="${WORKTREE_BASE}/${name}"
    if [[ -e "${path}" ]]; then
      echo "[worktree-manager] Path already exists: ${path}"
      exit 1
    fi

    if git -C "${ROOT_DIR}" show-ref --verify --quiet "refs/heads/${name}"; then
      git -C "${ROOT_DIR}" worktree add "${path}" "${name}"
    else
      git -C "${ROOT_DIR}" worktree add -b "${name}" "${path}" "${start_point}"
    fi

    echo "[worktree-manager] Added ${name} at ${path}"
    ;;
  remove)
    name="${2:-}"

    if [[ -z "${name}" ]]; then
      echo "[worktree-manager] Missing name"
      usage
      exit 1
    fi

    path="${WORKTREE_BASE}/${name}"
    git -C "${ROOT_DIR}" worktree remove "${path}"
    echo "[worktree-manager] Removed ${path}"
    ;;
  *)
    usage
    exit 1
    ;;
esac
