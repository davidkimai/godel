#!/usr/bin/env node
/**
 * Godel Orchestrator v3.0 - OpenClaw Integration
 * 
 * This orchestrator uses OpenClaw's sessions_spawn to launch swarms
 * with the primary model from OpenClaw config (kimi-coding/k2p5)
 * 
 * When OpenClaw is available, it spawns isolated sessions that:
 * - Inherit the primary model from config
 * - Track budget automatically
 * - Maintain session history for auditing
 * - Support session messaging for coordination
 * 
 * When OpenClaw is unavailable, it falls back to direct CLI.
 */

const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configuration
const GODEL_DIR = '/Users/jasontang/clawd/projects/godel';
const STATE_FILE = path.join(GODEL_DIR, '.godel/orchestrator-state.json');
const LOG_DIR = path.join(GODEL_DIR, '.godel/logs');

// OpenClaw Configuration
const OPENCLAW = {
  // Default model from OpenClaw config
  primaryModel: 'kimi-coding/k2p5',
  
  // Session settings
  sessionTimeout: 3600, // 1 hour
  
  // Session label prefix
  labelPrefix: 'orchestrator-swarm::',
  
  // Whether OpenClaw is available
  available: null, // Will be checked
  
  // PRIORITY: Kimi CLI is now PRIMARY (Claude Code/Codex rate limited)
  // OpenClaw sessions_spawn is FALLBACK (when Kimi unavailable)
  preferKimiCLI: true
};

// Check if OpenClaw is available
async function checkOpenClawAvailability() {
  if (OPENCLAW.available !== null) return OPENCLAW.available;
  
  try {
    // Try to find OpenClaw CLI
    const { stdout } = await execAsync('which openclaw 2>/dev/null || echo ""');
    OPENCLAW.available = stdout.trim().length > 0;
    
    if (!OPENCLAW.available) {
      // Try nvm path
      const nvmPath = process.env.NVM_DIR || '/Users/jasontang/.nvm';
      const possiblePaths = [
        `${nvmPath}/versions/node/v23.8.0/lib/node_modules/openclaw/bin/openclaw`,
        `${nvmPath}/versions/node/v22*/lib/node_modules/openclaw/bin/openclaw`,
      ];
      
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          OPENCLAW.available = true;
          OPENCLAW.cliPath = p;
          break;
        }
      }
    }
    
    console.log(`🔧 OpenClaw available: ${OPENCLAW.available}`);
    return OPENCLAW.available;
  } catch (e) {
    OPENCLAW.available = false;
    console.log(`🔧 OpenClaw available: false (using fallback)`);
    return false;
  }
}

// Limits
const LIMITS = {
  maxSwarms: 8,
  maxBudget: 100,
  maxAgents: 50,
  cooldowns: {
    bugfix: 15 * 60 * 1000,
    coverage: 30 * 60 * 1000,
    diagnostics: 60 * 60 * 1000,
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
      version: '3.0',
      lastHeartbeat: 0,
      mode: 'normal',
      openclawUsed: false,
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

// Collect metrics
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
    // Check build (must check exit code, not just error)
    try {
      const { stdout, stderr, code } = await execAsync('npm run build', { cwd: GODEL_DIR, maxBuffer: 1024 * 1024 });
      if (code === 0) {
        metrics.buildPassing = true;
      } else {
        metrics.buildPassing = false;
        metrics.lastError = 'Build failed with exit code: ' + code;
        metrics.tsErrors = (stderr.match(/error TS/g) || []).length;  // Count TS errors
        console.log(`⚠️  Build failed with ${metrics.tsErrors} TypeScript errors`);
      }
    } catch (e) {
      metrics.buildPassing = false;
      metrics.lastError = e.message;
    }

    // Get swarm count
    const openclawAvail = await checkOpenClawAvailability();
    
    if (openclawAvail) {
      try {
        const { stdout } = await execAsync(
          'openclaw sessions list --kinds isolated --limit 100 | grep orchestrator-swarm | wc -l'
        );
        metrics.swarmCount = parseInt(stdout.trim()) || 0;
      } catch (e) {
        const { stdout } = await execAsync('ps aux | grep "kimi -p" | grep -v grep | wc -l');
        metrics.swarmCount = parseInt(stdout.trim()) || 0;
      }
    } else {
      const { stdout } = await execAsync('ps aux | grep "kimi -p" | grep -v grep | wc -l');
      metrics.swarmCount = parseInt(stdout.trim()) || 0;
    }

    // Count agents
    try {
      const { stdout: agentOut } = await execAsync(
        `node dist/index.js agents list | grep "agent_" | wc -l`,
        { cwd: GODEL_DIR }
      );
      metrics.agentCount = parseInt(agentOut.trim()) || 0;
    } catch (e) {}

    console.log('📊 Metrics:', metrics);
  } catch (error) {
    metrics.lastError = error.message;
  }

  return metrics;
}

