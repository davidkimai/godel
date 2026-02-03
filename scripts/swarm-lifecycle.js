#!/usr/bin/env node
/**
 * Swarm Lifecycle Manager
 * Enforces time limits, checkpoints, and auto-termination
 */

const fs = require('fs');
const { execSync } = require('child_process');

const TRACKER_FILE = '.dash/swarm-tracker.json';
const LOG_DIR = '.dash/logs';
const MAX_SWARM_AGE_MS = 30 * 60 * 1000; // 30 minutes
const CHECKPOINT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const KILL_GRACE_PERIOD_MS = 5000; // 5 seconds

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [LIFECYCLE] ${message}`);
}

function loadTracker() {
  try {
    if (!fs.existsSync(TRACKER_FILE)) {
      return { swarms: {}, lastCheck: Date.now() };
    }
    return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
  } catch {
    return { swarms: {}, lastCheck: Date.now() };
  }
}

function saveTracker(tracker) {
  tracker.lastCheck = Date.now();
  fs.writeFileSync(TRACKER_FILE, JSON.stringify(tracker, null, 2));
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getSwarmName(pid) {
  try {
    const cmd = `ps -p ${pid} -o comm= 2>/dev/null`;
    const output = execSync(cmd, { encoding: 'utf8' }).trim();
    return output || `PID_${pid}`;
  } catch {
    return `PID_${pid}`;
  }
}

function logCheckpoint(swarmId, tracker) {
  const swarm = tracker.swarms[swarmId];
  if (!swarm) return;
  
  const checkpointLog = {
    timestamp: Date.now(),
    age: Date.now() - swarm.startTime,
    messagesProcessed: swarm.checkpointCount || 0,
    status: 'working'
  };
  
  if (!swarm.checkpoints) {
    swarm.checkpoints = [];
  }
  swarm.checkpoints.push(checkpointLog);
  swarm.lastCheckpoint = Date.now();
  swarm.checkpointCount = (swarm.checkpointCount || 0) + 1;
  
  log(`Checkpoint for ${swarmId}: ${JSON.stringify(checkpointLog)}`);
}

function terminateSwarm(pid, reason) {
  try {
    const name = getSwarmName(pid);
    log(`TERMINATING ${name} (PID ${pid}): ${reason}`);
    
    // Send SIGTERM first
    process.kill(pid, 'SIGTERM');
    
    // Wait for graceful shutdown
    setTimeout(() => {
      if (isProcessRunning(pid)) {
        log(`Forcing kill of ${name} (PID ${pid})`);
        process.kill(pid, 'SIGKILL');
      }
    }, KILL_GRACE_PERIOD_MS);
    
    return true;
  } catch (error) {
    log(`Failed to terminate PID ${pid}: ${error.message}`);
    return false;
  }
}

function manageLifecycle() {
  log('Starting swarm lifecycle management...');
  
  const tracker = loadTracker();
  const now = Date.now();
  let terminated = 0;
  let checkpointed = 0;
  let active = 0;
  
  // Scan for running swarms
  try {
    const output = execSync('ps aux | grep "kimi -p" | grep -v grep | awk "{print $2}"', { encoding: 'utf8' });
    const runningPids = output.trim().split('\n').filter(p => p.trim());
    
    // Update tracker with running swarms
    for (const pid of runningPids) {
      const pidNum = parseInt(pid.trim());
      if (!tracker.swarms[pidNum]) {
        tracker.swarms[pidNum] = {
          pid: pidNum,
          startTime: now,
          name: getSwarmName(pidNum),
          status: 'active',
          createdAt: now
        };
        log(`Detected new swarm: PID ${pidNum}`);
      }
      tracker.swarms[pidNum].status = 'active';
    }
  } catch {
    log('No running swarms detected');
  }
  
  // Check each tracked swarm
  for (const [swarmId, swarm] of Object.entries(tracker.swarms)) {
    const age = now - swarm.startTime;
    
    // Skip if process no longer running
    if (!isProcessRunning(swarm.pid)) {
      if (swarm.status === 'active') {
        swarm.status = 'completed';
        swarm.endTime = now;
        log(`Swarm ${swarm.pid} completed naturally`);
      }
      continue;
    }
    
    active++;
    
    // Check for checkpoint
    const timeSinceCheckpoint = now - (swarm.lastCheckpoint || swarm.startTime);
    if (timeSinceCheckpoint >= CHECKPOINT_INTERVAL_MS) {
      logCheckpoint(swarmId, tracker);
      checkpointed++;
    }
    
    // Check for timeout
    if (age >= MAX_SWARM_AGE_MS) {
      if (terminateSwarm(swarm.pid, 'Timeout (30 min max)')) {
        swarm.status = 'terminated';
        swarm.endTime = now;
        swarm.terminationReason = 'timeout';
        terminated++;
      }
    }
  }
  
  // Clean up old entries (>24 hours)
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  for (const [swarmId, swarm] of Object.entries(tracker.swarms)) {
    if (swarm.endTime && swarm.endTime < oneDayAgo) {
      delete tracker.swarms[swarmId];
      log(`Cleaned up old entry: ${swarmId}`);
    }
  }
  
  saveTracker(tracker);
  
  log(`Lifecycle check complete: ${active} active, ${checkpointed} checkpointed, ${terminated} terminated`);
  
  return { active, checkpointed, terminated };
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--daemon')) {
    log('Starting lifecycle daemon (checks every 5 min)...');
    manageLifecycle();
    setInterval(manageLifecycle, 5 * 60 * 1000);
  } else {
    manageLifecycle();
  }
}

module.exports = { manageLifecycle, loadTracker, saveTracker };
