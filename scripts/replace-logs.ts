#!/usr/bin/env node
/**
 * Script to replace console.log with structured logger calls
 * 
 * Usage: node replace-logs.ts [file-pattern]
 */

import * as fs from 'fs';
import * as path from 'path';

// Files that should keep console.log for CLI output (user-facing)
const CLI_COMMAND_FILES = [
  'src/cli/commands/budget.ts',
  'src/cli/commands/skills.ts',
  'src/cli/commands/clawhub.ts',
  'src/cli/commands/approve.ts',
  'src/cli/commands/agents.ts',
  'src/cli/commands/quality.ts',
  'src/cli/commands/openclaw.ts',
  'src/cli/commands/swarm.ts',
  'src/cli/commands/init.ts',
  'src/cli/commands/dashboard.ts',
  'src/cli/commands/events.ts',
  'src/cli/commands/context.ts',
  'src/cli/commands/tests.ts',
  'src/cli/commands/safety.ts',
  'src/cli/commands/tasks.ts',
  'src/cli/commands/status.ts',
  'src/cli/commands/reasoning.ts',
  'src/cli/commands/self-improve.ts',
];

interface Replacement {
  pattern: RegExp;
  replacement: string;
  module: string;
}

function getModuleName(filePath: string): string {
  // Extract module name from file path
  const parts = filePath.split('/');
  const fileName = parts[parts.length - 1].replace('.ts', '');
  const parentDir = parts[parts.length - 2];
  
  if (parentDir && parentDir !== 'src') {
    return `${parentDir}/${fileName}`;
  }
  return fileName;
}

function isCliCommandFile(filePath: string): boolean {
  return CLI_COMMAND_FILES.some(f => filePath.endsWith(f));
}

function processFile(filePath: string): { modified: boolean; count: number } {
  const content = fs.readFileSync(filePath, 'utf-8');
  const moduleName = getModuleName(filePath);
  
  let modified = false;
  let count = 0;
  let newContent = content;

  // Check if logger is already imported
  const hasLoggerImport = /import.*logger.*from.*utils/.test(content) || 
                          /import.*{[^}]*logger[^}]*}.*from/.test(content);

  // For CLI command files, keep console.log for user output but replace debug logs
  if (isCliCommandFile(filePath)) {
    // In CLI files, only replace console.log that looks like debugging
    // Keep UI output (lines with emojis, formatted tables, etc.)
    const debugPatterns = [
      // Replace simple debug statements (not UI output)
      {
        pattern: /console\.log\(['"]([^'"]+)['"]\);/g,
        replacement: (match: string, p1: string) => {
          // Keep if it has UI elements
          if (/[✅✓✗⚠️💡╔═║╝🔌📊🚀📜📭]/.test(p1) || 
              /table|status|error:/i.test(p1)) {
            return match;
          }
          count++;
          return `logger.info('${moduleName}', '${p1.replace(/'/g, "\\'")}');`;
        }
      }
    ];

    for (const { pattern, replacement } of debugPatterns) {
      newContent = newContent.replace(pattern, replacement as any);
    }
  } else {
    // For non-CLI files, replace all console.log statements
    
    // Pattern 1: console.log('message', variable) -> logger.info('module', 'message', { variable })
    newContent = newContent.replace(
      /console\.log\(['"]([^'"]+)['"]\s*,\s*([^)]+)\);/g,
      (match, message, variable) => {
        count++;
        const varName = variable.trim().split(/[\.\[]/)[0];
        return `logger.info('${moduleName}', '${message.replace(/'/g, "\\'")}', { ${varName}: ${variable} });`;
      }
    );

    // Pattern 2: console.log(`message ${var}`) -> logger.info('module', `message ${var}`)
    newContent = newContent.replace(
      /console\.log\(`([^`]+)`\);/g,
      (match, template) => {
        count++;
        return `logger.info('${moduleName}', \`${template}\`);`;
      }
    );

    // Pattern 3: console.log('message') -> logger.info('module', 'message')
    newContent = newContent.replace(
      /console\.log\(['"]([^'"]+)['"]\);/g,
      (match, message) => {
        // Skip if it's likely a table/UI separator
        if (/^[═─╔╚║]+$/g.test(message)) {
          return match;
        }
        count++;
        return `logger.info('${moduleName}', '${message.replace(/'/g, "\\'")}');`;
      }
    );

    // Pattern 4: console.log(object) -> logger.info('module', 'Data', { data: object })
    newContent = newContent.replace(
      /console\.log\(([^'"`][^)]*)\);/g,
      (match, expr) => {
        // Skip if it's a function call that looks like UI
        if (/format|render|display/i.test(expr)) {
          return match;
        }
        count++;
        return `logger.info('${moduleName}', 'Data', { data: ${expr} });`;
      }
    );
  }

  // Add logger import if needed and we made replacements
  if (count > 0 && !hasLoggerImport) {
    const importStatement = `import { logger } from '../../utils';\n`;
    if (newContent.includes('import { Command')) {
      newContent = newContent.replace(
        /(import { Command[^}]+} from 'commander';)/,
        `$1\n${importStatement}`
      );
    } else {
      newContent = importStatement + newContent;
    }
    modified = true;
  }

  if (count > 0) {
    modified = true;
    fs.writeFileSync(filePath, newContent, 'utf-8');
  }

  return { modified, count };
}

function findTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];
  
  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory() && entry !== 'node_modules') {
      files.push(...findTypeScriptFiles(fullPath));
    } else if (stat.isFile() && entry.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function main() {
  const srcDir = path.join(process.cwd(), 'src');
  const files = findTypeScriptFiles(srcDir);
  
  let totalModified = 0;
  let totalReplacements = 0;
  const modifiedFiles: string[] = [];

  for (const file of files) {
    // Skip logger.ts itself
    if (file.endsWith('logger.ts')) continue;
    
    const result = processFile(file);
    if (result.modified) {
      totalModified++;
      totalReplacements += result.count;
      modifiedFiles.push(file);
      console.log(`✓ ${file}: ${result.count} replacements`);
    }
  }

  console.log('\n═══════════════════════════════════════');
  console.log(`Total files modified: ${totalModified}`);
  console.log(`Total replacements: ${totalReplacements}`);
  console.log('═══════════════════════════════════════');
}

main();