function canSpawn(state, type) {
  const now = Date.now();
  const cooldown = state.cooldowns[type] || 0;
  if (cooldown > now) {
    const remainingMin = Math.ceil((cooldown - now) / 60000);
    console.log(`⏳ ${type} cooldown: ${remainingMin} min`);
    return false;
  }
  return true;
}

function setCooldown(state, type) {
  state.cooldowns[type] = Date.now() + LIMITS.cooldowns[type];
}

function makeDecision(state, metrics) {
  console.log('🤔 Decision:');
  
  if (!metrics.buildPassing) {
    return { action: 'spawn_bugfix', priority: 'CRITICAL', reason: 'Build broken' };
  }
  
  if (metrics.testCoverage < 10 && canSpawn(state, 'coverage')) {
    return { action: 'spawn_coverage', priority: 'HIGH', reason: 'Coverage < 10%' };
  }
  
  if (metrics.swarmCount < 3 && canSpawn(state, 'coverage')) {
    return { action: 'spawn_improvement', priority: 'MEDIUM', reason: 'Swarm count low' };
  }
  
  return { action: 'monitor', priority: 'LOW', reason: 'System healthy' };
}

function generateTask(decision, metrics) {
  const tasks = {
    spawn_coverage: `You are a test coverage improvement swarm for Godel v2.0.

Location: ${GODEL_DIR}
Current Coverage: ${metrics.testCoverage}%
Target: 50%

Your Tasks:
1. Run 'npm test -- --coverage' to see current coverage
2. Identify 5 highest-impact untested modules
3. Write tests for: decision-engine, swarm-executor, bug-monitor
4. Run 'npm test' after each file (must pass 0 errors)
5. Report coverage increase

Use OpenClaw tools when available. Report completion.`,

    spawn_bugfix: `You are a build fix swarm for Godel v2.0.

Location: ${GODEL_DIR}
Status: BUILD BROKEN

Your Tasks:
1. Run 'npm run build' to identify all errors
2. Fix each TypeScript error systematically
3. Verify build passes after each fix
4. Document fixes in BUGFIX_*.md

URGENT: Build must pass. Report when complete.`,

    spawn_improvement: `You are a general improvement swarm for Godel v2.0.

Location: ${GODEL_DIR}
Active Swarms: ${metrics.swarmCount}/3

Your Tasks:
1. Identify 3 highest-impact improvements
2. Focus: code quality, documentation, performance
3. Implement improvements
4. Verify with tests/build
5. Report changes made

Work efficiently.`
  };
  
  return tasks[decision.action] || 'Monitor for issues.';
}

// Spawn via OpenClaw sessions_spawn
async function spawnViaOpenClaw(state, decision, metrics) {
  const timestamp = Date.now();
  const label = `orchestrator-swarm::${decision.action.replace('spawn_', '')}::${timestamp}`;
  const task = generateTask(decision, metrics);
  
  console.log(`📡 Spawning via OpenClaw: ${label}`);
  console.log(`   Model: ${OPENCLAW.primaryModel} (from OpenClaw config)`);
  
  // Build the spawn command
  const spawnCmd = `openclaw sessions spawn \\
    --agentId orchestrator \\
    --label "${label}" \\
    --task "${task.replace(/"/g, '\\"')}" \\
    --timeout 3600 \\
    --cleanup keep`;
  
  try {
    const { stdout, stderr } = await execAsync(spawnCmd, { cwd: GODEL_DIR });
    
    console.log('✅ Spawned via OpenClaw sessions_spawn');
    console.log(stdout);
    
    state.openclawUsed = true;
    state.activeSwarms[label] = {
      started: timestamp,
      area: decision.action.replace('spawn_', ''),
      model: OPENCLAW.primaryModel,
      priority: decision.priority,
      status: 'running',
      openclaw: true,
      sessionKey: stdout.trim()
    };
    
    setCooldown(state, decision.action.replace('spawn_', ''));
    return true;
    
  } catch (error) {
    console.error(`❌ OpenClaw spawn failed: ${error.message}`);
    return null; // Signal to try fallback
  }
}

