#!/usr/bin/env node
/**
 * Dash Orchestrator v3 - Autonomous Operation System
 * Handles health checks, build monitoring, swarm spawning, and decision making
 * 
 * Usage:
 *   node .dash/orchestrator-v3.js --health     # Quick health check
 *   node .dash/orchestrator-v3.js              # Start orchestrator
 *   node .dash/orchestrator-v3.js --stop       # Stop running orchestrator
 */

const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  projectRoot: '/Users/jasontang/clawd/projects/dash',
  stateFile: '/Users/jasontang/clawd/projects/dash/.dash/orchestrator-state.json',
  pidFile: '/Users/jasontang/clawd/projects/dash/.dash/orchestrator.pid',
  logDir: '/Users/jasontang/clawd/projects/dash/.dash/logs',
  heartbeatIntervalMs: 60000,     // 1 minute
  healthCheckTimeoutMs: 30000,    // 30 seconds for health checks
  stuckSwarmThresholdMs: 7200000, // 2 hours
  cooldownPeriodMs: {
    CRITICAL: 300000,   // 5 minutes
    HIGH: 600000,       // 10 minutes
    MEDIUM: 1800000,    // 30 minutes
    LOW: 3600000        // 1 hour
  },
  maxConcurrentSwarms: 10,
  maxSwarmsPerArea: {
    bugfix: 3,
    coverage: 3,
    refactor: 2,
    optimize: 2
  },
  budgetDaily: 100,
  nightModeStart: '23:00',
  nightModeEnd: '07:00'
};

const PRIORITIES = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

class StateManager {
  constructor() {
    this.state = this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(CONFIG.stateFile)) {
        const data = fs.readFileSync(CONFIG.stateFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('Error loading state:', err.message);
    }
    return this.getDefaultState();
  }

  getDefaultState() {
    return {
      version: '3.0',
      lastHeartbeat: Date.now(),
      mode: 'normal',
      activeSwarms: {},
      metrics: {
        current: {
          timestamp: Date.now(),
          testCoverage: 0,
          tsErrors: 0,
          swarmCount: 0,
          agentCount: 0,
          budgetSpent: 0,
          stuckAgents: 0,
          buildPassing: true,
          lastError: null
        },
        history: []
      },
      cooldowns: {},
      decisions: []
    };
  }

  saveState() {
    try {
      // Ensure directory exists
      const dir = path.dirname(CONFIG.stateFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(CONFIG.stateFile, JSON.stringify(this.state, null, 2));
      return true;
    } catch (err) {
      console.error('Error saving state:', err.message);
      return false;
    }
  }

  updateHeartbeat() {
    this.state.lastHeartbeat = Date.now();
    this.saveState();
  }

  addDecision(action, reason, details = {}) {
    this.state.decisions.unshift({
      timestamp: Date.now(),
      action,
      reason,
      ...details
    });
    // Keep only last 100 decisions
    if (this.state.decisions.length > 100) {
      this.state.decisions = this.state.decisions.slice(0, 100);
    }
    this.saveState();
  }

  addMetric(metric) {
    this.state.metrics.current = {
      ...this.state.metrics.current,
      ...metric,
      timestamp: Date.now()
    };
    this.state.metrics.history.push(this.state.metrics.current);
    // Keep only last 1000 metrics
    if (this.state.metrics.history.length > 1000) {
      this.state.metrics.history = this.state.metrics.history.slice(-1000);
    }
    this.saveState();
  }

  setCooldown(area, priority = 'MEDIUM') {
    const duration = CONFIG.cooldownPeriodMs[priority] || CONFIG.cooldownPeriodMs.MEDIUM;
    this.state.cooldowns[area] = Date.now() + duration;
    this.saveState();
  }

  isOnCooldown(area) {
    const cooldownEnd = this.state.cooldowns[area];
    if (!cooldownEnd) return false;
    return Date.now() < cooldownEnd;
  }

  addSwarm(swarmId, swarmInfo) {
    this.state.activeSwarms[swarmId] = swarmInfo;
    this.saveState();
  }

  removeSwarm(swarmId) {
    delete this.state.activeSwarms[swarmId];
    this.saveState();
  }

  getActiveSwarmCount() {
    return Object.keys(this.state.activeSwarms).length;
  }

  getSwarmsByArea(area) {
    return Object.entries(this.state.activeSwarms)
      .filter(([_, info]) => info.area === area)
      .map(([id, info]) => ({ id, ...info }));
  }
}

// ============================================================================
// BUILD MONITORING
// ============================================================================

class BuildMonitor {
  constructor(stateManager) {
    this.stateManager = stateManager;
  }

