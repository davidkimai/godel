#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [[ -z "${ROOT_DIR}" ]]; then
  echo "[godel-guard] Not inside a git repository."
  exit 1
fi

HOOK_PATH="${ROOT_DIR}/.git/hooks/pre-commit"

cat > "${HOOK_PATH}" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

TOPLEVEL="$(git rev-parse --show-toplevel)"
HOME_DIR="${HOME%/}"

if [[ "${TOPLEVEL}" == "${HOME_DIR}" ]]; then
  echo "[godel-guard] Commit blocked: repository root is HOME (${HOME_DIR})."
  echo "[godel-guard] Use the canonical project path under clawd/projects/godel."
  exit 1
fi
EOF

chmod +x "${HOOK_PATH}"
echo "[godel-guard] Installed pre-commit hook at ${HOOK_PATH}"
