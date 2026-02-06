const fs = require('fs');
const path = require('path');

const CLI_DIR = '/Users/jasontang/clawd/projects/godel/src/cli/commands';

// Files to process
const files = [
  'budget.ts',
  'skills.ts',
  'clawhub.ts',
  'openclaw.ts',
  'approve.ts',
  'agents.ts',
  'quality.ts',
  'swarm.ts',
  'init.ts',
  'godelboard.ts',
  'events.ts',
  'context.ts',
  'tests.ts',
  'safety.ts',
  'tasks.ts',
  'status.ts',
  'reasoning.ts',
  'self-improve.ts'
];

// UI output patterns (keep as console.log)
const uiPatterns = [
  /console\.log\(['"`][═─╔╚║┌┐└┘├┤┬┴┼]/,  // Box drawing characters
  /console\.log\(['"`].*✅|✓|✗|⚠️|💡|🔌|📊|🚀|📜|📭/,  // Emoji output
  /console\.log\(['"`]\s+/,  // Indented output (tables)
  /console\.log\(['"`][A-Z][A-Z\s]+:/,  // Headers like "BUDGET STATUS:"
  /console\.log\(JSON\.stringify/,  // JSON output
];

// Log patterns (replace with logger)
const logPatterns = [
  {
    pattern: /console\.log\('\[([^\]]+)\]\s*(.+)'\);/g,
    replace: "logger.info('$1', '$2');"
  },
  {
    pattern: /console\.log\(\`\[([^\]]+)\]\s*(.+)\`\);/g,
    replace: "logger.info('$1', '$2');"
  },
  {
    pattern: /console\.log\('(.+)'\);/g,
    replace: (match, p1) => {
      // Skip UI patterns
      if (/[═─╔╚║✅✓✗⚠️💡🔌📊🚀📜📭]/.test(p1) || p1.startsWith('  ') || /[A-Z][A-Z\s]+:/.test(p1)) {
        return match;
      }
      return `logger.info('cli', '${p1.replace(/'/g, "\\'")}');`;
    }
  }
];

let totalReplaced = 0;

for (const file of files) {
  const filePath = path.join(CLI_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${file} (not found)`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  let count = 0;

  // Check if logger is already imported
  const hasLoggerImport = /import.*logger.*from.*utils/.test(content);

  // Replace patterns
  for (const { pattern, replace } of logPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      count += matches.length;
      content = content.replace(pattern, replace);
    }
  }

  // Add logger import if needed
  if (count > 0 && !hasLoggerImport) {
    // Find the utils import or add a new one
    if (content.includes("import { logger } from '../../utils';")) {
      // Already imported
    } else if (content.includes("from '../../utils';")) {
      // Add logger to existing import
      content = content.replace(
        /from '\.\.\/..\/utils';/g,
        "from '../../utils';\n// Added logger import"
      );
    } else {
      // Add new import after first import
      content = content.replace(
        /(import .* from .*;\n)/,
        "$1import { logger } from '../../utils';\n"
      );
    }
  }

  if (count > 0) {
    fs.writeFileSync(filePath, content, 'utf-8');
    totalReplaced += count;
    console.log(`✓ ${file}: ${count} replacements`);
  }
}

console.log(`\nTotal replacements: ${totalReplaced}`);