  async checkBuild() {
    console.log('[BuildMonitor] Running npm run build...');
    const startTime = Date.now();
    
    try {
      const { stdout, stderr } = await execAsync('npm run build', {
        cwd: CONFIG.projectRoot,
        timeout: 120000,
        encoding: 'utf8'
      });

      const duration = Date.now() - startTime;
      console.log(`[BuildMonitor] Build passed in ${duration}ms`);

      // Parse TypeScript errors from stderr
      const tsErrors = this.parseTypeScriptErrors(stderr);
      
      return {
        passing: true,
        duration,
        tsErrors,
        output: stdout,
        errors: stderr
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[BuildMonitor] Build failed in ${duration}ms`);

      const tsErrors = this.parseTypeScriptErrors(error.stderr || error.message);
      
      return {
        passing: false,
        duration,
        tsErrors,
        output: error.stdout || '',
        errors: error.stderr || error.message,
        exitCode: error.code
      };
    }
  }

  parseTypeScriptErrors(stderr) {
    if (!stderr) return 0;
    
    // Count TypeScript errors
    const errorMatches = stderr.match(/error TS\d+/g);
    return errorMatches ? errorMatches.length : 0;
  }

  async getTestCoverage() {
    try {
      const coveragePath = path.join(CONFIG.projectRoot, 'coverage', 'coverage-summary.json');
      if (fs.existsSync(coveragePath)) {
        const data = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
        return data.total?.lines?.pct || 0;
      }
    } catch (err) {
      console.error('[BuildMonitor] Error reading coverage:', err.message);
    }
    return 0;
  }

  async runTests() {
    console.log('[BuildMonitor] Running tests...');
    try {
      const { stdout, stderr } = await execAsync('npm test', {
        cwd: CONFIG.projectRoot,
        timeout: 120000,
        encoding: 'utf8'
      });

      return {
        passing: true,
        output: stdout,
        errors: stderr
      };
    } catch (error) {
      return {
        passing: false,
        output: error.stdout || '',
        errors: error.stderr || error.message
      };
    }
  }
}

// ============================================================================
// SWARM MANAGEMENT
// ============================================================================

class SwarmManager {
  constructor(stateManager) {
    this.stateManager = stateManager;
    this.ensureLogDir();
  }

  ensureLogDir() {
    if (!fs.existsSync(CONFIG.logDir)) {
      fs.mkdirSync(CONFIG.logDir, { recursive: true });
    }
  }

  generateSwarmId() {
    return `orch-${Date.now()}`;
  }

  async spawnSwarm(area, priority = 'MEDIUM', context = {}) {
    const swarmId = this.generateSwarmId();
    const timestamp = Date.now();
    const logFile = path.join(CONFIG.logDir, `swarm-${area}-${timestamp}.log`);

    console.log(`[SwarmManager] Spawning ${area} swarm (${priority}): ${swarmId}`);

    const swarmInfo = {
      id: swarmId,
      started: timestamp,
      area,
      priority,
      status: 'spawning',
      logFile,
      method: 'kimi-cli-primary',
      context
    };

    this.stateManager.addSwarm(swarmId, swarmInfo);

    // Create the prompt for the swarm
    const prompt = this.generateSwarmPrompt(area, priority, context);

    // Spawn the swarm process
    try {
      const process = this.spawnKimiCli(prompt, logFile);
      
      // Update swarm with process info
      this.stateManager.state.activeSwarms[swarmId].pid = process.pid;
      this.stateManager.state.activeSwarms[swarmId].status = 'running';
      this.stateManager.saveState();

      // Handle process events
      process.on('exit', (code) => {
        console.log(`[SwarmManager] Swarm ${swarmId} exited with code ${code}`);
        this.stateManager.state.activeSwarms[swarmId].status = code === 0 ? 'completed' : 'failed';
        this.stateManager.state.activeSwarms[swarmId].exitCode = code;
        this.stateManager.state.activeSwarms[swarmId].ended = Date.now();
        this.stateManager.saveState();
      });

      return swarmId;
    } catch (err) {
      console.error(`[SwarmManager] Failed to spawn swarm:`, err.message);
      this.stateManager.state.activeSwarms[swarmId].status = 'failed';
      this.stateManager.state.activeSwarms[swarmId].error = err.message;
      this.stateManager.saveState();
      throw err;
    }
  }

  spawnKimiCli(prompt, logFile) {
    // Check if kimikit is available
    const hasKimikit = fs.existsSync('/usr/local/bin/kimikit') || 
                       fs.existsSync('/opt/homebrew/bin/kimikit') ||
                       fs.existsSync(path.join(CONFIG.projectRoot, 'node_modules/.bin/kimikit'));
    
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });
    
    let cmd, args;
    
    if (hasKimikit) {
      cmd = 'kimikit';
      args = ['--prompt', prompt, '--model', 'kimi-coding/k2p5'];
    } else {
      // Fallback: simulate swarm with a delayed echo for testing
      console.log(`[SwarmManager] kimikit not found, using simulated swarm`);
      cmd = 'sh';
      args = ['-c', `echo "[Simulated Swarm] Started at $(date)" >> ${logFile} && sleep 5 && echo "[Simulated Swarm] Completed at $(date)" >> ${logFile}`];
    }
    
    const child = spawn(cmd, args, {
      cwd: CONFIG.projectRoot,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Log stdout and stderr
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);

    // Also log to console
    child.stdout.on('data', (data) => {
      console.log(`[Swarm] ${data.toString().trim()}`);
    });
    child.stderr.on('data', (data) => {
      console.error(`[Swarm Error] ${data.toString().trim()}`);
    });
    
    // Handle spawn errors
    child.on('error', (err) => {
      console.error(`[SwarmManager] Spawn error: ${err.message}`);
      logStream.write(`[Error] ${err.message}\n`);
      logStream.end();
    });

    return child;
  }

  generateSwarmPrompt(area, priority, context) {
    const prompts = {
      bugfix: `You are a bugfix swarm for the Dash project. Priority: ${priority}.
Current issues: ${context.errors || 'Build failing, investigate and fix'}.

STEPS:
1. Read the build output to understand errors
2. Identify root cause of the issue
3. Fix the problem with minimal changes
4. Run build to verify fix
5. If still failing, iterate up to 3 times

CONTEXT:
- Project: ${CONFIG.projectRoot}
- Build command: npm run build
- Test command: npm test

Focus on fixing the most critical issue first.`,

      coverage: `You are a test coverage swarm for the Dash project. Priority: ${priority}.
Current coverage: ${context.coverage || 0}%.

STEPS:
1. Identify files with low or no test coverage
2. Create comprehensive unit tests
3. Ensure tests pass (npm test)
4. Run coverage report (npm run coverage)
5. Target at least 10% increase in coverage

CONTEXT:
- Project: ${CONFIG.projectRoot}
- Test framework: Jest
- Coverage target: > 80%

Focus on critical business logic first.`,

      refactor: `You are a code quality swarm for the Dash project. Priority: ${priority}.

STEPS:
1. Identify code smells and anti-patterns
2. Refactor for better readability and maintainability
3. Ensure all tests still pass
4. Ensure build still passes
5. Document significant changes

CONTEXT:
- Project: ${CONFIG.projectRoot}
- Focus: TypeScript best practices

Make incremental, safe improvements.`,

      optimize: `You are a performance optimization swarm for the Dash project. Priority: ${priority}.

STEPS:
1. Identify performance bottlenecks
2. Implement optimizations with benchmarks
3. Ensure no functional changes
4. All tests must pass
5. Document performance improvements

CONTEXT:
- Project: ${CONFIG.projectRoot}
- Focus: Database queries, API response times

Measure before and after optimization.`
    };

    return prompts[area] || prompts.bugfix;
  }

  checkStuckSwarms() {
    const now = Date.now();
    const stuckSwarms = [];

    for (const [swarmId, swarmInfo] of Object.entries(this.stateManager.state.activeSwarms)) {
      if (swarmInfo.status !== 'running') continue;

      const runtime = now - swarmInfo.started;
      if (runtime > CONFIG.stuckSwarmThresholdMs) {
        console.log(`[SwarmManager] Detected stuck swarm: ${swarmId} (${Math.round(runtime / 60000)} min)`);
        stuckSwarms.push(swarmId);
        
        // Mark as failed
        this.stateManager.state.activeSwarms[swarmId].status = 'failed';
        this.stateManager.state.activeSwarms[swarmId].error = 'Stuck - exceeded 2 hour threshold';
        this.stateManager.state.activeSwarms[swarmId].ended = now;
      }
    }

    if (stuckSwarms.length > 0) {
      this.stateManager.saveState();
    }

    return stuckSwarms;
  }

  getActiveSwarmCount() {
    return Object.values(this.stateManager.state.activeSwarms)
      .filter(s => s.status === 'running' || s.status === 'spawning')
      .length;
  }

  getSwarmCountByArea(area) {
    return Object.values(this.stateManager.state.activeSwarms)
      .filter(s => s.area === area && (s.status === 'running' || s.status === 'spawning'))
      .length;
  }

  cleanupCompletedSwarms() {
    const now = Date.now();
    const retentionMs = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [swarmId, swarmInfo] of Object.entries(this.stateManager.state.activeSwarms)) {
      if (swarmInfo.status === 'completed' || swarmInfo.status === 'failed') {
        if (swarmInfo.ended && (now - swarmInfo.ended) > retentionMs) {
          delete this.stateManager.state.activeSwarms[swarmId];
        }
      }
    }
    
    this.stateManager.saveState();
  }
}

// ============================================================================
// DECISION ENGINE
// ============================================================================

class DecisionEngine {
  constructor(stateManager, buildMonitor, swarmManager) {
    this.stateManager = stateManager;
    this.buildMonitor = buildMonitor;
    this.swarmManager = swarmManager;
  }

  async makeDecision(metrics) {
    console.log('[DecisionEngine] Evaluating system state...');

    const decisions = [];

    // Check for critical issues first
    if (!metrics.buildPassing) {
      decisions.push({
        priority: 'CRITICAL',
        action: 'spawn_bugfix',
        reason: 'Build is failing',
        area: 'bugfix'
      });
    }

    // Check for high TS errors
    if (metrics.tsErrors > 10) {
      decisions.push({
        priority: 'HIGH',
        action: 'spawn_bugfix',
        reason: `High TypeScript error count: ${metrics.tsErrors}`,
        area: 'bugfix'
      });
    }

    // Check for low coverage
    if (metrics.testCoverage < 10) {
      decisions.push({
        priority: 'HIGH',
        action: 'spawn_coverage',
        reason: `Low test coverage: ${metrics.testCoverage}%`,
        area: 'coverage'
      });
    }

    // Check for stuck agents
    if (metrics.stuckAgents > 0) {
      decisions.push({
        priority: 'CRITICAL',
        action: 'spawn_bugfix',
        reason: `${metrics.stuckAgents} stuck agents detected`,
        area: 'bugfix'
      });
    }

    // If system is healthy, consider maintenance tasks
    if (decisions.length === 0) {
      // Check if we need more coverage work
      const coverageSwarms = this.swarmManager.getSwarmCountByArea('coverage');
      if (coverageSwarms < CONFIG.maxSwarmsPerArea.coverage && !this.stateManager.isOnCooldown('coverage')) {
        decisions.push({
          priority: 'MEDIUM',
          action: 'spawn_coverage',
          reason: 'Proactive coverage improvement',
          area: 'coverage'
        });
      }

      // Consider refactoring
      const refactorSwarms = this.swarmManager.getSwarmCountByArea('refactor');
      if (refactorSwarms < CONFIG.maxSwarmsPerArea.refactor && !this.stateManager.isOnCooldown('refactor')) {
        decisions.push({
          priority: 'LOW',
          action: 'spawn_refactor',
          reason: 'Proactive code quality improvement',
          area: 'refactor'
        });
      }
    }

    // Sort by priority
    decisions.sort((a, b) => PRIORITIES[a.priority] - PRIORITIES[b.priority]);

    return decisions;
  }

  async executeDecision(decision) {
    const { priority, action, reason, area } = decision;

    console.log(`[DecisionEngine] Executing: ${action} (${priority}) - ${reason}`);

    // Check if we're at swarm capacity
    const activeSwarms = this.swarmManager.getActiveSwarmCount();
    if (activeSwarms >= CONFIG.maxConcurrentSwarms) {
      console.log(`[DecisionEngine] At swarm capacity (${activeSwarms}/${CONFIG.maxConcurrentSwarms}), skipping`);
      return { skipped: true, reason: 'at_capacity' };
    }

    // Check area-specific limits
    const areaSwarms = this.swarmManager.getSwarmCountByArea(area);
    const areaLimit = CONFIG.maxSwarmsPerArea[area] || 2;
    if (areaSwarms >= areaLimit) {
      console.log(`[DecisionEngine] At ${area} capacity (${areaSwarms}/${areaLimit}), skipping`);
      return { skipped: true, reason: 'area_at_capacity' };
    }

    // Check cooldown
    if (this.stateManager.isOnCooldown(area)) {
      const remaining = Math.ceil((this.stateManager.state.cooldowns[area] - Date.now()) / 60000);
      console.log(`[DecisionEngine] ${area} on cooldown (${remaining}min remaining), skipping`);
      return { skipped: true, reason: 'on_cooldown' };
    }

    // Spawn the swarm
    try {
      const context = {
        coverage: this.stateManager.state.metrics.current.testCoverage,
        errors: this.stateManager.state.metrics.current.lastError
      };

      const swarmId = await this.swarmManager.spawnSwarm(area, priority, context);
      
      // Set cooldown for this area
      this.stateManager.setCooldown(area, priority);

      // Record decision
      this.stateManager.addDecision(action, reason, {
        priority,
        swarmId,
        area
      });

      return { success: true, swarmId };
    } catch (err) {
      console.error(`[DecisionEngine] Failed to spawn swarm:`, err.message);
      return { success: false, error: err.message };
    }
  }
}

// ============================================================================
// ORCHESTRATOR
// ============================================================================

class Orchestrator {
  constructor() {
    this.stateManager = new StateManager();
    this.buildMonitor = new BuildMonitor(this.stateManager);
    this.swarmManager = new SwarmManager(this.stateManager);
    this.decisionEngine = new DecisionEngine(
      this.stateManager,
      this.buildMonitor,
      this.swarmManager
    );
    this.running = false;
    this.heartbeatTimer = null;
  }

  async start() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║           Dash Orchestrator v3 - Starting                    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    // Check if already running
    if (await this.isAlreadyRunning()) {
      console.error('[Orchestrator] Another instance is already running');
      process.exit(1);
    }

    // Write PID file
    this.writePidFile();

    this.running = true;
    
    // Initial health check
    await this.runHealthCheck();

    // Start heartbeat loop
    this.heartbeatTimer = setInterval(() => {
      this.runHealthCheck().catch(err => {
        console.error('[Orchestrator] Health check error:', err.message);
      });
    }, CONFIG.heartbeatIntervalMs);

    console.log('[Orchestrator] Heartbeat loop started (every 60 seconds)');

    // Handle graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
  }

  stop() {
    console.log('\n[Orchestrator] Stopping...');
    this.running = false;
    
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Remove PID file
    this.removePidFile();

    console.log('[Orchestrator] Stopped');
    process.exit(0);
  }

  async isAlreadyRunning() {
    try {
      if (fs.existsSync(CONFIG.pidFile)) {
        const pid = parseInt(fs.readFileSync(CONFIG.pidFile, 'utf8').trim());
        // Check if process exists
        try {
          process.kill(pid, 0);
          return true; // Process exists
        } catch {
          // Process doesn't exist, stale PID file
          return false;
        }
      }
    } catch (err) {
      console.error('[Orchestrator] Error checking PID:', err.message);
    }
    return false;
  }

  writePidFile() {
    try {
      fs.writeFileSync(CONFIG.pidFile, process.pid.toString());
    } catch (err) {
      console.error('[Orchestrator] Error writing PID file:', err.message);
    }
  }

  removePidFile() {
    try {
      if (fs.existsSync(CONFIG.pidFile)) {
        fs.unlinkSync(CONFIG.pidFile);
      }
    } catch (err) {
      console.error('[Orchestrator] Error removing PID file:', err.message);
    }
  }

  async runHealthCheck() {
    const checkStart = Date.now();
    console.log(`\n[HealthCheck] Starting at ${new Date().toISOString()}`);

    try {
      // Update heartbeat
      this.stateManager.updateHeartbeat();

      // Run build check
      const buildResult = await this.buildMonitor.checkBuild();
      
      // Get coverage
      const coverage = await this.buildMonitor.getTestCoverage();

      // Check for stuck swarms
      const stuckSwarms = this.swarmManager.checkStuckSwarms();
      if (stuckSwarms.length > 0) {
        console.log(`[HealthCheck] Marked ${stuckSwarms.length} stuck swarms as failed`);
      }

      // Clean up old completed swarms
      this.swarmManager.cleanupCompletedSwarms();

      // Compile metrics
      const metrics = {
        buildPassing: buildResult.passing,
        tsErrors: buildResult.tsErrors,
        testCoverage: coverage,
        swarmCount: this.swarmManager.getActiveSwarmCount(),
        stuckAgents: stuckSwarms.length,
        lastError: buildResult.passing ? null : `Build failed with exit code: ${buildResult.exitCode || 'unknown'}`
      };

      // Update metrics
      this.stateManager.addMetric(metrics);

      console.log(`[HealthCheck] Build: ${metrics.buildPassing ? 'PASS' : 'FAIL'} | TS Errors: ${metrics.tsErrors} | Coverage: ${metrics.testCoverage.toFixed(1)}% | Swarms: ${metrics.swarmCount}`);

      // Make decisions
      const decisions = await this.decisionEngine.makeDecision(metrics);
      
      if (decisions.length > 0) {
        console.log(`[HealthCheck] ${decisions.length} decision(s) to execute`);
        
        // Execute highest priority decision
        const topDecision = decisions[0];
        const result = await this.decisionEngine.executeDecision(topDecision);
        
        if (result.success) {
          console.log(`[HealthCheck] Executed: ${topDecision.action} -> ${result.swarmId}`);
        } else if (result.skipped) {
          console.log(`[HealthCheck] Skipped: ${topDecision.action} (${result.reason})`);
        } else {
          console.error(`[HealthCheck] Failed: ${topDecision.action} (${result.error})`);
        }
      } else {
        console.log('[HealthCheck] No actions needed');
        this.stateManager.addDecision('monitor', 'System healthy');
      }

      const checkDuration = Date.now() - checkStart;
      console.log(`[HealthCheck] Completed in ${checkDuration}ms`);

      return metrics;
    } catch (err) {
      console.error('[HealthCheck] Error:', err.message);
      throw err;
    }
  }

  async quickHealthCheck() {
    console.log('[HealthCheck] Quick check mode');
    
    const buildResult = await this.buildMonitor.checkBuild();
    const coverage = await this.buildMonitor.getTestCoverage();
    const activeSwarms = this.swarmManager.getActiveSwarmCount();

    const status = {
      buildPassing: buildResult.passing,
      tsErrors: buildResult.tsErrors,
      coverage,
      activeSwarms,
      mode: this.stateManager.state.mode,
      lastHeartbeat: new Date(this.stateManager.state.lastHeartbeat).toISOString()
    };

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║              Dash Orchestrator - Health Status               ║');
    console.log('╠══════════════════════════════════════════════════════════════╣');
    console.log(`║ Build Status:      ${status.buildPassing ? '✅ PASSING' : '❌ FAILING'}                    ║`);
    console.log(`║ TypeScript Errors: ${String(status.tsErrors).padStart(3)}                               ║`);
    console.log(`║ Test Coverage:     ${status.coverage.toFixed(1).padStart(5)}%                          ║`);
    console.log(`║ Active Swarms:     ${String(status.activeSwarms).padStart(3)}                               ║`);
    console.log(`║ Mode:              ${status.mode.padStart(10)}                      ║`);
    console.log(`║ Last Heartbeat:    ${status.lastHeartbeat.substring(11, 19)}                       ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');

    return status;
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const orchestrator = new Orchestrator();

  if (args.includes('--health')) {
    // Quick health check mode
    const status = await orchestrator.quickHealthCheck();
    process.exit(status.buildPassing ? 0 : 1);
  } else if (args.includes('--stop')) {
    // Stop running orchestrator
    console.log('[CLI] Stopping orchestrator...');
    try {
      if (fs.existsSync(CONFIG.pidFile)) {
        const pid = parseInt(fs.readFileSync(CONFIG.pidFile, 'utf8').trim());
        process.kill(pid, 'SIGTERM');
        console.log(`[CLI] Sent stop signal to PID ${pid}`);
      } else {
        console.log('[CLI] No PID file found, orchestrator may not be running');
      }
    } catch (err) {
      console.error('[CLI] Error stopping orchestrator:', err.message);
    }
  } else if (args.includes('--version') || args.includes('-v')) {
    console.log('Dash Orchestrator v3.0.0');
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Dash Orchestrator v3 - Autonomous Operation System

Usage:
  node .dash/orchestrator-v3.js [options]

Options:
  --health     Run a quick health check and exit
  --stop       Stop the running orchestrator
  --version    Show version number
  --help       Show this help message

Without options, the orchestrator will start in daemon mode.
`);
  } else {
    // Start orchestrator
    await orchestrator.start();
  }
}

// Run main
main().catch(err => {
  console.error('[Main] Fatal error:', err);
  process.exit(1);
});
