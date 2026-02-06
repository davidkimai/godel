#!/usr/bin/env node
/**
 * Godel v2.0 Health Check Script
 * Run manually or via cron to verify autonomous system health
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG_FILE = '.godel/logs/health-check.log';
const STATE_FILE = '.godel/orchestrator-state.json';

function log(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, logLine);
  console.log(message);
}

function checkBuild() {
  try {
    execSync('npm run build', { cwd: __dirname, stdio: 'pipe' });
    return { passing: true, errors: 0 };
  } catch (e) {
    const output = e.stdout?.toString() || '';
    const errorCount = (output.match(/error TS/g) || []).length;
    return { passing: false, errors: errorCount };
  }
}

function checkSwarms() {
  try {
    const output = execSync('ps aux | grep "kimi -p" | grep -v grep | wc -l', { encoding: 'utf8' });
    return parseInt(output.trim());
  } catch {
    return 0;
  }
}

function checkCronJobs() {
  try {
    const output = execSync('openclaw cron list 2>/dev/null | grep -c "enabled": true || echo 0', { encoding: 'utf8' });
    return parseInt(output.trim());
  } catch {
    return 0;
  }
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  log('=== Health Check Started ===');

  const build = checkBuild();
  const swarmCount = checkSwarms();
  const cronCount = checkCronJobs();
  const state = loadState();

  log(`Build Status: ${build.passing ? 'PASSING' : 'BROKEN'} (${build.errors} errors)`);
  log(`Active Swarms: ${swarmCount}`);
  log(`Cron Jobs: ${cronCount}`);
  log(`State Version: ${state?.version || 'unknown'}`);

  // Determine health
  let health = 'HEALTHY';
  if (!build.passing) health = 'CRITICAL';
  else if (swarmCount < 3) health = 'WARNING';
  else if (cronCount < 3) health = 'WARNING';

  log(`Overall Health: ${health}`);
  log('=== Health Check Complete ===');

  // Exit with error code if not healthy
  if (health === 'CRITICAL') {
    process.exit(1);
  }
}

main();
