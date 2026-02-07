/**
 * State View Component
 * 
 * Dashboard component for visualizing agent states in real-time.
 * Provides WebSocket updates and interactive state management.
 */

import { EventEmitter } from 'events';

// ============================================================================
// TYPES
// ============================================================================

export interface StateViewConfig {
  apiUrl: string;
  wsUrl: string;
  refreshInterval: number;
}

export interface AgentStateInfo {
  id: string;
  name: string;
  state: string;
  status: string;
  load: number;
  model: string;
  lastActivity: Date;
}

export interface StateTransitionEvent {
  agentId: string;
  previous: string;
  current: string;
  timestamp: number;
}

// ============================================================================
// STATE VIEW COMPONENT
// ============================================================================

export class StateView extends EventEmitter {
  private config: StateViewConfig;
  private agents: Map<string, AgentStateInfo> = new Map();
  private transitionLog: StateTransitionEvent[] = [];
  private maxLogEntries = 50;

  constructor(config: Partial<StateViewConfig> = {}) {
    super();
    this.config = {
      apiUrl: config.apiUrl || 'http://localhost:7373',
      wsUrl: config.wsUrl || 'ws://localhost:7374',
      refreshInterval: config.refreshInterval || 2000
    };
  }

  // --------------------------------------------------------------------------
  // HTML RENDERING
  // --------------------------------------------------------------------------

  renderHTML(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent State Monitor</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 20px;
    }
    
    .header {
      margin-bottom: 24px;
    }
    
    .header h1 {
      font-size: 24px;
      color: #f8fafc;
      margin-bottom: 8px;
    }
    
    .header p {
      color: #94a3b8;
    }
    
