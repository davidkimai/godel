# Godel Dashboard - Cerebral Cortex

A real-time React dashboard for visualizing the Godel agent swarm.

## Features

### 🌳 Session Tree Visualization
- D3.js-powered hierarchical tree view
- Real-time status indicators (color-coded)
- Collapsible/expandable nodes
- Click to view session details
- Zoom and pan support

### 🏥 Federation Health Grid
- Visual grid showing all agents
- Real-time state (idle/busy/paused/error)
- Current task display
- Load percentage visualization
- Health score indicators

### 📊 Metrics Charts
- Task completion rate (line chart)
- Agent utilization (bar chart)
- Queue depth (area chart)
- Error rate with threshold alerts
- Cost per hour analysis
- Built with Recharts

### 📡 Live Event Stream
- Real-time scrolling event feed
- Color-coded by severity
- Filter by type (agent, task, swarm, error)
- Search functionality
- Pause/resume stream
- Virtualized list for performance

### 🔄 Workflow Visualizer
- Interactive DAG visualization
- React Flow integration
- Highlight current execution path
- Real-time progress on nodes
- Click for node details

### 🚨 Alert Panel
- Active alerts and notifications
- Severity levels (info, warning, error, critical)
- Acknowledge/dismiss functionality
- Threshold configuration
- Notification channels

### 🎨 UI/UX
- Dark mode design
- Responsive layout
- Collapsible sidebar
- Connection status indicator
- Loading states

## Architecture

```
dashboard/
├── src/
│   ├── components/
│   │   ├── SessionTree/          # D3 tree visualization
│   │   ├── FederationHealth/     # Agent grid
│   │   ├── MetricsCharts/        # Recharts components
│   │   ├── EventStream/          # Live event feed
│   │   ├── WorkflowVisualizer/   # React Flow DAG
│   │   ├── AlertPanel/           # Alert management
│   │   └── Layout/               # Dashboard layout
│   ├── hooks/
│   │   ├── useWebSocket.ts       # Real-time hooks
│   │   └── useMetrics.ts         # Metrics hooks
│   ├── services/
│   │   ├── api.ts                # REST API client
│   │   └── websocket.ts          # WebSocket client
│   ├── pages/
│   │   ├── Dashboard.tsx         # Main dashboard
│   │   ├── Sessions.tsx          # Session tree page
│   │   ├── Agents.tsx            # Federation health
│   │   ├── Metrics.tsx           # Analytics
│   │   ├── Workflows.tsx         # Workflow visualizer
│   │   ├── Alerts.tsx            # Alert management
│   │   └── Settings.tsx          # Configuration
│   ├── types/
│   │   └── index.ts              # TypeScript types
│   ├── contexts/
│   │   └── store.ts              # State management
│   ├── utils/
│   │   └── index.ts              # Utilities
│   ├── App.tsx                   # App entry
│   ├── main.tsx                  # Main entry
│   └── index.css                 # Global styles
├── public/
└── package.json
```

## Tech Stack

- **Framework**: React 18 + TypeScript
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Tree Visualization**: D3.js
- **Workflow**: React Flow
- **State**: Zustand
- **Data Fetching**: React Query + TanStack Virtual
- **Build Tool**: Vite

## Installation

```bash
cd /Users/jasontang/clawd/projects/godel/src/dashboard/ui
npm install
```

## Development

```bash
npm run dev
```

The dashboard will be available at `http://localhost:5173`

## Build

```bash
npm run build
```

## WebSocket Protocol

The dashboard connects to the Godel backend via WebSocket for real-time updates:

### Connection
```
ws://localhost:7373/events
```

### Message Types
- `AGENT_UPDATE` - Agent state changes
- `SWARM_UPDATE` - Swarm state changes
- `EVENT` - System events
- `BUDGET_UPDATE` - Cost/budget updates
- `HEARTBEAT` - Connection keepalive

### Subscription Pattern
```typescript
// Subscribe to specific events
ws.send(JSON.stringify({
  action: 'subscribe',
  patterns: ['agent:*', 'task:*', 'swarm:*']
}));
```

## API Endpoints

The dashboard uses the Godel REST API:

- `GET /api/swarms` - List swarms
- `GET /api/agents` - List agents
- `GET /api/metrics/dashboard` - Dashboard stats
- `GET /api/metrics/cost` - Cost metrics
- `GET /api/bus/events` - Event stream

## Environment Variables

```env
VITE_API_URL=http://localhost:7373
VITE_WS_URL=ws://localhost:7373/events
VITE_API_PREFIX=/api/v1
```

## Customization

### Adding New Charts

```typescript
// components/MetricsCharts/MyChart.tsx
import { LineChart, Line, XAxis, YAxis } from 'recharts';

export const MyChart: React.FC = () => {
  const { data } = useMyMetric();
  
  return (
    <LineChart data={data}>
      <XAxis dataKey="timestamp" />
      <YAxis />
      <Line type="monotone" dataKey="value" stroke="#3b82f6" />
    </LineChart>
  );
};
```

### Adding New Pages

1. Create page component in `src/pages/`
2. Add route in `App.tsx`
3. Add nav item in `DashboardLayout.tsx`

## Performance

- Virtualized lists for large datasets
- Debounced search inputs
- Lazy-loaded pages
- Optimized re-renders with React.memo
- WebSocket connection pooling

## Testing

```bash
npm run test        # Run unit tests
npm run test:ui     # Run with UI
npm run typecheck   # Type checking
```

## License

MIT
