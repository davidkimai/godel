#!/usr/bin/env node
/**
 * Recursive Godel Improvement & Monitoring Script
 * 
 * Launches K2.5 swarms for continuous improvement and bug monitoring
 */

const { bugMonitor } = require('../dist/core/bug-monitor');
const { healthMonitor } = require('../dist/core/health-monitor');
const { metricsCollector } = require('../dist/core/metrics');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configuration
const CONFIG = {
  checkInterval: 5 * 60 * 1000, // 5 minutes
  selfImproveInterval: 30 * 60 * 1000, // 30 minutes
  areas: ['testing', 'codeQuality', 'documentation'],
  maxConcurrentSwarms: 3,
};

let currentAreaIndex = 0;
let isRunning = false;

async function checkSystemHealth() {
  console.log('[Monitor] Checking system health...');
  
  const health = await healthMonitor.checkHealth();
  
  if (!health.healthy) {
    console.warn('[Monitor] ⚠️ System health issues detected:', health);
    
    // Report critical issues as bugs
    for (const check of health.checks) {
      if (check.severity === 'critical' && !check.success) {
        await bugMonitor.reportBug(
          'manual',
          `Health Check Failed: ${check.name}`,
          check.error || 'Health check failed',
          { severity: 'CRITICAL' }
        );
      }
    }
  }
}

async function runSelfImprovement() {
  if (isRunning) {
    console.log('[Monitor] Self-improvement already running, skipping...');
    return;
  }

  isRunning = true;
  const area = CONFIG.areas[currentAreaIndex];
  currentAreaIndex = (currentAreaIndex + 1) % CONFIG.areas.length;

  console.log(`[Monitor] 🚀 Starting self-improvement: ${area}`);

  try {
    const { stdout, stderr } = await execAsync(
      `node dist/index.js self-improve run --area ${area} --iterations 1`,
      { cwd: __dirname + '/..' }
    );

    console.log('[Monitor] ✅ Self-improvement completed:', area);
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
  } catch (error) {
    console.error('[Monitor] ❌ Self-improvement failed:', error.message);
    
    await bugMonitor.reportBug(
      'runtime_error',
      'Self-improvement failed',
      error.message,
      { severity: 'HIGH' }
    );
  } finally {
    isRunning = false;
  }
}

async function checkBugStatus() {
  const stats = bugMonitor.getBugStats();
  
  console.log('[Monitor] 🐛 Bug Status:', {
    active: stats.active,
    fixed: stats.fixed,
    autoFixRate: `${(stats.autoFixRate * 100).toFixed(1)}%`,
  });

  // Report if too many active bugs
  if (stats.active > 10) {
    console.warn('[Monitor] ⚠️ High number of active bugs:', stats.active);
  }
}

async function monitorLoop() {
  console.log('[Monitor] 🔄 Starting recursive monitoring loop...');
  
  // Start bug monitoring
  bugMonitor.startMonitoring();
  
  // Periodic health checks
  setInterval(async () => {
    try {
      await checkSystemHealth();
      await checkBugStatus();
    } catch (error) {
      console.error('[Monitor] Error in health check:', error);
    }
  }, CONFIG.checkInterval);

  // Periodic self-improvement
  setInterval(async () => {
    try {
      await runSelfImprovement();
    } catch (error) {
      console.error('[Monitor] Error in self-improvement:', error);
    }
  }, CONFIG.selfImproveInterval);

  // Initial run
  await checkSystemHealth();
  await runSelfImprovement();
}

// Start monitoring
monitorLoop().catch((error) => {
  console.error('[Monitor] Fatal error:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[Monitor] Shutting down...');
  bugMonitor.stopMonitoring();
  process.exit(0);
});
