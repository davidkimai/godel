const fs = require('fs');
const path = require('path');

const filePath = '/Users/jasontang/clawd/projects/godel/src/self-improvement/orchestrator.ts';
let content = fs.readFileSync(filePath, 'utf-8');

// Replace console.log statements with logger calls
const replacements = [
  // Budget alert
  {
    from: /console\.log\(\`\[Budget Alert\] \$\{alert\.type\.toUpperCase\(\)\}: \$\{alert\.message\}\`\);/g,
    to: "logger.warn('self-improvement/orchestrator', 'Budget alert triggered', { type: alert.type, message: alert.message });"
  },
  // Budget tracking initialized
  {
    from: /console\.log\('\[Orchestrator\] Budget tracking initialized'\);/g,
    to: "logger.info('self-improvement/orchestrator', 'Budget tracking initialized');"
  },
  // Agent budget status
  {
    from: /console\.log\(\`\[Orchestrator\] Agent \$\{agent\.agentId\}: \$\$\$\{status\.totalSpent\.toFixed\(2\)\} \/ \$\$\$\{status\.budgetLimit\.toFixed\(2\)\} \(\$\{\(status\.percentUsed \* 100\)\.toFixed\(1\)\}%\)\`\);/g,
    to: "logger.info('self-improvement/orchestrator', 'Agent budget status', { agentId: agent.agentId, totalSpent: status.totalSpent, budgetLimit: status.budgetLimit, percentUsed: status.percentUsed });"
  },
  // Agent approaching budget limit
  {
    from: /console\.log\(\`⚠️ Agent \$\{agent\.agentId\} approaching budget limit\`\);/g,
    to: "logger.warn('self-improvement/orchestrator', 'Agent approaching budget limit', { agentId: agent.agentId });"
  },
  // Agent exceeded budget
  {
    from: /console\.log\(\`🚫 Agent \$\{agent\.agentId\} exceeded budget\`\);/g,
    to: "logger.error('self-improvement/orchestrator', 'Agent exceeded budget', { agentId: agent.agentId });"
  },
  // Starting session
  {
    from: /console\.log\('🚀 Starting Godel Self-Improvement Session'\);/g,
    to: "logger.info('self-improvement/orchestrator', 'Starting Godel Self-Improvement Session');"
  },
  // Budget config
  {
    from: /console\.log\(\`   Budget: \$\$\$\{SELF_IMPROVEMENT_CONFIG\.maxBudgetUSD\}\`\);/g,
    to: "logger.info('self-improvement/orchestrator', 'Budget configuration', { maxBudgetUSD: SELF_IMPROVEMENT_CONFIG.maxBudgetUSD });"
  },
  // Max tokens
  {
    from: /console\.log\(\`   Max tokens per agent: \$\{SELF_IMPROVEMENT_CONFIG\.maxTokensPerAgent\}\`\);/g,
    to: "logger.info('self-improvement/orchestrator', 'Max tokens configuration', { maxTokensPerAgent: SELF_IMPROVEMENT_CONFIG.maxTokensPerAgent });"
  },
  // Learning Engine initialized
  {
    from: /console\.log\('\[Orchestrator\] Learning Engine initialized'\);/g,
    to: "logger.info('self-improvement/orchestrator', 'Learning Engine initialized');"
  },
  // Improvement Store initialized
  {
    from: /console\.log\('\[Orchestrator\] Improvement Store initialized'\);/g,
    to: "logger.info('self-improvement/orchestrator', 'Improvement Store initialized');"
  },
  // Running improvement cycle
  {
    from: /console\.log\(\`\\n📊 Running \$\{area\} improvement cycle\.\.\.\`\);/g,
    to: "logger.info('self-improvement/orchestrator', 'Running improvement cycle', { area });"
  },
  // Recommended strategy
  {
    from: /console\.log\(\`   💡 Recommended strategy: \$\{recommendedStrategy\} \(\$\{\(recommendations\[0\]\.predictedSuccessRate \* 100\)\.toFixed\(0\)\}% predicted success\)\`\);/g,
    to: "logger.info('self-improvement/orchestrator', 'Strategy recommendation', { recommendedStrategy, predictedSuccessRate: recommendations[0].predictedSuccessRate });"
  },
  // Created swarm
  {
    from: /console\.log\(\`   Created swarm: \$\{swarm\.id\}\`\);/g,
    to: "logger.info('self-improvement/orchestrator', 'Swarm created', { swarmId: swarm.id });"
  },
  // Skipping agent - swarm budget
  {
    from: /console\.log\(\`   ⚠️  Skipping \$\{agentConfig\.role\} - swarm budget exceeded\`\);/g,
    to: "logger.warn('self-improvement/orchestrator', 'Skipping agent - swarm budget exceeded', { role: agentConfig.role });"
  },
  // Skipping agent - global budget
  {
    from: /console\.log\(\`   ⚠️  Skipping \$\{agentConfig\.role\} - global budget exceeded\`\);/g,
    to: "logger.warn('self-improvement/orchestrator', 'Skipping agent - global budget exceeded', { role: agentConfig.role });"
  },
  // Spawned agent
  {
    from: /console\.log\(\`   ✅ Spawned \$\{agentConfig\.role\} \(OpenClaw: \$\{openClawSession\.sessionKey\}\)\`\);/g,
    to: "logger.info('self-improvement/orchestrator', 'Agent spawned', { role: agentConfig.role, sessionKey: openClawSession.sessionKey });"
  },
  // Error spawning agent
  {
    from: /console\.log\(\`   ❌ \$\{errorMsg\}\`\);/g,
    to: "logger.error('self-improvement/orchestrator', 'Error spawning agent', { error: errorMsg });"
  },
  // Agents running
  {
    from: /console\.log\(\`   📋 Agents running: \$\{agents\.length\}\`\);/g,
    to: "logger.info('self-improvement/orchestrator', 'Agents running', { count: agents.length });"
  },
  // Cycle complete
  {
    from: /console\.log\(\`   ✅ \$\{area\} cycle complete: \$\{result\.changes\} agents, \$\$\$\{result\.budgetUsed\.toFixed\(2\)\} used\`\);/g,
    to: "logger.info('self-improvement/orchestrator', 'Improvement cycle complete', { area, changes: result.changes, budgetUsed: result.budgetUsed });"
  },
  // Recorded improvement
  {
    from: /console\.log\('   📝 Recorded improvement to learning system'\);/g,
    to: "logger.info('self-improvement/orchestrator', 'Recorded improvement to learning system');"
  },
  // Error message
  {
    from: /console\.log\(\`   ❌ \$\{errorMsg\}\`\);/g,
    to: "logger.error('self-improvement/orchestrator', 'Error', { error: errorMsg });"
  },
  // Budget exhausted stopping
  {
    from: /console\.log\(\`\\n⚠️  Budget exhausted, stopping improvements\`\);/g,
    to: "logger.warn('self-improvement/orchestrator', 'Budget exhausted, stopping improvements');"
  },
  // Budget exhausted after
  {
    from: /console\.log\(\`\\n⚠️  Budget exhausted after \$\{area\}\`\);/g,
    to: "logger.warn('self-improvement/orchestrator', 'Budget exhausted', { area });"
  },
  // Print report
  {
    from: /console\.log\(report\);/g,
    to: "logger.info('self-improvement/orchestrator', 'Self-improvement report', { report });"
  },
  // Print learning report
  {
    from: /console\.log\(learningReport\);/g,
    to: "logger.info('self-improvement/orchestrator', 'Learning report', { learningReport });"
  },
  // Session complete
  {
    from: /console\.log\('\\n✅ Self-improvement session complete'\);/g,
    to: "logger.info('self-improvement/orchestrator', 'Self-improvement session complete');"
  },
  // Learning data accumulated
  {
    from: /console\.log\('Learning data accumulated and available for future cycles'\);/g,
    to: "logger.info('self-improvement/orchestrator', 'Learning data accumulated');"
  },
  // Error polling agent
  {
    from: /console\.error\(\`\[Orchestrator\] Error polling agent \$\{agent\.agentId\}:\`, error\);/g,
    to: "logger.error('self-improvement/orchestrator', 'Error polling agent', { agentId: agent.agentId, error: String(error) });"
  }
];

let count = 0;
for (const { from, to } of replacements) {
  const matches = content.match(from);
  if (matches) {
    count += matches.length;
    content = content.replace(from, to);
  }
}

// Add logger import if not already present
if (!content.includes("import { logger } from '../utils';")) {
  content = content.replace(
    "import {\n  ImprovementStore,\n  ImprovementEntry,\n  getImprovementStore,\n} from '../integrations/openclaw/ImprovementStore';\nimport { logger } from '../utils';",
    "import {\n  ImprovementStore,\n  ImprovementEntry,\n  getImprovementStore,\n} from '../integrations/openclaw/ImprovementStore';\nimport { logger } from '../utils';"
  );
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log(`Replaced ${count} console.log statements in orchestrator.ts`);
