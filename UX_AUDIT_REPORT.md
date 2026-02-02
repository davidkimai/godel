# Dash CLI UX Audit Report

## Executive Summary

The Dash CLI demonstrates solid foundational architecture using Commander.js but has several UX inconsistencies and gaps compared to industry-standard CLI tools like `kubectl`, `docker`, `terraform`, and `vercel`. This audit identifies 31 specific issues across 6 categories with actionable recommendations.

---

## 1. Command Naming Consistency

### Current State Analysis

| Aspect | Status | Notes |
|--------|--------|-------|
| Noun-verb consistency | ⚠️ **Inconsistent** | Mix of plural nouns (`agents`, `tasks`) and verbs (`approve`) |
| Action naming | ❌ **Inconsistent** | `kill` vs `terminate`, `list` vs `ls` missing |
| Resource naming | ⚠️ **Partial** | Some resources use plural consistently |
| Aliases | ❌ **Missing** | No short aliases for common commands |

### Issues Found

#### Issue 1.1: Mixed Command Naming Patterns
**Problem:** Commands mix plural nouns (`agents`, `tasks`, `events`) with a verb-based command (`approve`).

**Example:**
```
dash agents list    # noun + verb pattern
dash approve list   # verb + verb pattern (inconsistent)
dash budget set     # noun + verb pattern
```

**Comparison:**
- `kubectl` uses: `kubectl get pods` (verb + resource)
- `docker` uses: `docker container list` (noun + verb) OR `docker ps` (alias)
- `terraform` uses: `terraform plan` (verb-focused)

**Recommendation:** Standardize on ONE pattern:
```
# Option A: Noun-first (like docker)
dash agent list     # singular noun
dash task create
dash approval list  # rename approve → approval

# Option B: Verb-first (like kubectl)
dash get agents     # kubectl style
dash create task
dash approve request
```

#### Issue 1.2: Destructive Command Naming
**Problem:** `dash agents kill` is abrupt and lacks confirmation safeguards.

**Comparison:**
- `kubectl delete pod <name>` - clear action
- `docker container rm <name>` - explicit remove
- `terraform destroy` - explicitly scary name

**Recommendation:** 
- Rename `kill` → `stop` or `terminate`
- Add confirmation prompt by default
- Add `--force` or `--yes` flag to skip confirmation

#### Issue 1.3: Missing Command Aliases
**Problem:** No short aliases for common operations.

**Comparison:**
- `docker ps` → `docker container list`
- `kubectl get` → `kubectl get` (short common verbs)
- `vercel` → `vercel deploy` (default command)

**Recommendation:** Add aliases:
```bash
dash agents list → dash agents ls
dash agents spawn → dash agents create  # alias
dash budget status → dash budget st     # alias
```

#### Issue 1.4: Subcommand Depth Inconsistency
**Problem:** Some commands are flat, others deeply nested without clear rationale.

**Current:**
```bash
dash budget alert add --project x       # 3 levels deep
dash approve all --agent x              # 2 levels deep  
dash agents spawn "task"                # 2 levels deep
```

**Recommendation:** Flatten where possible or establish clear nesting rules:
```bash
# Option: Alert as direct subcommand of budget
dash budget alert-add --project x
dash budget alert-list

# OR: Separate top-level alerts command
dash alerts add --budget x
```

---

## 2. Help Text Clarity

### Current State Analysis

| Aspect | Status | Notes |
|--------|--------|-------|
| Description length | ⚠️ **Variable** | Some too brief, others adequate |
| Examples in help | ❌ **Missing** | No examples in `--help` output |
| Long descriptions | ❌ **Missing** | No detailed help available |
| Option descriptions | ⚠️ **Adequate** | Basic but could be more helpful |

### Issues Found

#### Issue 2.1: Missing Examples in Help Output
**Problem:** `--help` shows no usage examples.

**Current:**
```
$ dash agents spawn --help
Usage: dash agents spawn [options] <task>

Spawn a new agent

Options:
  -m, --model <model>      Model to use
  -p, --priority <priority> Task priority
  -h, --help              display help for command
```

**Comparison - Docker:**
```
$ docker run --help
Usage:  docker run [OPTIONS] IMAGE [COMMAND] [ARG...]

Run a command in a new container

Examples:
  $ docker run -it ubuntu bash    # Start interactive shell
  $ docker run -d nginx           # Run in background
```

**Recommendation:** Add examples to all command help:
```typescript
.command('spawn')
.description('Spawn a new agent')
.addHelpText('after', `
Examples:
  $ dash agents spawn "Fix login bug"
  $ dash agents spawn "Refactor API" --model gpt-4 --priority high
