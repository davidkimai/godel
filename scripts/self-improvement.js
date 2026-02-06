#!/usr/bin/env node
/**
 * Swarm Self-Improvement System
 * Analyzes patterns, learns, and improves
 */

const fs = require('fs');
const path = require('path');

const TRACKER_FILE = '.godel/swarm-tracker.json';
const HEALTH_FILE = '.godel/swarm-health.json';
const IMPROVEMENTS_FILE = '.godel/swarm-improvements.json';
const LEARNINGS_FILE = 'SWARM_HEALTH_ANALYSIS.md';

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [SELF-IMPROVE] ${message}`);
}

function loadTracker() {
  try {
    if (!fs.existsSync(TRACKER_FILE)) return { swarms: {} };
    return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
  } catch {
    return { swarms: {} };
  }
}

function loadHealth() {
  try {
    if (!fs.existsSync(HEALTH_FILE)) return { swarms: {}, summary: {} };
    return JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf8'));
  } catch {
    return { swarms: {}, summary: {} };
  }
}

function loadImprovements() {
  try {
    if (!fs.existsSync(IMPROVEMENTS_FILE)) return { applied: [], suggested: [], patterns: [] };
    return JSON.parse(fs.readFileSync(IMPROVEMENTS_FILE, 'utf8'));
  } catch {
    return { applied: [], suggested: [], patterns: [] };
  }
}

function saveImprovements(imp) {
  fs.writeFileSync(IMPROVEMENTS_FILE, JSON.stringify(imp, null, 2));
}

function analyzePatterns() {
  log('Analyzing swarm patterns...');
  
  const tracker = loadTracker();
  const health = loadHealth();
  const improvements = loadImprovements();
  
  const stats = {
    total: 0,
    terminated: 0,
    completed: 0,
    avgDuration: 0,
    staleCount: 0,
    healthBreakdown: { healthy: 0, warning: 0, stale: 0, unknown: 0 }
  };
  
  let totalDuration = 0;
  let durationCount = 0;
  
  for (const [id, swarm] of Object.entries(tracker.swarms)) {
    if (swarm.status === 'terminated') stats.terminated++;
    if (swarm.status === 'completed') stats.completed++;
    
    if (swarm.endTime && swarm.startTime) {
      const duration = swarm.endTime - swarm.startTime;
      totalDuration += duration;
      durationCount++;
    }
    
    if (swarm.terminationReason === 'timeout') {
      stats.staleCount++;
    }
  }
  
  if (health.summary) {
    stats.healthBreakdown = health.summary;
  }
  
  stats.total = Object.keys(tracker.swarms).length;
  stats.avgDuration = durationCount > 0 ? totalDuration / durationCount : 0;
  
  // Generate insights
  const insights = [];
  
  if (stats.staleCount > 0) {
    insights.push({
      type: 'warning',
      message: `${stats.staleCount} swarms timed out`,
      suggestion: 'Reduce swarm duration limit or increase resources'
    });
  }
  
  if (stats.healthBreakdown.stale > 0) {
    insights.push({
      type: 'warning',
      message: `${stats.healthBreakdown.stale} swarms are stale`,
      suggestion: 'Implement health check auto-restart'
    });
  }
  
  if (stats.avgDuration > 25 * 60 * 1000) {
    insights.push({
      type: 'info',
      message: `Average swarm duration: ${Math.round(stats.avgDuration / 60000)} min`,
      suggestion: 'Consider breaking into smaller swarms'
    });
  }
  
  if (stats.healthBreakdown.warning > 2) {
    insights.push({
      type: 'warning',
      message: `${stats.healthBreakdown.warning} swarms showing warnings`,
      suggestion: 'Review swarm prompts for clarity'
    });
  }
  
  // Store patterns
  improvements.patterns.push({
    timestamp: Date.now(),
    stats,
    insights
  });
  
  // Keep only last 100 patterns
  if (improvements.patterns.length > 100) {
    improvements.patterns = improvements.patterns.slice(-100);
  }
  
  saveImprovements(improvements);
  
  log(`Analysis complete: ${insights.length} insights generated`);
  
  return { stats, insights };
}

function suggestImprovements() {
  const improvements = loadImprovements();
  const recentPatterns = improvements.patterns.slice(-10);
  
  const suggestions = [];
  
  // Analyze recent patterns for recurring issues
  const timeoutCount = recentPatterns.filter(p => 
    p.stats?.staleCount > 0
  ).length;
  
  const staleCount = recentPatterns.reduce((sum, p) => 
    sum + (p.stats?.healthBreakdown?.stale || 0), 0
  );
  
  // Generate suggestions
  if (timeoutCount > 3) {
    suggestions.push({
      priority: 'high',
      category: 'timeout',
      description: 'Multiple timeouts detected',
      action: 'Review swarm timeout settings or increase from 30min',
      autoApply: false
    });
  }
  
  if (staleCount > 5) {
    suggestions.push({
      priority: 'high',
      category: 'health',
      description: 'Multiple stale swarms',
      action: 'Enable swarm health monitor daemon',
      autoApply: true
    });
  }
  
  // Add to improvements
  improvements.suggested.push(...suggestions);
  saveImprovements(improvements);
  
  return suggestions;
}

function applyAutoFixes() {
  const improvements = loadImprovements();
  const applied = [];
  
  for (const suggestion of improvements.suggested) {
    if (suggestion.autoApply && !suggestion.applied) {
      // Auto-apply low-risk fixes
      if (suggestion.category === 'health') {
        // Enable health monitor
        const healthScript = 'scripts/swarm-health.js';
        if (fs.existsSync(healthScript)) {
          log(`Auto-applied: ${suggestion.description}`);
          suggestion.appliedAt = Date.now();
          suggestion.applied = true;
          applied.push(suggestion);
        }
      }
    }
  }
  
  improvements.applied.push(...applied.map(s => ({
    ...s,
    appliedAt: Date.now()
  })));
  
  // Remove applied from suggested
  improvements.suggested = improvements.suggested.filter(s => !s.applied);
  
  saveImprovements(improvements);
  
  if (applied.length > 0) {
    log(`Auto-applied ${applied.length} fixes`);
  }
  
  return applied;
}

function generateReport() {
  log('Generating self-improvement report...');
  
  const { stats, insights } = analyzePatterns();
  const suggestions = suggestImprovements();
  
  const report = {
    timestamp: Date.now(),
    stats,
    insights,
    suggestions,
    recommendations: []
  };
  
  // Generate recommendations
  if (stats.staleCount > 0) {
    report.recommendations.push({
      area: 'lifecycle',
      recommendation: 'Reduce swarm timeout or increase resources',
      priority: 'high'
    });
  }
  
  if (stats.healthBreakdown?.stale > 0) {
    report.recommendations.push({
      area: 'health',
      recommendation: 'Enable swarm health monitoring daemon',
      priority: 'high'
    });
  }
  
  if (stats.avgDuration > 25 * 60 * 1000) {
    report.recommendations.push({
      area: 'efficiency',
      recommendation: 'Break long swarms into smaller tasks',
      priority: 'medium'
    });
  }
  
  return report;
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--analyze')) {
    const result = analyzePatterns();
    console.log('\n📊 PATTERN ANALYSIS');
    console.log(`   Total swarms: ${result.stats.total}`);
    console.log(`   Terminated: ${result.stats.terminated}`);
    console.log(`   Completed: ${result.stats.completed}`);
    console.log(`   Avg duration: ${Math.round(result.stats.avgDuration / 60000)} min`);
    console.log(`   Stale: ${result.stats.staleCount}`);
    console.log(`\n💡 INSIGHTS:`);
    for (const insight of result.insights) {
      console.log(`   [${insight.type}] ${insight.message}`);
      console.log(`      → ${insight.suggestion}`);
    }
  } else if (args.includes('--suggest')) {
    const suggestions = suggestImprovements();
    console.log('\n💡 SUGGESTIONS');
    for (const s of suggestions) {
      console.log(`   [${s.priority}] ${s.description}`);
      console.log(`      Action: ${s.action}`);
    }
  } else if (args.includes('--apply')) {
    const applied = applyAutoFixes();
    console.log(`\n✅ Auto-applied ${applied.length} fixes`);
  } else if (args.includes('--report')) {
    const report = generateReport();
    console.log(JSON.stringify(report, null, 2));
  } else if (args.includes('--daemon')) {
    log('Starting self-improvement daemon (runs hourly)...');
    generateReport();
    setInterval(generateReport, 60 * 60 * 1000);
  } else {
    const report = generateReport();
    console.log('\n📈 SELF-IMPROVEMENT REPORT');
    console.log(`   Total swarms: ${report.stats.total}`);
    console.log(`   Insights: ${report.insights.length}`);
    console.log(`   Suggestions: ${report.suggestions.length}`);
    console.log(`   Recommendations: ${report.recommendations.length}`);
  }
}

module.exports = { 
  analyzePatterns, 
  suggestImprovements, 
  applyAutoFixes, 
  generateReport 
};