    .state-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }
    
    .state-card {
      padding: 20px;
      border-radius: 12px;
      text-align: center;
      transition: transform 0.2s;
    }
    
    .state-card:hover {
      transform: translateY(-2px);
    }
    
    .state-card.idle {
      background: linear-gradient(135deg, #10b981, #059669);
    }
    
    .state-card.busy {
      background: linear-gradient(135deg, #f59e0b, #d97706);
    }
    
    .state-card.paused {
      background: linear-gradient(135deg, #3b82f6, #2563eb);
    }
    
    .state-card.error {
      background: linear-gradient(135deg, #ef4444, #dc2626);
    }
    
    .state-card.initializing {
      background: linear-gradient(135deg, #06b6d4, #0891b2);
    }
    
    .state-card.stopped {
      background: linear-gradient(135deg, #64748b, #475569);
    }
    
    .state-count {
      font-size: 36px;
      font-weight: bold;
      color: white;
      margin-bottom: 4px;
    }
    
    .state-label {
      color: rgba(255, 255, 255, 0.9);
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .sections {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 24px;
    }
    
    .section {
      background: #1e293b;
      border-radius: 12px;
      padding: 20px;
    }
    
    .section h2 {
      font-size: 16px;
      color: #f8fafc;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .agent-list {
      max-height: 400px;
      overflow-y: auto;
    }
    
    .agent-item {
      display: flex;
      align-items: center;
      padding: 12px;
      background: #334155;
      border-radius: 8px;
      margin-bottom: 8px;
      transition: background 0.2s;
    }
    
    .agent-item:hover {
      background: #475569;
    }
    
    .agent-status {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      margin-right: 12px;
      flex-shrink: 0;
    }
    
    .agent-status.idle { background: #10b981; }
    .agent-status.busy { background: #f59e0b; }
    .agent-status.paused { background: #3b82f6; }
    .agent-status.error { background: #ef4444; }
    .agent-status.initializing { background: #06b6d4; }
    .agent-status.stopped { background: #64748b; }
    .agent-status.created { background: #94a3b8; }
    
    .agent-info {
      flex: 1;
      min-width: 0;
    }
    
    .agent-id {
      font-weight: 500;
      color: #f8fafc;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .agent-meta {
      font-size: 12px;
      color: #94a3b8;
    }
    
    .agent-load {
      width: 60px;
      text-align: right;
    }
    
    .load-bar {
      height: 4px;
      background: #475569;
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 4px;
    }
    
    .load-fill {
      height: 100%;
      background: #3b82f6;
      transition: width 0.3s;
    }
    
    .load-text {
      font-size: 11px;
      color: #94a3b8;
    }
    
    .transition-log {
      max-height: 400px;
      overflow-y: auto;
    }
    
    .transition-item {
      display: flex;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid #334155;
      font-size: 13px;
    }
    
    .transition-time {
      color: #64748b;
      width: 60px;
      font-family: monospace;
    }
    
    .transition-agent {
      color: #94a3b8;
      width: 100px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .transition-arrow {
      color: #64748b;
      margin: 0 8px;
    }
    
    .transition-state {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
    }
    
    .transition-state.idle { background: rgba(16, 185, 129, 0.2); color: #10b981; }
    .transition-state.busy { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
    .transition-state.paused { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
    .transition-state.error { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
    .transition-state.initializing { background: rgba(6, 182, 212, 0.2); color: #06b6d4; }
    .transition-state.stopped { background: rgba(100, 116, 139, 0.2); color: #94a3b8; }
    
    .empty-state {
      text-align: center;
      padding: 40px;
      color: #64748b;
    }
    
    .pulse {
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    .refresh-indicator {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #64748b;
    }
    
    .refresh-indicator.active::before {
      content: '';
      width: 6px;
      height: 6px;
      background: #10b981;
      border-radius: 50%;
      animation: pulse 1.5s infinite;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 Agent State Monitor</h1>
    <p>Real-time visualization of agent states and transitions</p>
  </div>

  <div class="state-grid" id="state-grid">
    <div class="state-card idle">
      <div class="state-count" id="idle-count">0</div>
      <div class="state-label">Idle</div>
    </div>
    <div class="state-card busy">
      <div class="state-count" id="busy-count">0</div>
      <div class="state-label">Busy</div>
    </div>
    <div class="state-card paused">
      <div class="state-count" id="paused-count">0</div>
      <div class="state-label">Paused</div>
    </div>
    <div class="state-card error">
      <div class="state-count" id="error-count">0</div>
      <div class="state-label">Error</div>
    </div>
  </div>

  <div class="sections">
    <div class="section">
      <h2>
        🤖 Agents
        <span class="refresh-indicator active" id="refresh-indicator">Live</span>
      </h2>
      <div class="agent-list" id="agent-list">
        <div class="empty-state">Loading agents...</div>
      </div>
    </div>

    <div class="section">
      <h2>📜 Recent Transitions</h2>
      <div class="transition-log" id="transition-log">
        <div class="empty-state">Waiting for transitions...</div>
      </div>
    </div>
  </div>

  <script>
    const API_URL = '${this.config.apiUrl}';
    const REFRESH_INTERVAL = ${this.config.refreshInterval};
    
    let agents = [];
    let transitions = [];
    
    // State colors
    const stateColors = {
      idle: '#10b981',
      busy: '#f59e0b',
      paused: '#3b82f6',
      error: '#ef4444',
      initializing: '#06b6d4',
      stopped: '#64748b',
      created: '#94a3b8'
    };
    
    // Fetch agent states
    async function fetchStates() {
      try {
        const response = await fetch(\`\${API_URL}/api/agents/states\`);
        const data = await response.json();
        
        // Update state counts
        document.getElementById('idle-count').textContent = data.counts.idle || 0;
        document.getElementById('busy-count').textContent = data.counts.busy || 0;
        document.getElementById('paused-count').textContent = data.counts.paused || 0;
        document.getElementById('error-count').textContent = data.counts.error || 0;
        
        // Update agent list
        renderAgentList(data.agents);
        
        agents = data.agents;
      } catch (error) {
        console.error('Failed to fetch states:', error);
      }
    }
    
    // Render agent list
    function renderAgentList(agents) {
      const container = document.getElementById('agent-list');
      
      if (agents.length === 0) {
        container.innerHTML = '<div class="empty-state">No agents registered</div>';
        return;
      }
      
      container.innerHTML = agents.map(agent => \`
        <div class="agent-item" data-id="\${agent.id}">
          <div class="agent-status \${agent.state || 'created'}"></div>
          <div class="agent-info">
            <div class="agent-id">\${agent.id}</div>
            <div class="agent-meta">\${agent.model} • \${agent.name || 'Unnamed'}</div>
          </div>
          <div class="agent-load">
            <div class="load-bar">
              <div class="load-fill" style="width: \${(agent.load * 100)}%"></div>
            </div>
            <div class="load-text">\${Math.round(agent.load * 100)}%</div>
          </div>
        </div>
      \`).join('');
    }
    
    // Add transition to log
    function addTransition(transition) {
      transitions.unshift(transition);
      if (transitions.length > 50) {
        transitions.pop();
      }
      renderTransitions();
    }
    
    // Render transition log
    function renderTransitions() {
      const container = document.getElementById('transition-log');
      
      if (transitions.length === 0) {
        container.innerHTML = '<div class="empty-state">Waiting for transitions...</div>';
        return;
      }
      
      container.innerHTML = transitions.map(t => {
        const time = new Date(t.timestamp).toLocaleTimeString();
        return \`
          <div class="transition-item">
            <span class="transition-time">\${time}</span>
            <span class="transition-agent">\${t.agentId.slice(0, 8)}...</span>
            <span class="transition-state \${t.previous}">\${t.previous}</span>
            <span class="transition-arrow">→</span>
            <span class="transition-state \${t.current}">\${t.current}</span>
          </div>
        \`;
      }).join('');
    }
    
    // Connect to WebSocket for real-time updates
    function connectWebSocket() {
      const wsUrl = '${this.config.wsUrl}'.replace('http', 'ws');
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        document.getElementById('refresh-indicator').classList.add('active');
      };
      
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'state:changed') {
          addTransition(data);
          fetchStates(); // Refresh full state
        }
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        document.getElementById('refresh-indicator').classList.remove('active');
        setTimeout(connectWebSocket, 3000);
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    }
    
    // Initial load
    fetchStates();
    
    // Periodic refresh (fallback)
    setInterval(fetchStates, REFRESH_INTERVAL);
    
    // Try WebSocket connection
    if (window.WebSocket) {
      connectWebSocket();
    }
  </script>
</body>
</html>
    `;
  }

  // --------------------------------------------------------------------------
  // TERMINAL RENDERING
  // --------------------------------------------------------------------------

  renderTerminal(): string {
    const lines: string[] = [];
    
    lines.push('┌─────────────────────────────────────────────────────────────┐');
    lines.push('│                   📊 AGENT STATE MONITOR                    │');
    lines.push('└─────────────────────────────────────────────────────────────┘');
    lines.push('');

    // Count by state
    const counts: Record<string, number> = {};
    for (const agent of this.agents.values()) {
      counts[agent.state] = (counts[agent.state] || 0) + 1;
    }

    // State cards
    const states = ['idle', 'busy', 'paused', 'error'];
    const stateEmojis: Record<string, string> = {
      idle: '🟢',
      busy: '🟡',
      paused: '🔵',
      error: '🔴'
    };

    lines.push('State Distribution:');
    for (const state of states) {
      const count = counts[state] || 0;
      const bar = '█'.repeat(Math.min(count, 20));
      lines.push(`  ${stateEmojis[state] || '⚪'} ${state.padEnd(10)} ${bar} ${count}`);
    }
    lines.push('');

    // Agent list
    lines.push('Agents:');
    lines.push(`  ${'ID'.padEnd(24)} ${'State'.padEnd(10)} ${'Load'.padEnd(6)} Model`);
    lines.push('  ' + '─'.repeat(70));

    for (const agent of this.agents.values()) {
      const id = agent.id.slice(0, 22).padEnd(24);
      const state = agent.state.padEnd(10);
      const load = `${Math.round(agent.load * 100)}%`.padEnd(6);
      const model = agent.model.slice(0, 15);
      lines.push(`  ${id} ${state} ${load} ${model}`);
    }
    lines.push('');

    // Recent transitions
    lines.push('Recent Transitions:');
    if (this.transitionLog.length === 0) {
      lines.push('  (No transitions yet)');
    } else {
      for (const t of this.transitionLog.slice(-5)) {
        const time = new Date(t.timestamp).toLocaleTimeString();
        lines.push(`  ${time} ${t.agentId.slice(0, 16)}... ${t.previous} → ${t.current}`);
      }
    }

    return lines.join('\n');
  }

  // --------------------------------------------------------------------------
  // DATA MANAGEMENT
  // --------------------------------------------------------------------------

  updateAgent(agent: AgentStateInfo): void {
    const previous = this.agents.get(agent.id);
    this.agents.set(agent.id, agent);

    // Detect state change
    if (previous && previous.state !== agent.state) {
      this.addTransition({
        agentId: agent.id,
        previous: previous.state,
        current: agent.state,
        timestamp: Date.now()
      });
    }

    this.emit('agent:updated', agent);
  }

  removeAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.emit('agent:removed', { agentId });
  }

  private addTransition(transition: StateTransitionEvent): void {
    this.transitionLog.push(transition);
    if (this.transitionLog.length > this.maxLogEntries) {
      this.transitionLog.shift();
    }
    this.emit('transition', transition);
  }

  getAgents(): AgentStateInfo[] {
    return Array.from(this.agents.values());
  }

  getTransitions(): StateTransitionEvent[] {
    return [...this.transitionLog];
  }

  clear(): void {
    this.agents.clear();
    this.transitionLog = [];
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export function createStateView(config?: Partial<StateViewConfig>): StateView {
  return new StateView(config);
}
