#!/usr/bin/env node
/**
 * Security Scan Script
 * 
 * Performs comprehensive security checks for the Godel platform.
 * Run with: npm run security:scan
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m',
};

const checks = {
  passed: 0,
  failed: 0,
  warnings: 0,
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  log(title, colors.bold + colors.blue);
  console.log('='.repeat(60));
}

function pass(message) {
  checks.passed++;
  log(`  ✅ ${message}`, colors.green);
}

function fail(message, details = '') {
  checks.failed++;
  log(`  ❌ ${message}`, colors.red);
  if (details) {
    log(`     ${details}`, colors.yellow);
  }
}

function warn(message, details = '') {
  checks.warnings++;
  log(`  ⚠️  ${message}`, colors.yellow);
  if (details) {
    log(`     ${details}`, colors.reset);
  }
}

// ============================================================================
// CHECK 1: npm audit
// ============================================================================
function checkNpmAudit() {
  section('1. Dependency Vulnerability Scan (npm audit)');
  
  try {
    const output = execSync('npm audit --json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const audit = JSON.parse(output);
    
    const { vulnerabilities } = audit.metadata;
    
    if (vulnerabilities.critical === 0 && vulnerabilities.high === 0) {
      pass(`No critical/high vulnerabilities found`);
      log(`     Total: ${vulnerabilities.total} (Info: ${vulnerabilities.info}, Low: ${vulnerabilities.low}, Moderate: ${vulnerabilities.moderate})`);
    } else {
      fail(`Found ${vulnerabilities.critical} critical and ${vulnerabilities.high} high vulnerabilities`);
      log(`     Run 'npm audit fix' to attempt automatic fixes`);
    }
  } catch (error) {
    // npm audit returns non-zero exit code when vulnerabilities found
    try {
      const audit = JSON.parse(error.stdout || error.message);
      const { vulnerabilities } = audit.metadata || audit;
      
      if (vulnerabilities && vulnerabilities.critical === 0 && vulnerabilities.high === 0) {
        pass(`No critical/high vulnerabilities found`);
      } else if (vulnerabilities) {
        fail(`Found ${vulnerabilities.critical || 0} critical and ${vulnerabilities.high || 0} high vulnerabilities`);
      } else {
        fail('Could not parse npm audit output');
      }
    } catch {
      fail('npm audit failed to run', error.message);
    }
  }
}

// ============================================================================
// CHECK 2: Hardcoded Secrets
// ============================================================================
function checkHardcodedSecrets() {
  section('2. Hardcoded Secrets Scan');
  
  const sensitivePatterns = [
    { pattern: /password\s*[=:]\s*["'][^"']{4,}["']/i, name: 'Hardcoded password' },
    { pattern: /api[_-]?key\s*[=:]\s*["'][^"']{8,}["']/i, name: 'Hardcoded API key' },
    { pattern: /secret\s*[=:]\s*["'][^"']{8,}["']/i, name: 'Hardcoded secret' },
    { pattern: /token\s*[=:]\s*["'][^"']{8,}["']/i, name: 'Hardcoded token' },
    { pattern: /sk-[a-zA-Z0-9]{20,}/, name: 'OpenAI-style API key' },
    { pattern: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub personal access token' },
  ];
  
  const scanDirs = ['src', 'config', 'scripts'];
  const excludePatterns = ['node_modules', 'dist', '.git', 'test', 'spec'];
  
  let foundIssues = false;
  
  for (const dir of scanDirs) {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) continue;
    
    const files = getFilesRecursive(dirPath, excludePatterns);
    
    for (const file of files) {
      if (!file.endsWith('.ts') && !file.endsWith('.js') && !file.endsWith('.yaml') && !file.endsWith('.yml')) continue;
      
      const content = fs.readFileSync(file, 'utf8');
      const relativePath = path.relative(process.cwd(), file);
      
      for (const { pattern, name } of sensitivePatterns) {
        // Skip if it's just a variable name or placeholder
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (pattern.test(line) && 
              !line.includes('//') && 
              !line.includes('change') &&
              !line.includes('placeholder') &&
              !line.includes('example') &&
              !line.includes('your_') &&
              !line.includes('process.env') &&
              !line.includes('config.')) {
            warn(`${name} in ${relativePath}:${i + 1}`, line.trim().slice(0, 80));
            foundIssues = true;
          }
        }
      }
    }
  }
  
  if (!foundIssues) {
    pass('No hardcoded secrets detected in source files');
  }
}

function getFilesRecursive(dir, excludePatterns) {
  const files = [];
  
  function shouldExclude(name) {
    return excludePatterns.some(pattern => name.includes(pattern));
  }
  
  function traverse(currentDir) {
    if (shouldExclude(currentDir)) return;
    
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        if (!shouldExclude(item)) {
          traverse(fullPath);
        }
      } else {
        files.push(fullPath);
      }
    }
  }
  
  traverse(dir);
  return files;
}

// ============================================================================
// CHECK 3: Environment Variables
// ============================================================================
function checkEnvironmentVariables() {
  section('3. Environment Variable Configuration');
  
  const requiredVars = [
    { name: 'GODEL_API_KEY', required: false, sensitive: true },
    { name: 'GODEL_JWT_SECRET', required: false, sensitive: true, minLength: 32 },
    { name: 'POSTGRES_PASSWORD', required: false, sensitive: true },
    { name: 'REDIS_PASSWORD', required: false, sensitive: true },
  ];
  
  const envExamplePath = path.join(process.cwd(), '.env.example');
  
  if (!fs.existsSync(envExamplePath)) {
    fail('.env.example file not found');
    return;
  }
  
  const envExample = fs.readFileSync(envExamplePath, 'utf8');
  
  for (const { name, sensitive, minLength } of requiredVars) {
    if (envExample.includes(name)) {
      const line = envExample.split('\n').find(l => l.startsWith(name));
      if (line) {
        const value = line.split('=')[1] || '';
        if (sensitive && value && !value.includes('your_') && !value.includes('change') && value.length > 3) {
          warn(`${name} may have default value in .env.example`, 'Use placeholder like "your_api_key_here"');
        } else if (minLength && value && value.length < minLength) {
          warn(`${name} value in .env.example is shorter than ${minLength} chars`);
        } else {
          pass(`${name} documented in .env.example`);
        }
      }
    } else {
      warn(`${name} not documented in .env.example`);
    }
  }
}

// ============================================================================
// CHECK 4: Docker Configuration
// ============================================================================
function checkDockerConfiguration() {
  section('4. Docker Configuration Security');
  
  const composeFiles = ['docker-compose.yml', 'docker-compose.postgres.yml'];
  
  for (const file of composeFiles) {
    const filePath = path.join(process.cwd(), file);
    if (!fs.existsSync(filePath)) continue;
    
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for hardcoded passwords (not using env vars)
    const hardcodedPattern = /(?:password|secret|key):\s*["'][^${][^"']+["']/i;
    const lines = content.split('\n');
    let foundHardcoded = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments and env var substitutions
      if (line.includes('#')) continue;
      if (line.includes('${')) continue;
      if (line.includes(':-')) continue;  // Default values are OK with warnings
      
      if (hardcodedPattern.test(line)) {
        fail(`Potential hardcoded credential in ${file}:${i + 1}`, line.trim());
        foundHardcoded = true;
      }
    }
    
    if (!foundHardcoded) {
      pass(`${file} uses environment variable substitution`);
    }
    
    // Check for security warnings
    if (content.includes('SECURITY') || content.includes('Change') || content.includes('change')) {
      pass(`${file} contains security warnings`);
    }
  }
}

// ============================================================================
// CHECK 5: JWT Configuration
// ============================================================================
function checkJwtConfiguration() {
  section('5. JWT Secret Validation');
  
  const schemaPath = path.join(process.cwd(), 'src/config/schema.ts');
  
  if (!fs.existsSync(schemaPath)) {
    fail('schema.ts not found');
    return;
  }
  
  const content = fs.readFileSync(schemaPath, 'utf8');
  
  // Check for min 32 char validation
  if (content.includes('min(32') || content.includes('min(64')) {
    pass('JWT secret has minimum length validation');
  } else {
    warn('JWT secret minimum length validation not found');
  }
  
  // Check for production validation
  if (content.includes('NODE_ENV') && content.includes('production')) {
    pass('JWT secret has production environment validation');
  } else {
    warn('JWT production validation not found');
  }
}

// ============================================================================
// CHECK 6: bcrypt Usage
// ============================================================================
function checkBcryptUsage() {
  section('6. Password Hashing (bcrypt)');
  
  const cryptoPath = path.join(process.cwd(), 'src/utils/crypto.ts');
  
  if (!fs.existsSync(cryptoPath)) {
    fail('crypto.ts not found');
    return;
  }
  
  const content = fs.readFileSync(cryptoPath, 'utf8');
  
  // Check for real bcrypt import
  if (content.includes("import * as bcrypt from 'bcrypt'") || content.includes('from "bcrypt"')) {
    pass('Using real bcrypt library (not simulator)');
  } else if (content.includes('bcryptjs')) {
    warn('Using bcryptjs (JavaScript implementation) instead of native bcrypt');
  } else {
    warn('bcrypt import pattern not recognized');
  }
  
  // Check for salt rounds
  if (content.includes('SALT_ROUNDS')) {
    const match = content.match(/SALT_ROUNDS\s*=\s*(\d+)/);
    if (match) {
      const rounds = parseInt(match[1], 10);
      if (rounds >= 10) {
        pass(`bcrypt salt rounds: ${rounds} (secure)`);
      } else {
        warn(`bcrypt salt rounds: ${rounds} (recommend 10+)`);
      }
    }
  }
  
  // Check for API key hashing
  if (content.includes('hashApiKey')) {
    pass('API key hashing implemented');
  } else {
    warn('API key hashing not found');
  }
}

// ============================================================================
// CHECK 7: Security Headers
// ============================================================================
function checkSecurityHeaders() {
  section('7. Security Headers');
  
  const securityPath = path.join(process.cwd(), 'src/api/middleware/security.ts');
  
  if (!fs.existsSync(securityPath)) {
    fail('security.ts middleware not found');
    return;
  }
  
  const content = fs.readFileSync(securityPath, 'utf8');
  
  const headers = [
    { name: 'Content Security Policy', pattern: /contentSecurityPolicy/i },
    { name: 'HSTS', pattern: /hsts|Strict-Transport-Security/i },
    { name: 'X-Frame-Options', pattern: /frameguard|frame-ancestors/i },
    { name: 'X-Content-Type-Options', pattern: /noSniff|nosniff/i },
    { name: 'X-XSS-Protection', pattern: /xssFilter/i },
    { name: 'Referrer Policy', pattern: /referrerPolicy/i },
  ];
  
  for (const { name, pattern } of headers) {
    if (pattern.test(content)) {
      pass(`${name} configured`);
    } else {
      warn(`${name} not found`);
    }
  }
}

// ============================================================================
// CHECK 8: API Key Persistence
// ============================================================================
function checkApiKeyPersistence() {
  section('8. API Key Persistence');
  
  const repositoryPath = path.join(process.cwd(), 'src/storage/repositories/ApiKeyRepository.ts');
  const storePath = path.join(process.cwd(), 'src/api/store/apiKeyStore.ts');
  
  // Check repository exists
  if (fs.existsSync(repositoryPath)) {
    const repoContent = fs.readFileSync(repositoryPath, 'utf8');
    
    if (repoContent.includes('PostgresPool') || repoContent.includes('postgresql')) {
      pass('API Key Repository uses PostgreSQL');
    } else {
      warn('API Key Repository may not use PostgreSQL');
    }
    
    if (repoContent.includes('key_hash')) {
      pass('API keys stored as hashes (not plaintext)');
    } else {
      warn('API key hashing not confirmed');
    }
  } else {
    fail('ApiKeyRepository.ts not found');
  }
  
  // Check store uses repository
  if (fs.existsSync(storePath)) {
    const storeContent = fs.readFileSync(storePath, 'utf8');
    
    if (storeContent.includes('ApiKeyRepository')) {
      pass('API Key Store uses Repository pattern');
    } else {
      warn('API Key Store may not use Repository pattern');
    }
  } else {
    fail('apiKeyStore.ts not found');
  }
}

// ============================================================================
// MAIN
// ============================================================================
function main() {
  console.log(`
${colors.bold}${colors.blue}╔════════════════════════════════════════════════════════════╗
║           GODEL SECURITY SCANNER v1.0                      ║
║  Enterprise Security Hardening Verification                ║
╚════════════════════════════════════════════════════════════╝${colors.reset}
`);

  const startTime = Date.now();
  
  // Run all checks
  checkNpmAudit();
  checkHardcodedSecrets();
  checkEnvironmentVariables();
  checkDockerConfiguration();
  checkJwtConfiguration();
  checkBcryptUsage();
  checkSecurityHeaders();
  checkApiKeyPersistence();
  
  const duration = Date.now() - startTime;
  
  // Summary
  console.log('\n' + '='.repeat(60));
  log('SCAN SUMMARY', colors.bold + colors.blue);
  console.log('='.repeat(60));
  
  log(`  ✅ Passed:  ${checks.passed}`, colors.green);
  log(`  ⚠️  Warnings: ${checks.warnings}`, colors.yellow);
  log(`  ❌ Failed:  ${checks.failed}`, colors.red);
  console.log(`  ⏱️  Duration: ${duration}ms`);
  
  console.log('\n' + '-'.repeat(60));
  
  if (checks.failed === 0) {
    log('✅ SECURITY SCAN PASSED', colors.bold + colors.green);
    log('   All critical security checks passed.', colors.green);
    if (checks.warnings > 0) {
      log(`   ${checks.warnings} warning(s) should be reviewed.`, colors.yellow);
    }
    process.exit(0);
  } else {
    log('❌ SECURITY SCAN FAILED', colors.bold + colors.red);
    log(`   ${checks.failed} critical issue(s) must be fixed.`, colors.red);
    process.exit(1);
  }
}

main();