`)
```

#### Issue 2.2: Vague Option Descriptions
**Problem:** Many option descriptions are too brief.

**Current:**
```
  -m, --model <model>      Model to use           # What models? Format?
  -p, --priority <priority> Task priority         # What values? high/low?
```

**Comparison - Vercel CLI:**
```
  --version              Show version number
  -t, --token <token>    Login token for authentication
  -S, --scope <scope>    Team scope for the operation
```

**Recommendation:** Include valid values and formats:
```
  -m, --model <model>      Model to use (e.g., gpt-4, gpt-3.5-turbo)
  -p, --priority <level>   Task priority: low, medium (default), high
```

#### Issue 2.3: Missing Long-Form Help
**Problem:** No way to get detailed help beyond basic descriptions.

**Comparison:**
- `kubectl explain pod` - detailed resource documentation
- `terraform plan -help` - extensive option documentation

**Recommendation:** Add `help` subcommand or `--help-full` flag:
```bash
$ dash help agents spawn    # Detailed help with examples
$ dash agents spawn --docs  # Link to online docs
```

#### Issue 2.4: Command Grouping in Help
**Problem:** Commands listed alphabetically without logical grouping.

**Current:**
```
Commands:
  agents          Manage AI agents
  approve         Manage human-in-loop approval workflows
  budget          Manage budget limits and cost tracking
  context         Context management
  events          Event streaming and replay
```

**Comparison - Terraform:**
```
Main commands:
  init       Prepare your working directory
  plan       Show changes required
  apply      Create or update infrastructure

All other commands:
  console    Try Terraform expressions
  fmt        Reformat your configuration
```

**Recommendation:** Group commands logically:
```
Core Commands:
  agents       Manage AI agents
  tasks        Manage tasks
  events       Event streaming

Operations:
  approve      Approval workflows
  budget       Budget management
  safety       Safety checks

Development:
  quality      Code quality checks
  tests        Test management
  context      Context management
```

---

## 3. Error Message Quality

### Current State Analysis

| Aspect | Status | Notes |
|--------|--------|-------|
| Error specificity | ⚠️ **Basic** | Some specific, others generic |
| Actionable guidance | ❌ **Poor** | No "did you mean?" suggestions |
| Exit codes | ⚠️ **Present** | Exit code 1 for errors |
| Error formatting | ❌ **Plain** | No color or formatting |

### Issues Found

#### Issue 3.1: Generic Error Messages
**Problem:** Errors are often too generic.

**Current:**
```
$ dash agents spawn
error: missing required argument 'task'
```

**Comparison - Git:**
```
$ git checkout nonexistent
error: pathspec 'nonexistent' did not match any file(s) known to git
```

**Recommendation:** Add context and suggestions:
```
Error: Missing required argument 'task'

Usage: dash agents spawn [options] <task>

The task description tells the agent what to do.

Example: dash agents spawn "Fix the login bug in auth.ts"

Run 'dash agents spawn --help' for more information.
```

#### Issue 3.2: No "Did You Mean?" Suggestions
**Problem:** Typos don't get helpful suggestions.

**Current:**
```
$ dash agent list
error: unknown command 'agent'
```

**Comparison - Git:**
```
$ git chekcout main
git: 'chekcout' is not a git command. See 'git --help'.

The most similar command is:
	checkout
```

**Recommendation:** Implement fuzzy matching:
```
$ dash agent list
Error: Unknown command 'agent'

Did you mean?
  dash agents list

Run 'dash --help' to see all commands.
```

#### Issue 3.3: Poor Validation Error Messages
**Problem:** Validation errors don't explain what's wrong.

**Current (in code):**
```typescript
if (!options.task && !options.daily) {
  console.error('Error: Must specify either --task or --daily');
  process.exit(1);
}
```

**Recommendation:** Explain WHY and provide examples:
```
Error: Budget type not specified

You must specify what type of budget to set:
  --task <tokens>     Per-task token limit
  --daily <tokens>    Daily token limit

Examples:
  dash budget set --task 100000 --cost 5.00
  dash budget set --daily 500000 --cost 25.00 --project myapp

Run 'dash budget set --help' for more information.
```

#### Issue 3.4: Missing Error Context
**Problem:** Errors don't show what was being attempted.

**Current (in code):**
```typescript
console.error(`Approval request not found: ${id}`);
process.exit(1);
```

**Recommendation:** Include context and next steps:
```
Error: Approval request 'abc-123' not found

Possible reasons:
  • The request ID may be incorrect
  • The request may have already been processed
  • The request may have expired

To list pending requests:
  dash approve list

To search all requests:
  dash approve audit --since 1h
```

