import * as vscode from 'vscode';
import { GodelClient } from './godelClient';
import { AgentsProvider } from './agentsProvider';
import { IntentInputBox } from './intentInput';

let godelClient: GodelClient;
let agentsProvider: AgentsProvider;
let refreshInterval: NodeJS.Timeout;

export function activate(context: vscode.ExtensionContext) {
  console.log('Godel extension activated');

  // Initialize client
  const config = vscode.workspace.getConfiguration('godel');
  godelClient = new GodelClient({
    serverUrl: config.get('serverUrl') || 'http://localhost:7373',
    apiKey: config.get('apiKey') || ''
  });

  // Check connection
  checkConnection();

  // Register tree data provider
  agentsProvider = new AgentsProvider(godelClient);
  vscode.window.registerTreeDataProvider('godelAgents', agentsProvider);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('godel.spawnAgent', spawnAgent),
    vscode.commands.registerCommand('godel.createTeam', createTeam),
    vscode.commands.registerCommand('godel.executeIntent', executeIntent),
    vscode.commands.registerCommand('godel.showDashboard', showDashboard),
    vscode.commands.registerCommand('godel.refreshTree', () => agentsProvider.refresh()),
    vscode.commands.registerCommand('godel.viewLogs', viewLogs),
    vscode.commands.registerCommand('godel.killAgent', killAgent),
    vscode.commands.registerCommand('godel.configure', configure),
    vscode.commands.registerCommand('godel.quickPick', quickPick)
  );

  // Setup auto-refresh
  setupAutoRefresh(config);

  // Listen for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('godel')) {
        const newConfig = vscode.workspace.getConfiguration('godel');
        godelClient.updateConfig({
          serverUrl: newConfig.get('serverUrl') || 'http://localhost:7373',
          apiKey: newConfig.get('apiKey') || ''
        });
        checkConnection();
        setupAutoRefresh(newConfig);
      }
    })
  );
}

export function deactivate() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
}

async function checkConnection() {
  try {
    await godelClient.health();
    vscode.commands.executeCommand('setContext', 'godel.connected', true);
  } catch {
    vscode.commands.executeCommand('setContext', 'godel.connected', false);
  }
}

function setupAutoRefresh(config: vscode.Configuration) {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  if (config.get('autoRefresh')) {
    const interval = (config.get('refreshInterval') as number) * 1000;
    refreshInterval = setInterval(() => {
      agentsProvider.refresh();
    }, interval);
  }
}

async function spawnAgent() {
  const model = await vscode.window.showQuickPick([
    { label: 'Claude Sonnet 4.5', value: 'claude-sonnet-4-5' },
    { label: 'Claude Opus 4', value: 'claude-opus-4' },
    { label: 'GPT-4o', value: 'gpt-4o' },
    { label: 'Gemini 1.5 Pro', value: 'gemini-1.5-pro' }
  ], { placeHolder: 'Select model' });

  if (!model) return;

  const role = await vscode.window.showQuickPick([
    { label: 'Worker', value: 'worker' },
    { label: 'Coordinator', value: 'coordinator' },
    { label: 'Reviewer', value: 'reviewer' }
  ], { placeHolder: 'Select role' });

  if (!role) return;

  const label = await vscode.window.showInputBox({
    prompt: 'Agent label (optional)',
    placeHolder: 'my-agent'
  });

  try {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Spawning agent...'
    }, async () => {
      const agent = await godelClient.spawnAgent({
        model: model.value,
        role: role.value,
        label
      });
      vscode.window.showInformationMessage(`Agent spawned: ${agent.id}`);
      agentsProvider.refresh();
    });
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to spawn agent: ${error}`);
  }
}

async function createTeam() {
  const name = await vscode.window.showInputBox({
    prompt: 'Team name',
    validateInput: (value) => value ? null : 'Name is required'
  });

  if (!name) return;

  const strategy = await vscode.window.showQuickPick([
    { label: 'Parallel', value: 'parallel' },
    { label: 'Map-Reduce', value: 'map-reduce' },
    { label: 'Pipeline', value: 'pipeline' }
  ], { placeHolder: 'Select strategy' });

  if (!strategy) return;

  const workers = await vscode.window.showInputBox({
    prompt: 'Number of workers',
    value: '3',
    validateInput: (value) => {
      const num = parseInt(value);
      return num > 0 && num <= 20 ? null : 'Enter 1-20';
    }
  });

  if (!workers) return;

  try {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Creating team...'
    }, async () => {
      const team = await godelClient.createTeam({
        name,
        strategy: strategy.value,
        workers: parseInt(workers)
      });
      vscode.window.showInformationMessage(`Team created: ${team.id}`);
      agentsProvider.refresh();
    });
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to create team: ${error}`);
  }
}

async function executeIntent() {
  const intent = await IntentInputBox.show();
  if (!intent) return;

  try {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Executing intent...',
      cancellable: true
    }, async (progress, token) => {
      const result = await godelClient.executeIntent({
        description: intent,
        onProgress: (update) => {
          progress.report({ message: update.message });
        }
      });

      if (token.isCancellationRequested) {
        await godelClient.cancelIntent(result.id);
        return;
      }

      vscode.window.showInformationMessage(`Intent executed: ${result.id}`);
    });
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to execute intent: ${error}`);
  }
}

async function showDashboard() {
  const config = vscode.workspace.getConfiguration('godel');
  const serverUrl = config.get('serverUrl') as string;
  vscode.env.openExternal(vscode.Uri.parse(`${serverUrl}/dashboard`));
}

async function viewLogs(agentId: string) {
  const outputChannel = vscode.window.createOutputChannel(`Godel: ${agentId}`);
  outputChannel.show();

  try {
    const logs = await godelClient.getAgentLogs(agentId, 50);
    outputChannel.appendLine(logs);

    // Stream new logs
    const stream = godelClient.streamAgentLogs(agentId);
    stream.on('log', (line: string) => {
      outputChannel.appendLine(line);
    });
  } catch (error) {
    outputChannel.appendLine(`Error: ${error}`);
  }
}

async function killAgent(agentId: string) {
  const confirmed = await vscode.window.showWarningMessage(
    `Kill agent ${agentId}?`,
    { modal: true },
    'Kill'
  );

  if (confirmed !== 'Kill') return;

  try {
    await godelClient.killAgent(agentId);
    vscode.window.showInformationMessage(`Agent ${agentId} killed`);
    agentsProvider.refresh();
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to kill agent: ${error}`);
  }
}

async function configure() {
  const config = vscode.workspace.getConfiguration('godel');

  const serverUrl = await vscode.window.showInputBox({
    prompt: 'Godel server URL',
    value: config.get('serverUrl') as string
  });

  if (serverUrl) {
    await config.update('serverUrl', serverUrl, true);
  }

  const apiKey = await vscode.window.showInputBox({
    prompt: 'API Key',
    value: config.get('apiKey') as string,
    password: true
  });

  if (apiKey !== undefined) {
    await config.update('apiKey', apiKey, true);
  }
}

async function quickPick() {
  const action = await vscode.window.showQuickPick([
    { label: '$(add) Spawn Agent', command: 'godel.spawnAgent' },
    { label: '$(organization) Create Team', command: 'godel.createTeam' },
    { label: '$(play) Execute Intent', command: 'godel.executeIntent' },
    { label: '$(dashboard) Open Dashboard', command: 'godel.showDashboard' },
    { label: '$(refresh) Refresh', command: 'godel.refreshTree' }
  ], { placeHolder: 'Select action' });

  if (action) {
    vscode.commands.executeCommand(action.command);
  }
}
