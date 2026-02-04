# Dash Dashboard UI

Real-time React dashboard for the Dash Agent Orchestration Platform.

## Features

- **Real-time Monitoring**: Live agent status, event streams, and metrics via WebSocket
- **Hierarchical Views**: Swarm → Agent → Task drill-down navigation
- **Operational Controls**: Start/stop/scale swarms, kill/restart agents
- **Cost Tracking**: Real-time cost monitoring and budget alerts
- **Mobile Responsive**: Works on desktop, tablet, and mobile devices
- **Authentication**: Token-based auth with read-only and admin roles

## Quick Start

```bash
# Install dependencies
cd src/dashboard/ui
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:7373` |
| `VITE_WS_URL` | WebSocket URL | `ws://localhost:7373/ws` |

## Project Structure

```
src/
├── components/      # Reusable UI components
│   ├── Layout.tsx  # Layout (Sidebar, Header, etc.)
│   └── ...
├── contexts/       # State management
│   └── store.ts   # Zustand stores
├── pages/          # Page components
│   ├── Dashboard.tsx
│   ├── Swarms.tsx
│   ├── Agents.tsx
│   ├── Events.tsx
│   ├── Costs.tsx
│   ├── Settings.tsx
│   └── Login.tsx
├── services/       # API and WebSocket
│   ├── api.ts
│   └── websocket.ts
├── types/          # TypeScript definitions
│   └── index.ts
├── utils/          # Utility functions
│   └── index.ts
├── App.tsx         # Main app component
└── main.tsx        # Entry point
```

## Key Components

### Dashboard Page (`/`)
- Real-time stats (agents, swarms, costs, events/sec)
- Agent status pie chart
- Live event stream
- Cost over time chart
- Swarm activity bar chart

### Swarms Page (`/swarms`)
- List all swarms with filtering
- Expand/collapse for agent details
- Start/stop/pause controls
- Scale swarm up/down
- Create new swarm modal

### Agents Page (`/agents`)
- Grid/list view of all agents
- Filter by status, swarm, search
- Agent detail panel with tabs:
  - Overview (status, model, cost, tokens)
  - Logs (terminal-style log output)
  - Trace (Jaeger integration link)

### Events Page (`/events`)
- Real-time event stream
- Filter by type/source
- Expand for event details
- Event type statistics

### Costs Page (`/costs`)
- Total spent, hourly rate, burn rate
- Cost over time chart
- Cost by model pie chart
- Budget warnings

### Settings Page (`/settings`)
- Profile management
- Security settings (admin only)
- Notification preferences
- Theme and display preferences

## WebSocket Events

| Event Type | Description |
|------------|-------------|
| `connected` | WebSocket connected |
| `event` | New system event |
| `agent_update` | Agent status changed |
| `swarm_update` | Swarm status changed |
| `budget_update` | Cost metrics updated |
| `heartbeat` | Keep-alive ping |

## Authentication

The dashboard uses simple token-based authentication:

1. User logs in with username/password
2. Server returns JWT token
3. Token stored in localStorage
4. Token sent with API requests (Bearer auth)
5. Token expiration handled automatically

### Roles

- **readonly**: View dashboard, no operational controls
- **admin**: Full access including create/destroy operations

## PWA Support

The dashboard includes PWA (Progressive Web App) support:
- Install on mobile/desktop
- Offline capable
- Push notifications (configurable)

## API Integration

The dashboard integrates with the Dash REST API:

```typescript
// Example API calls
import { api } from './services/api';

// List swarms
const swarms = await api.swarms.list();

// Scale a swarm
await api.swarms.scale('swarm-123', 20);

// Get agent logs
const logs = await api.agents.getLogs('agent-456');
```

## Development

```bash
# Run with hot reload
npm run dev

# Type checking
npm run typecheck

# Linting
npm run lint

# Run tests
npm run test
```

## Build

```bash
# Production build
npm run build

# Preview production build
npm run preview
```

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Dependencies

- React 18
- React Router 6
- Zustand (state)
- TanStack Query (data fetching)
- Recharts (charts)
- Vite (build)
- Tailwind CSS (styling)
- Lucide React (icons)

## License

MIT
