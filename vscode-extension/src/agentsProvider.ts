import * as vscode from 'vscode';
import { GodelClient, Agent, Team } from './godelClient';

export class AgentsProvider implements vscode.TreeDataProvider<GodelItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<GodelItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private client: GodelClient) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: GodelItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: GodelItem): Promise<GodelItem[]> {
    if (!element) {
      // Root level - show categories
      return [
        new CategoryItem('Agents', 'agents'),
        new CategoryItem('Teams', 'teams')
      ];
    }

    if (element instanceof CategoryItem) {
      if (element.type === 'agents') {
        try {
          const agents = await this.client.listAgents();
          return agents.map(a => new AgentItem(a));
        } catch {
          return [new GodelItem('Error loading agents', vscode.TreeItemCollapsibleState.None)];
        }
      }

      if (element.type === 'teams') {
        try {
          const teams = await this.client.listTeams();
          return teams.map(t => new TeamItem(t));
        } catch {
          return [new GodelItem('Error loading teams', vscode.TreeItemCollapsibleState.None)];
        }
      }
    }

    return [];
  }
}

class GodelItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
  }
}

class CategoryItem extends GodelItem {
  constructor(label: string, public type: string) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = type === 'agents'
      ? new vscode.ThemeIcon('person')
      : new vscode.ThemeIcon('organization');
  }
}

class AgentItem extends GodelItem {
  constructor(public agent: Agent) {
    super(
      `${agent.label || agent.id} (${agent.role})`,
      vscode.TreeItemCollapsibleState.None
    );

    this.description = agent.status;
    this.tooltip = `ID: ${agent.id}\nRole: ${agent.role}\nStatus: ${agent.status}\nModel: ${agent.model}`;
    this.contextValue = 'agent';

    // Set icon based on status
    if (agent.status === 'running') {
      this.iconPath = new vscode.ThemeIcon('play-circle', new vscode.ThemeColor('testing.iconPassed'));
    } else if (agent.status === 'idle') {
      this.iconPath = new vscode.ThemeIcon('circle-outline');
    } else {
      this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
    }

    this.command = {
      command: 'godel.viewLogs',
      title: 'View Logs',
      arguments: [agent.id]
    };
  }
}

class TeamItem extends GodelItem {
  constructor(public team: Team) {
    super(team.name, vscode.TreeItemCollapsibleState.None);
    this.description = `${team.status} - ${team.agentCount} agents`;
    this.tooltip = `ID: ${team.id}\nName: ${team.name}\nStatus: ${team.status}\nAgents: ${team.agentCount}`;
    this.iconPath = new vscode.ThemeIcon('organization');
  }
}