#### Issue 3.5: Silent Failures
**Problem:** Some operations fail silently or with minimal output.

**Current:**
```typescript
if (requests.length === 0) {
  console.log('No matching pending requests found.');
  return;
}
```

**Recommendation:** Always indicate state clearly:
```
No pending approval requests found matching your criteria.

Filters applied:
  Status: pending
  Agent: agent-123

To see all requests:
  dash approve list --status all
```

---

## 4. Output Formatting

### Current State Analysis

| Aspect | Status | Notes |
|--------|--------|-------|
| Output formats | ✅ **Good** | JSON and table formats supported |
| Consistent formatting | ⚠️ **Inconsistent** | Some use tables, others plain text |
| Color/styling | ❌ **Missing** | No color output |
| Progress indicators | ❌ **Missing** | No spinners or progress bars |
| Quiet mode | ❌ **Missing** | No `-q` or `--quiet` flag |

### Issues Found

#### Issue 4.1: Inconsistent Table Formats
**Problem:** Different commands use different table/heading styles.

**approve stats (box-drawing):**
```
APPROVAL STATISTICS
════════════════════════════════════════
Total Requests:  42
```

**budget report (box with corners):**
```
╔════════════════════════════════════════════════════════════════════╗
║                    BUDGET REPORT                                   ║
╠════════════════════════════════════════════════════════════════════╣
```

**budget status (simple lines):**
```
BUDGET STATUS: Project myapp
════════════════════════════════════════════════════════════
```

**Recommendation:** Standardize on ONE format:
```
┌────────────────────────────────────────┐
│ APPROVAL STATISTICS                    │
├────────────────────────────────────────┤
│ Total Requests:  42                    │
│   Pending:        5                    │
│   Approved:      35                    │
│   Denied:         2                    │
└────────────────────────────────────────┘
```

#### Issue 4.2: No Color Output
**Problem:** All output is monochrome.

**Comparison - `ls --color=auto`:**
- Directories in blue
- Executables in green
- Warnings in yellow
- Errors in red

**Recommendation:** Add color-coded output:
```typescript
// Status indicators
console.log('✅ '.green + 'Agent created successfully');
console.log('⚠️  '.yellow + 'Budget at 85% threshold');
console.log('❌ '.red + 'Approval denied');

// In tables
// Critical risk: red, High: yellow, Medium: white, Low: green
```

