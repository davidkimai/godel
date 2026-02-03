#!/usr/bin/env node
/**
 * Swarm Health Monitor
 * Verifies swarms are making progress, detects silent failures
 */

const fs = require('fs');
const { execSync } = require('child_process');

const LOG_DIR = '.dash/logs';
const HEALTH_FILE = '.dash/swarm-health.json';
const SILENCE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes of silence = warning
const STALE_THRESHOLD_MS = 20 * 60 * 1000; // 20 minutes = unhealthy

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [HEALTH] ${message}`);
}

function loadHealth() {
  try {
    if (!fs.existsSync(HEALTH_FILE)) {
      return { swarms: {}, lastCheck: Date.now() };
    }
    return JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf8'));
  } catch {
    return { swarms: {}, lastCheck: Date.now() };
  }
}

function saveHealth(health) {
  health.lastCheck = Date.now();
  fs.writeFileSync(HEALTH_FILE, JSON.stringify(health, null, 2));
}

function getLogSize(logPath) {
  try {
    return fs.statSync(logPath).size;
  } catch {
    return 0;
  }
}

function getLastLogLine(logPath) {
  try {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n');
    return lines[lines.length - 1] || '';
  } catch {
    return '';
  }
}

function analyzeLogHealth(logPath, pid) {
  try {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.trim().split('\n').filter(l => l);
    
    // Check for recent activity
    const now = Date.now();
    let lastActivityTime = now;
    
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      // Look for timestamps
      const timestampMatch = line.match(/\[([^\]]+)\]/);
      if (timestampMatch) {
        try {
          const parsedTime = new Date(timestampMatch[1]).getTime();
          if (!isNaN(parsedTime)) {
            lastActivityTime = parsedTime;
            break;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
    
    const silenceDuration = now - lastActivityTime;
    const lineCount = lines.length;
    const size = content.length;
    
    // Health indicators
    const indicators = {
      hasOutput: lineCount > 0,
      isGrowing: true, // Would need previous size to compare
      hasProgress: lineCount > 10,
      isRecent: silenceDuration < SILENCE_THRESHOLD_MS,
      isHealthy: silenceDuration < STALE_THRESHOLD_MS
    };
    
    return {
      lineCount,
      size,
      lastActivityTime,
      silenceDuration,
      indicators,
      health: indicators.isHealthy ? 'healthy' : (indicators.isRecent ? 'warning' : 'stale')
    };
  } catch (error) {
    return {
      lineCount: 0,
      size: 0,
      lastActivityTime: Date.now(),
      silenceDuration: STALE_THRESHOLD_MS * 10,
      indicators: { hasOutput: false },
      health: 'unknown'
    };
  }
}

function getRunningSwarms() {
  try {
    const output = execSync('ps aux | grep "kimi -p" | grep -v grep', { encoding: 'utf8' });
    const lines = output.trim().split('\n').filter(l => l);
    
    return lines.map(line => {
      const parts = line.trim().split(/\s+/);
      return {
        pid: parseInt(parts[1]),
        cpu: parts[2],
        mem: parts[3],
        command: parts.slice(10).join(' ')
      };
    });
  } catch {
    return [];
  }
}

function checkHealth() {
  log('Starting swarm health check...');
  
  const health = loadHealth();
  const now = Date.now();
  const runningSwarms = getRunningSwarms();
  
  let healthy = 0;
  let warning = 0;
  let stale = 0;
  let unknown = 0;
  
  // Check each running swarm
  for (const swarm of runningSwarms) {
    const logPath = `.dash/logs/swarm-${swarm.pid}.log`;
    const altLogPath = `.dash/logs/swarm-*.log`;
    
    // Find matching log file
    let actualLogPath = logPath;
    if (!fs.existsSync(logPath)) {
      // Try to find by PID in any swarm log
      try {
        const logs = fs.readdirSync(LOG_DIR).filter(l => l.startsWith('swarm-') && l.endsWith('.log'));
        for (const logFile of logs) {
          const content = fs.readFileSync(path.join(LOG_DIR, logFile), 'utf8');
          if (content.includes(String(swarm.pid))) {
            actualLogPath = path.join(LOG_DIR, logFile);
            break;
          }
        }
      } catch {
        // Ignore
      }
    }
    
    const analysis = fs.existsSync(actualLogPath) 
      ? analyzeLogHealth(actualLogPath, swarm.pid)
      : { health: 'unknown', silenceDuration: STALE_THRESHOLD_MS * 10 };
    
    health.swarms[swarm.pid] = {
      pid: swarm.pid,
      cpu: swarm.cpu,
      mem: swarm.mem,
      lastCheck: now,
      logSize: analysis.size,
      lineCount: analysis.lineCount,
      silenceDuration: analysis.silenceDuration,
      health: analysis.health,
      status: 'running'
    };
    
    if (analysis.health === 'healthy') healthy++;
    else if (analysis.health === 'warning') warning++;
    else if (analysis.health === 'stale') stale++;
    else unknown++;
    
    if (analysis.health === 'stale') {
      log(`WARNING: Swarm ${swarm.pid} is STALE (${Math.round(analysis.silenceDuration / 60000)} min silent)`);
    }
  }
  
  // Update summary
  health.summary = {
    total: runningSwarms.length,
    healthy,
    warning,
    stale,
    unknown,
    lastCheck: now
  };
  
  saveHealth(health);
  
  log(`Health check complete: ${healthy} healthy, ${warning} warning, ${stale} stale`);
  
  return health.summary;
}

function getHealthReport() {
  const health = loadHealth();
  return health;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--daemon')) {
    log('Starting health monitor daemon (checks every 5 min)...');
    checkHealth();
    setInterval(checkHealth, 5 * 60 * 1000);
  } else if (args.includes('--report')) {
    const report = getHealthReport();
    console.log(JSON.stringify(report, null, 2));
  } else {
    const summary = checkHealth();
    console.log(`\n📊 HEALTH SUMMARY: ${summary.total} swarms`);
    console.log(`   ✅ Healthy: ${summary.healthy}`);
    console.log(`   ⚠️  Warning: ${summary.warning}`);
    console.log(`   ❌ Stale: ${summary.stale}`);
  }
}

module.exports = { checkHealth, getHealthReport, loadHealth };
