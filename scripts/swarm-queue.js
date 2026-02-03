#!/usr/bin/env node
/**
 * Swarm Concurrency Controller
 * Enforces max concurrent swarms, queues excess
 */

const fs = require('fs');
const { execSync } = require('child_process');

const QUEUE_FILE = '.dash/swarm-queue.json';
const MAX_CONCURRENT = 6;
const WARN_THRESHOLD = 5;

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [QUEUE] ${message}`);
}

function loadQueue() {
  try {
    if (!fs.existsSync(QUEUE_FILE)) {
      return { queued: [], history: [], maxConcurrent: MAX_CONCURRENT };
    }
    return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  } catch {
    return { queued: [], history: [], maxConcurrent: MAX_CONCURRENT };
  }
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

function getRunningCount() {
  try {
    const output = execSync('ps aux | grep "kimi -p" | grep -v grep | wc -l', { encoding: 'utf8' });
    return parseInt(output.trim());
  } catch {
    return 0;
  }
}

function canSpawn() {
  const count = getRunningCount();
  return count < MAX_CONCURRENT;
}

function shouldWarn() {
  const count = getRunningCount();
  return count >= WARN_THRESHOLD && count < MAX_CONCURRENT;
}

function queueSwarm(task, priority = 'normal') {
  const queue = loadQueue();
  
  queue.queued.push({
    task,
    priority,
    timestamp: Date.now(),
    status: 'pending'
  });
  
  saveQueue(queue);
  log(`Queued: ${task} (priority: ${priority})`);
  
  return { queued: true, position: queue.queued.length };
}

function processQueue() {
  const queue = loadQueue();
  const count = getRunningCount();
  
  if (count >= MAX_CONCURRENT) {
    log(`At capacity (${count}/${MAX_CONCURRENT}), not processing queue`);
    return { spawned: 0, queued: queue.queued.length };
  }
  
  let spawned = 0;
  const toRemove = [];
  
  for (let i = 0; i < queue.queued.length && getRunningCount() < MAX_CONCURRENT; i++) {
    const item = queue.queued[i];
    
    log(`Spawning from queue: ${item.task}`);
    
    // In real implementation, would spawn actual swarm here
    // For now, just log and mark complete
    
    toRemove.push(i);
    queue.history.push({
      task: item.task,
      spawnedAt: Date.now(),
      status: 'spawned'
    });
    spawned++;
  }
  
  // Remove spawned items (in reverse to maintain indices)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    queue.queued.splice(toRemove[i], 1);
  }
  
  // Limit history to last 100
  if (queue.history.length > 100) {
    queue.history = queue.history.slice(-100);
  }
  
  saveQueue(queue);
  
  if (spawned > 0) {
    log(`Spawned ${spawned} from queue`);
  }
  
  return { spawned, queued: queue.queued.length };
}

function getStatus() {
  const queue = loadQueue();
  const running = getRunningCount();
  
  return {
    running,
    maxConcurrent: MAX_CONCURRENT,
    available: MAX_CONCURRENT - running,
    queued: queue.queued.length,
    capacity: running < MAX_CONCURRENT ? 'available' : 'full',
    shouldWarn: shouldWarn()
  };
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--status')) {
    const status = getStatus();
    console.log('\n📊 CONCURRENCY STATUS');
    console.log(`   Running: ${status.running}/${status.maxConcurrent}`);
    console.log(`   Available: ${status.available}`);
    console.log(`   Queued: ${status.queued}`);
    console.log(`   Capacity: ${status.capacity}`);
  } else if (args.includes('--queue')) {
    const task = args.slice(2).join(' ') || 'Unknown task';
    const result = queueSwarm(task);
    console.log(`Queued: ${task} (position: ${result.position})`);
  } else if (args.includes('--process')) {
    const result = processQueue();
    console.log(`Processed: ${result.spawned} spawned, ${result.queued} remaining`);
  } else if (args.includes('--can-spawn')) {
    console.log(canSpawn() ? 'YES' : 'NO');
  } else if (args.includes('--daemon')) {
    log('Starting concurrency controller daemon (checks every 1 min)...');
    processQueue();
    setInterval(processQueue, 60 * 1000);
  } else {
    const status = getStatus();
    console.log(`\n🚀 SWARM CONCURRENCY`);
    console.log(`   Running: ${status.running}/${status.maxConcurrent}`);
    console.log(`   Capacity: ${status.capacity}`);
    console.log(`   Queued: ${status.queued}`);
  }
}

module.exports = { 
  canSpawn, 
  shouldWarn, 
  queueSwarm, 
  processQueue, 
  getStatus,
  loadQueue 
};