**With `NO_COLOR` support (respect https://no-color.org/):**
```typescript
const useColor = !process.env.NO_COLOR;
```

#### Issue 4.3: No Progress Indicators
**Problem:** Long operations show no progress.

**Current:**
```
$ dash budget report --project myapp
(waiting... no feedback)
```

**Comparison - Docker:**
```
$ docker build .
[+] Building 15.4s (8/12)
 => [internal] load build definition from Dockerfile    0.1s
 => [internal] load .dockerignore                      0.0s
```

**Recommendation:** Add spinners for async operations:
```
$ dash budget report --project myapp
⠋ Generating report... (this may take a moment)
```

#### Issue 4.4: Missing Quiet Mode
**Problem:** No way to suppress non-essential output.

**Comparison:**
- `docker ps -q` - quiet, IDs only
- `terraform plan -no-color` - suppress color

**Recommendation:** Add global flags:
```bash
dash agents list --quiet        # IDs only, one per line
dash agents list -q             # short form
dash budget status --no-color   # respect NO_COLOR
dash --quiet agents list        # global quiet flag
```

#### Issue 4.5: JSON Output Inconsistencies
**Problem:** JSON output format varies.

**Current (approve stats):**
```typescript
console.log(JSON.stringify(stats, null, 2));
```

**Current (budget report):**
```typescript
console.log(JSON.stringify({ report, costHistory }, null, 2));
```

**Recommendation:** Standardize JSON structure:
```json
{
  "meta": {
    "command": "budget report",
    "generated_at": "2026-02-02T07:34:00Z",
    "version": "1.0.0"
  },
  "data": { ... },
  "summary": { ... }
}
```

---

## 5. Missing Features (Compared to Similar Tools)

### Comparison Matrix

| Feature | kubectl | docker | terraform | vercel | dash |
|---------|---------|--------|-----------|--------|------|
| Auto-completion | ✅ | ✅ | ✅ | ✅ | ❌ |
| Config file support | ✅ | ✅ | ✅ | ✅ | ❌ |
| Context switching | ✅ | ✅ | ✅ | ✅ | ❌ |
| Watch mode | ✅ | ✅ | ❌ | ❌ | ⚠️ |
| Labeling system | ✅ | ✅ | ❌ | ❌ | ❌ |
| Dry-run support | ✅ | ❌ | ✅ | ❌ | ⚠️ |
| Plugin system | ❌ | ✅ | ❌ | ❌ | ❌ |
| Shell integration | ✅ | ✅ | ✅ | ❌ | ❌ |
| Update notifier | ❌ | ❌ | ❌ | ✅ | ❌ |
| Interactive mode | ❌ | ❌ | ❌ | ✅ | ❌ |

### Issues Found

#### Issue 5.1: No Shell Auto-completion
**Problem:** No tab completion for commands, options, or IDs.

**Comparison:**
- `kubectl completion bash` - generates completion scripts
- `docker completion zsh` - built-in completion

**Recommendation:** Add completion command:
```bash
$ dash completion bash > /etc/bash_completion.d/dash
$ dash completion zsh > /usr/local/share/zsh/site-functions/_dash
$ dash completion fish > ~/.config/fish/completions/dash.fish
```

#### Issue 5.2: No Configuration File Support
**Problem:** All configuration must be passed via flags.

**Comparison:**
- `~/.kube/config` - kubectl contexts
- `~/.docker/config.json` - Docker settings
- `~/.terraformrc` - Terraform config

**Recommendation:** Add config file support:
```yaml
# ~/.dash/config.yaml
defaults:
  model: gpt-4
  priority: medium
  format: table

projects:
  myapp:
    budget:
      daily_tokens: 100000
      max_cost: 10.00
    safety:
      require_approval_for: [file_delete, api_call]

aliases:
  ls: agents list
  start: agents spawn
```

#### Issue 5.3: No Context/Project Switching
**Problem:** Must specify `--project` on every command.

**Comparison:**
- `kubectl config use-context prod` - switch contexts
- `docker context use production` - switch Docker context

**Recommendation:** Add context management:
```bash
$ dash context create prod --project myapp-prod
$ dash context create dev --project myapp-dev
$ dash context use prod
$ dash context list
  dev
* prod (active)
$ dash agents list  # uses prod context automatically
```

#### Issue 5.4: Limited Watch Mode
**Problem:** No way to continuously monitor resources.

**Comparison:**
- `kubectl get pods --watch` - watch for changes
- `docker events` - stream events

**Recommendation:** Add watch flag:
```bash
$ dash agents list --watch    # Update every 2 seconds
$ dash budget status --watch  # Monitor budget usage
$ dash events stream          # Already exists, good!
```

#### Issue 5.5: No Labeling System
**Problem:** Can't tag or categorize resources.

**Comparison:**
- `kubectl label pod mypod env=prod` - label resources
- `docker run --label env=prod` - container labels

**Recommendation:** Add labels:
```bash
$ dash agents spawn "Task" --label env=prod --label team=backend
$ dash agents list --label env=prod
$ dash tasks list --label priority=critical
```

#### Issue 5.6: No Update Notifier
**Problem:** Users don't know when updates are available.

**Comparison:** Vercel CLI shows update messages.

**Recommendation:** Add update check:
```
╭──────────────────────────────────────────────────╮
│  Update available: 1.0.0 → 1.1.0                 │
│  Run: npm install -g dash-agent                  │
╰──────────────────────────────────────────────────╯
```

#### Issue 5.7: No Plugin/Extension System
**Problem:** Can't extend functionality without modifying core.

**Comparison:** Docker supports plugins.

**Recommendation:** Consider plugin architecture:
```bash
$ dash plugin install dash-github
$ dash plugin list
$ dash github create-issue "Bug report"
```

---

## 6. Documentation Completeness

### Current State Analysis

| Document | Status | Notes |
|----------|--------|-------|
| README.md | ⚠️ **Basic** | Good overview, lacks depth |
| CONTRIBUTING.md | ✅ **Present** | Good contribution guide |
| API docs | ❌ **Missing** | No generated API docs |
| CLI reference | ❌ **Missing** | No comprehensive command ref |
| Man pages | ❌ **Missing** | No man page support |
| Examples | ❌ **Missing** | No example workflows |
| Tutorials | ❌ **Missing** | No step-by-step guides |

### Issues Found

#### Issue 6.1: Missing CLI Reference Documentation
**Problem:** README has basic table but no comprehensive reference.

**Comparison:**
- https://kubernetes.io/docs/reference/kubectl/ - exhaustive reference
- https://vercel.com/docs/cli - comprehensive CLI docs

**Recommendation:** Generate CLI docs from code:
```bash
$ dash docs generate --format markdown
# Creates comprehensive reference from command definitions
```

#### Issue 6.2: No Example Workflows
**Problem:** No end-to-end examples.

**Recommendation:** Add `examples/` directory:
```bash
# examples/basic-workflow.md
$ dash agents spawn "Fix login bug" --priority high
$ dash tasks create "Write tests" --priority medium
$ dash tasks assign task-1 agent-1
$ dash quality lint
$ dash tests run
$ dash agents kill agent-1
```

#### Issue 6.3: No Man Page Support
**Problem:** No Unix man pages.

**Comparison:**
- `man kubectl` - comprehensive man page
- `man docker` - detailed documentation

**Recommendation:** Generate man pages:
```bash
$ dash docs generate --format man
$ man dash
$ man dash-agents-spawn
```

#### Issue 6.4: README Missing Advanced Topics
**Problem:** README covers basics but not advanced usage.

**Missing topics:**
- Approval workflow configuration
- Budget alerting setup
- Custom safety boundaries
- Event replay workflows
- Reasoning trace analysis

**Recommendation:** Expand README or add `docs/`:
```
docs/
├── getting-started.md
├── configuration.md
├── approval-workflows.md
├── budget-management.md
├── safety-boundaries.md
├── event-system.md
└── troubleshooting.md
```

---

## Prioritized Recommendations

### 🔴 Critical (Fix Immediately)

1. **Standardize command naming** - Choose noun-first or verb-first pattern
2. **Add examples to help text** - Every command needs usage examples
3. **Implement "did you mean?"** - Fuzzy matching for typos
4. **Add shell completions** - Essential for usability

### 🟠 High Priority (Fix Soon)

5. **Improve error messages** - Add context and actionable guidance
6. **Add config file support** - `~/.dash/config.yaml`
7. **Standardize output formats** - Consistent tables and styling
8. **Add color output** - With `NO_COLOR` support
9. **Implement context switching** - Like kubectl contexts
10. **Add watch mode** - For monitoring commands

### 🟡 Medium Priority (Nice to Have)

11. **Add quiet mode** - `-q` / `--quiet` flag
12. **Add labeling system** - Tag resources
13. **Add update notifier** - Prompt users to update
14. **Expand documentation** - Examples and tutorials
15. **Add man pages** - Unix documentation standard

### 🟢 Low Priority (Future Considerations)

16. **Plugin system** - Extensibility architecture
17. **Interactive mode** - REPL-style interface
18. **Progress indicators** - Spinners for long operations

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Standardize command naming convention
- [ ] Add examples to all help text
- [ ] Implement fuzzy matching for errors
- [ ] Add shell completion generation

### Phase 2: UX Polish (Week 2)
- [ ] Improve all error messages
- [ ] Add config file support
- [ ] Standardize output formatting
- [ ] Add color output support

### Phase 3: Power User Features (Week 3)
- [ ] Implement context switching
- [ ] Add watch mode to list commands
- [ ] Add labeling system
- [ ] Add quiet mode

### Phase 4: Documentation (Week 4)
- [ ] Expand README with advanced topics
- [ ] Create example workflows
- [ ] Add man page generation
- [ ] Write troubleshooting guide

---

## Appendix: Quick Win Code Examples

### Adding Examples to Commands
```typescript
.command('spawn')
.description('Spawn a new agent')
.addHelpText('after', `
Examples:
  $ dash agents spawn "Fix login bug"
  $ dash agents spawn "Refactor API" --model gpt-4 --priority high
  $ dash agents spawn "Write tests" --label team=backend
`)
```

### Adding Shell Completion
```typescript
// Add to CLI index.ts
program
  .command('completion')
  .description('Generate shell completion script')
  .argument('<shell>', 'Shell type (bash|zsh|fish)')
  .action((shell) => {
    const script = generateCompletion(shell);
    console.log(script);
  });
```

### Improving Error Messages
```typescript
// Before
console.error(`Approval request not found: ${id}`);
process.exit(1);

// After
console.error(chalk.red(`Error: Approval request '${id}' not found`));
console.error('\nPossible reasons:');
console.error('  • The request ID may be incorrect');
console.error('  • The request may have already been processed');
console.error('\nTo list pending requests:');
console.error(chalk.cyan('  dash approve list'));
process.exit(1);
```

### Adding Color Support
```typescript
import chalk from 'chalk';

const useColor = !process.env.NO_COLOR;

function success(msg: string) {
  console.log(useColor ? chalk.green('✅ ' + msg) : '✅ ' + msg);
}

function error(msg: string) {
  console.error(useColor ? chalk.red('❌ ' + msg) : '❌ ' + msg);
}
```

---

*Report generated: 2026-02-02*
*Based on Dash CLI version 1.0.0*
