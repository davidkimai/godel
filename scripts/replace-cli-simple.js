const fs = require('fs');
const path = require('path');

const CLI_DIR = '/Users/jasontang/clawd/projects/godel/src/cli/commands';

// All CLI files
const files = fs.readdirSync(CLI_DIR).filter(f => f.endsWith('.ts'));

let totalReplaced = 0;
let totalFiles = 0;

for (const file of files) {
  const filePath = path.join(CLI_DIR, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  let count = 0;

  // Skip if already has logger import
  const hasLoggerImport = content.includes("import { logger } from '../../utils';");

  // Pattern 1: console.log('message') -> logger.info('cli', 'message')
  // But skip UI patterns (emojis, table borders, etc.)
  const simplePattern = /console\.log\('([^'\n]+)'\);/g;
  content = content.replace(simplePattern, (match, msg) => {
    // Skip UI output patterns
    if (/[═─╔╚║┌┐└┘├┤┬┴┼✅✓✗⚠️💡🔌📊🚀📜📭🤖☠️🚫☠️]/.test(msg) || 
        msg.startsWith('  ') || 
        /^[A-Z][A-Z\s]+:/.test(msg) ||
        msg.includes('No agents') ||
        msg.includes('Use "godel') ||
        msg.includes('Created') ||
        msg.includes('Spawned') ||
        msg.includes('Killed') ||
        msg.includes('Paused') ||
        msg.includes('Resumed') ||
        msg.includes('Retrying') ||
        msg.includes('Installing') ||
        msg.includes('Installed') ||
        msg.includes('Uninstalled') ||
        msg.includes('Updated') ||
        msg.includes('Budget') ||
        msg.includes('Usage') ||
        msg.includes('Report') ||
        msg.includes('Status') ||
        msg.includes('Godelboard') ||
        msg.includes('Skills') ||
        msg.includes('Events') ||
        msg.includes('Quality') ||
        msg.includes('Tests') ||
        msg.includes('Safety') ||
        msg.includes('Approvals') ||
        msg.includes('ClawHub') ||
        msg.includes('Swarm') ||
        msg.includes('Task') ||
        msg.includes('Event') ||
        msg.includes('Agent') ||
        msg.includes('Connecting') ||
        msg.includes('Connected') ||
        msg.includes('Disconnected') ||
        msg.includes('Error:')) {
      return match;
    }
    count++;
    return `logger.info('${file.replace('.ts', '')}', '${msg.replace(/'/g, "\\'")}');`;
  });

  // Pattern 2: console.log(`message`) -> logger.info('cli', `message`)
  const templatePattern = /console\.log\(`([^`]+)`\);/g;
  content = content.replace(templatePattern, (match, msg) => {
    // Skip UI output patterns
    if (/[═─╔╚║┌┐└┘├┤┬┴┼✅✓✗⚠️💡🔌📊🚀📜📭🤖☠️🚫☠️]/.test(msg) || 
        msg.startsWith('  ') || 
        /^[A-Z][A-Z\s]+:/.test(msg) ||
        msg.includes('${') ||  // Skip templates with variables for safety
        msg.includes('No agents') ||
        msg.includes('Use "godel')) {
      return match;
    }
    count++;
    return `logger.info('${file.replace('.ts', '')}', \`${msg}\`);`;
  });

  // Pattern 3: console.error('message') -> logger.error('cli', 'message')
  const errorPattern = /console\.error\('([^'\n]+)'\);/g;
  content = content.replace(errorPattern, (match, msg) => {
    count++;
    return `logger.error('${file.replace('.ts', '')}', '${msg.replace(/'/g, "\\'")}');`;
  });

  // Pattern 4: console.error(`message`) -> logger.error('cli', `message`)
  const errorTemplatePattern = /console\.error\(`([^`]+)`\);/g;
  content = content.replace(errorTemplatePattern, (match, msg) => {
    if (msg.includes('${')) return match;  // Skip templates with variables
    count++;
    return `logger.error('${file.replace('.ts', '')}', \`${msg}\`);`;
  });

  // Add logger import if needed
  if (count > 0 && !hasLoggerImport) {
    // Find a good place to add import
    const importMatch = content.match(/import .* from ['"][^'"]+['"];/);
    if (importMatch) {
      const lastImport = importMatch[importMatch.length - 1];
      content = content.replace(
        lastImport,
        `${lastImport}\nimport { logger } from '../../utils';`
      );
    }
  }

  if (count > 0) {
    fs.writeFileSync(filePath, content, 'utf-8');
    totalReplaced += count;
    totalFiles++;
    console.log(`✓ ${file}: ${count} replacements`);
  }
}

console.log(`\n═══════════════════════════════════════`);
console.log(`Total files modified: ${totalFiles}`);
console.log(`Total replacements: ${totalReplaced}`);
console.log(`═══════════════════════════════════════`);