// Spawn via direct CLI (PRIMARY - since Claude Code/Codex rate limited)
async function spawnViaCLI(state, decision, metrics) {
  const timestamp = Date.now();
  const logFile = path.join(LOG_DIR, `swarm-${decision.action}-${timestamp}.log`);
  const task = generateTask(decision, metrics);
  
  console.log(`🚀 Using Kimi CLI (kimi-coding/k2p5) - PRIMARY ORCHESTRATOR`);
  console.log(`   Note: Claude Code and Codex are rate limited, using Kimi`);
  
  const cmd = `kimi -p "${task.replace(/"/g, '\\"')}" > "${logFile}" 2>&1 &`;
  
  try {
    await execAsync(cmd, { cwd: GODEL_DIR });
    
    console.log('✅ Spawned via Kimi CLI');
    state.activeSwarms[`cli-${timestamp}`] = {
      started: timestamp,
      area: decision.action.replace('spawn_', ''),
      model: 'kimi-coding/k2p5', // Primary orchestrator model
      priority: decision.priority,
      status: 'running',
      openclaw: false,
      logFile,
      method: 'kimi-cli-primary'
    };
    
    setCooldown(state, decision.action.replace('spawn_', ''));
    return true;
    
  } catch (error) {
    console.error(`❌ Kimi CLI failed: ${error.message}`);
    return false;
  }
}

// Main orchestrator
async function orchestrate() {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🔔 GODEL ORCHESTRATOR V3.0 (OpenClaw Integration)`);
  console.log(`   ${new Date().toISOString()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // Check OpenClaw availability
  const openclawAvail = await checkOpenClawAvailability();
  console.log(`🔧 OpenClaw available: ${openclawAvail}`);
  
  const state = loadState();
  state.lastHeartbeat = Date.now();
  state.version = '3.0';
  
  const metrics = await collectMetrics();
  state.metrics.current = metrics;
  state.metrics.history.push(metrics);
  if (state.metrics.history.length > 100) {
    state.metrics.history = state.metrics.history.slice(-100);
  }
  
  const decision = makeDecision(state, metrics);
  console.log(`💡 Decision: ${decision.action} (${decision.priority}) - ${decision.reason}`);
  
  if (decision.action !== 'monitor') {
    let spawned = false;
    let result = null;
    
    // PRIORITY 1: Kimi CLI (Claude Code/Codex are rate limited)
    // Kimi K2.5 is the primary orchestrator model
    console.log(`🚀 Spawning via Kimi CLI (kimi-coding/k2p5) - PRIMARY`);
    result = await spawnViaCLI(state, decision, metrics);
    if (result === true) spawned = true;
    
    // PRIORITY 2: OpenClaw sessions_spawn (fallback)
    if (!spawned) {
      console.log(`🔄 Kimi CLI failed, trying OpenClaw fallback...`);
      if (openclawAvail) {
        result = await spawnViaOpenClaw(state, decision, metrics);
        if (result === true) spawned = true;
      }
    }
    
    if (!spawned) {
      console.log('⚠️  Failed to spawn swarm, retry next heartbeat');
    }
  }
  
  // Log decision
  state.decisions.push({
    timestamp: Date.now(),
    action: decision.action,
    reason: decision.reason,
    openclawUsed: state.openclawUsed
  });
  state.decisions = state.decisions.slice(-50);
  
  saveState(state);
  
  console.log('');
  console.log('✅ Heartbeat complete');
  console.log(`📁 State: ${STATE_FILE}`);
  console.log(`🔧 Using: ${state.openclawUsed ? 'OpenClaw sessions_spawn' : 'CLI fallback'}`);
  console.log(`⏰ Next heartbeat: 15 min`);
  console.log('');
}

orchestrate().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
