#!/usr/bin/env node
/**
 * Swarm Self-Healing Master Controller
 * Orchestrates lifecycle, health, concurrency, and self-improvement
 */

const fs = require('fs');
const { execSync } = require('child_process');

const PID_FILE = '.godel/self-healing.pid';

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [MASTER] ${message}`);
}

function isAlreadyRunning() {
  if (!fs.existsSync(PID_FILE)) return false;
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function writePid() {
  fs.writeFileSync(PID_FILE, String(process.pid));
}

function getRunningCount() {
  try {
    const output = execSync('ps aux | grep "kimi -p" | grep -v grep | wc -l', { encoding: 'utf8' });
    return parseInt(output.trim());
  } catch {
    return 0;
  }
}

function checkSystem() {
  const results = {
    lifecycle: false,
    health: false,
    queue: false,
    selfImprove: false
  };
  
  // Check scripts exist
  results.lifecycle = fs.existsSync('scripts/swarm-lifecycle.js');
  results.health = fs.existsSync('scripts/swarm-health.js');
  results.queue = fs.existsSync('scripts/swarm-queue.js');
  results.selfImprove = fs.existsSync('scripts/self-improvement.js');
  
  return results;
}

function runLifecycle() {
  try {
    execSync('node scripts/swarm-lifecycle.js', { encoding: 'utf8', timeout: 30000 });
    return true;
  } catch (error) {
    log(`Lifecycle check failed: ${error.message}`);
    return false;
  }
}

function runHealth() {
  try {
    execSync('node scripts/swarm-health.js', { encoding: 'utf8', timeout: 30000 });
    return true;
  } catch (error) {
    log(`Health check failed: ${error.message}`);
    return false;
  }
}

function runSelfImprove() {
  try {
    execSync('node scripts/self-improvement.js --analyze', { encoding: 'utf8', timeout: 30000 });
    return true;
  } catch (error) {
    log(`Self-improvement check failed: ${error.message}`);
    return false;
  }
}

function runAllChecks() {
  log('Running all self-healing checks...');
  
  const systems = checkSystem();
  log(`Systems: lifecycle=${systems.lifecycle} health=${systems.health} queue=${systems.queue} selfImprove=${systems.selfImprove}`);
  
  const results = {
    timestamp: Date.now(),
    running: getRunningCount(),
    systems,
    lifecycle: false,
    health: false,
    selfImprove: false
  };
  
  if (systems.lifecycle) {
    results.lifecycle = runLifecycle();
  }
  
  if (systems.health) {
    results.health = runHealth();
  }
  
  if (systems.selfImprove) {
    results.selfImprove = runSelfImprove();
  }
  
  // Summary
  const passed = [results.lifecycle, results.health, results.selfImprove].filter(x => x).length;
  log(`Checks complete: ${passed}/3 passed`);
  
  return results;
}

function daemon() {
  if (isAlreadyRunning()) {
    log('Self-healing daemon already running');
    return;
  }
  
  writePid();
  log('Starting swarm self-healing daemon (checks every 5 min)...');
  
  // Run immediately
  runAllChecks();
  
  // Then every 5 minutes
  setInterval(runAllChecks, 5 * 60 * 1000);
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--daemon')) {
    daemon();
  } else if (args.includes('--check')) {
    const results = runAllChecks();
    console.log('\n📊 SELF-HEALING CHECKS');
    console.log(`   Running swarms: ${results.running}`);
    console.log(`   Lifecycle: ${results.lifecycle ? '✅' : '❌'}`);
    console.log(`   Health: ${results.health ? '✅' : '❌'}`);
    console.log(`   Self-Improve: ${results.selfImprove ? '✅' : '❌'}`);
  } else if (args.includes('--status')) {
    const systems = checkSystem();
    console.log('\n🚀 SWARM SELF-HEALING STATUS');
    console.log(`   Lifecycle: ${systems.lifecycle ? '✅' : '❌'}`);
    console.log(`   Health: ${systems.health ? '✅' : '❌'}`);
    console.log(`   Queue: ${systems.queue ? '✅' : '❌'}`);
    console.log(`   Self-Improve: ${systems.selfImprove ? '✅' : '❌'}`);
  } else {
    console.log('\n📋 SWARM SELF-HEALING CONTROLLER');
    console.log('');
    console.log('Commands:');
    console.log('   --daemon   Run as daemon (checks every 5 min)');
    console.log('   --check    Run all checks once');
    console.log('   --status   Show system status');
    console.log('');
  }
}

module.exports = { runAllChecks, daemon, checkSystem };
