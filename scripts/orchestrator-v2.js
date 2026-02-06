#!/usr/bin/env node
/**
 * Godel Orchestrator v2.0
 * Uses OpenClaw primary model (kimi-coding/k2p5) via sessions_spawn
 * Runs every 15 minutes to orchestrate swarm improvements
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configuration
const GODEL_DIR = '/Users/jasontang/clawd/projects/godel';
const STATE_FILE = path.join(GODEL_DIR, '.godel/orchestrator-state.json');
const LOG_DIR = path.join(GODEL_DIR, '.godel/logs');

// Limits
const LIMITS = {
  maxSwarms: 8,
  maxBudget: 100,
  maxAgents: 50,
  cooldowns: {
    bugfix: 15 * 60 * 1000,      // 15 min
    coverage: 30 * 60 * 1000,    // 30 min
    diagnostics: 60 * 60 * 1000, // 60 min
    quality: 30 * 60 * 1000,
    performance: 60 * 60 * 1000,
    docs: 120 * 60 * 1000,
    refactor: 240 * 60 * 1000
  }
};

// Initialize state
function loadState() {
  if (!fs.existsSync(STATE_FILE)) {
    return {
      version: '2.0',
      lastHeartbeat: 0,
      mode: 'normal',
      activeSwarms: {},
      metrics: { current: {}, history: [] },
      cooldowns: {},
      decisions: []
    };
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

function saveState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Collect current metrics
async function collectMetrics() {
  const metrics = {
    timestamp: Date.now(),
    testCoverage: 0,
    tsErrors: 0,
    swarmCount: 0,
    agentCount: 0,
    budgetSpent: 0,
    stuckAgents: 0,
    buildPassing: false,
    lastError: null
  };

  try {
    // Check build status
    try {
      await execAsync('npm run build', { cwd: GODEL_DIR });
      metrics.buildPassing = true;
    } catch (e) {
      metrics.buildPassing = false;
      metrics.lastError = 'Build failed';
    }

    // Count active swarms (looking for kimi processes)
    const { stdout: psOut } = await execAsync('ps aux | grep "kimi -p" | grep -v grep | wc -l');
    metrics.swarmCount = parseInt(psOut.trim()) || 0;

    // Count agents
    try {
      const { stdout: agentOut } = await execAsync(
        `node dist/index.js agents list | grep "agent_" | wc -l`,
        { cwd: GODEL_DIR }
      );
      metrics.agentCount = parseInt(agentOut.trim()) || 0;
    } catch (e) {
      // Ignore if CLI fails
    }

    console.log('📊 Metrics collected:', metrics);
  } catch (error) {
    console.error('Error collecting metrics:', error);
    metrics.lastError = error.message;
  }

  return metrics;
}

// Check if we can spawn a swarm type
function canSpawn(state, type) {
  const now = Date.now();
  const cooldown = state.cooldowns[type] || 0;
  
  if (cooldown > now) {
    const remainingMin = Math.ceil((cooldown - now) / 60000);
    console.log(`⏳ ${type} in cooldown for ${remainingMin} more minutes`);
    return false;
  }
  
  return true;
}

// Set cooldown for swarm type
function setCooldown(state, type) {
  state.cooldowns[type] = Date.now() + LIMITS.cooldowns[type];
}

// Make orchestration decision
function makeDecision(state, metrics) {
  console.log('🤔 Making orchestration decision...');
  
  // Crisis mode: build broken
  if (!metrics.buildPassing) {
    console.log('🚨 BUILD BROKEN - Entering crisis mode');
    return { action: 'spawn_bugfix', priority: 'CRITICAL', reason: 'Build broken' };
  }

  // High priority: low coverage
  if (metrics.testCoverage < 10 && canSpawn(state, 'coverage')) {
    console.log('📊 Coverage critically low');
    return { action: 'spawn_coverage', priority: 'HIGH', reason: 'Coverage < 10%' };
  }

  // Medium priority: need more swarms
  if (metrics.swarmCount < 3 && canSpawn(state, 'coverage')) {
    console.log('🔄 Below minimum swarm count');
    return { action: 'spawn_improvement', priority: 'MEDIUM', reason: 'Swarm count low' };
  }

  // All good
  console.log('✅ No action needed - system healthy');
  return { action: 'monitor', priority: 'LOW', reason: 'System healthy' };
}

// Spawn swarm using Kimi CLI (will use openclaw sessions_spawn in v3)
async function spawnSwarm(state, decision) {
  console.log(`🚀 Spawning ${decision.action} swarm...`);
  
  const timestamp = Date.now();
  const logFile = path.join(LOG_DIR, `swarm-${decision.action}-${timestamp}.log`);
  
  let task = '';
  
  switch (decision.action) {
    case 'spawn_coverage':
      task = `Improve test coverage in ${GODEL_DIR}. Currently at ${state.metrics.current.testCoverage}%. Write comprehensive tests for highest-impact untested modules. Focus on: decision-engine, swarm-executor, bug-monitor. Run 'npm test' after each file to verify 0 errors.`;
      break;
      
    case 'spawn_bugfix':
      task = `Fix build errors in ${GODEL_DIR}. Run 'npm run build' to identify errors. Fix all TypeScript errors found. Verify build passes after each fix.`;
      break;
      
    case 'spawn_improvement':
      task = `General improvements for ${GODEL_DIR}. Focus on: code quality, documentation, performance. Identify and fix 3 highest-impact issues.`;
      break;
      
    default:
      task = `Monitor ${GODEL_DIR} for issues. Check build status, test coverage, and agent health.`;
  }
  
  // Spawn using Kimi CLI
  // TODO: Use openclaw sessions_spawn in v3
  const cmd = `kimi -p "${task}" > "${logFile}" 2>&1 &`;
  
  try {
    await execAsync(cmd, { cwd: GODEL_DIR });
    console.log(`✅ Swarm spawned: ${decision.action}`);
    
    // Set cooldown
    setCooldown(state, decision.action.replace('spawn_', ''));
    
    // Log decision
    state.decisions.push({
      timestamp,
      action: decision.action,
      reason: decision.reason,
      logFile
    });
    
    // Keep only last 50 decisions
    if (state.decisions.length > 50) {
      state.decisions = state.decisions.slice(-50);
    }
    
  } catch (error) {
    console.error(`❌ Failed to spawn swarm:`, error.message);
  }
}

// Main orchestration loop
async function orchestrate() {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🔔 GODEL ORCHESTRATOR HEARTBEAT`);
  console.log(`   ${new Date().toISOString()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Load state
  const state = loadState();
  state.lastHeartbeat = Date.now();
  
  // Collect metrics
  const metrics = await collectMetrics();
  state.metrics.current = metrics;
  state.metrics.history.push(metrics);
  
  // Keep only last 100 checkpoints
  if (state.metrics.history.length > 100) {
    state.metrics.history = state.metrics.history.slice(-100);
  }
  
  // Make decision
  const decision = makeDecision(state, metrics);
  console.log(`💡 Decision: ${decision.action} (${decision.priority})`);
  console.log(`   Reason: ${decision.reason}`);
  
  // Execute decision
  if (decision.action !== 'monitor') {
    await spawnSwarm(state, decision);
  }
  
  // Save state
  saveState(state);
  
  console.log('');
  console.log('✅ Heartbeat complete');
  console.log(`📁 State: ${STATE_FILE}`);
  console.log(`⏰ Next heartbeat in 15 minutes`);
  console.log('');
}

// Run orchestrator
orchestrate().catch(error => {
  console.error('❌ Orchestrator error:', error);
  process.exit(1);
});
