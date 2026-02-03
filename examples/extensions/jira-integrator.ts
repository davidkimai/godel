/**
 * Jira Integrator Extension for Dash
 * 
 * Integrates with Jira to create tickets, update issues, and track agent work.
 * 
 * Configuration:
 * - JIRA_BASE_URL: Your Jira instance URL
 * - JIRA_API_TOKEN: API token for authentication
 * - JIRA_EMAIL: Email associated with the API token
 * 
 * Usage:
 * 1. Copy to ~/.dash/extensions/jira-integrator.ts
 * 2. Configure credentials
 * 3. Use /jira commands or tools
 */

import { Type } from '@sinclair/typebox';
import type { ExtensionAPI, ExtensionContext } from '../../src/core/extension-api';

export default function jiraIntegratorExtension(api: ExtensionAPI, ctx: ExtensionContext) {
  // Configuration keys
  const CONFIG_KEYS = {
    baseUrl: 'baseUrl',
    apiToken: 'apiToken',
    email: 'email',
    defaultProject: 'defaultProject',
  };
  
  /**
   * Get Jira configuration
   */
  function getConfig() {
    return {
      baseUrl: api.getConfig<string>(CONFIG_KEYS.baseUrl, process.env.JIRA_BASE_URL || ''),
      apiToken: api.getConfig<string>(CONFIG_KEYS.apiToken, process.env.JIRA_API_TOKEN || ''),
      email: api.getConfig<string>(CONFIG_KEYS.email, process.env.JIRA_EMAIL || ''),
      defaultProject: api.getConfig<string>(CONFIG_KEYS.defaultProject, ''),
    };
  }
  
  /**
   * Make authenticated request to Jira API
   */
  async function jiraRequest(endpoint: string, options: RequestInit = {}) {
    const config = getConfig();
    
    if (!config.baseUrl || !config.apiToken || !config.email) {
      throw new Error('Jira not configured. Use /jira-config or set environment variables.');
    }
    
    const url = `${config.baseUrl}/rest/api/2${endpoint}`;
    const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
      },
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Jira API error (${response.status}): ${text}`);
    }
    
    return response.json();
  }
  
  // Register tool to create Jira issues
  api.registerTool({
    name: 'jira_create_issue',
    description: 'Create a new Jira issue',
    parameters: Type.Object({
      project: Type.String({ description: 'Project key (e.g., PROJ)' }),
      summary: Type.String({ description: 'Issue summary/title' }),
      description: Type.String({ description: 'Issue description' }),
      issueType: Type.String({ description: 'Issue type', default: 'Task' }),
      priority: Type.Optional(Type.String({ description: 'Priority (Highest, High, Medium, Low, Lowest)' })),
      labels: Type.Optional(Type.Array(Type.String(), { description: 'Labels to apply' })),
    }),
    permissions: ['net:write'],
    async execute(toolCallId, params, ctx) {
      try {
        const config = getConfig();
        const projectKey = params.project || config.defaultProject;
        
        if (!projectKey) {
          return {
            content: 'Project key required. Provide in params or set default project.',
            isError: true,
          };
        }
        
        const issueData = {
          fields: {
            project: { key: projectKey },
            summary: params.summary,
            description: params.description,
            issuetype: { name: params.issueType },
            ...(params.priority && { priority: { name: params.priority } }),
            ...(params.labels && { labels: params.labels }),
          },
        };
        
        const result = await jiraRequest('/issue', {
          method: 'POST',
          body: JSON.stringify(issueData),
        });
        
        return {
          content: `✅ Created Jira issue: ${result.key}`,
          isError: false,
          details: {
            issueKey: result.key,
            issueId: result.id,
            self: result.self,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: `Failed to create Jira issue: ${message}`,
          isError: true,
        };
      }
    },
  });
  
  // Register tool to update Jira issues
  api.registerTool({
    name: 'jira_update_issue',
    description: 'Update an existing Jira issue',
    parameters: Type.Object({
      issueKey: Type.String({ description: 'Issue key (e.g., PROJ-123)' }),
      summary: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      status: Type.Optional(Type.String({ description: 'New status' })),
      comment: Type.Optional(Type.String({ description: 'Add a comment' })),
    }),
    permissions: ['net:write'],
    async execute(toolCallId, params, ctx) {
      try {
        // Update fields if provided
        const fields: Record<string, unknown> = {};
        if (params.summary) fields.summary = params.summary;
        if (params.description) fields.description = params.description;
        
        if (Object.keys(fields).length > 0) {
          await jiraRequest(`/issue/${params.issueKey}`, {
            method: 'PUT',
            body: JSON.stringify({ fields }),
          });
        }
        
        // Add comment if provided
        if (params.comment) {
          await jiraRequest(`/issue/${params.issueKey}/comment`, {
            method: 'POST',
            body: JSON.stringify({ body: params.comment }),
          });
        }
        
        return {
          content: `✅ Updated Jira issue: ${params.issueKey}`,
          isError: false,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: `Failed to update Jira issue: ${message}`,
          isError: true,
        };
      }
    },
  });
  
  // Register tool to search Jira issues
  api.registerTool({
    name: 'jira_search',
    description: 'Search for Jira issues using JQL',
    parameters: Type.Object({
      jql: Type.String({ description: 'JQL query string' }),
      maxResults: Type.Number({ description: 'Maximum results', default: 10 }),
    }),
    permissions: ['net:read'],
    async execute(toolCallId, params, ctx) {
      try {
        const queryParams = new URLSearchParams({
          jql: params.jql,
          maxResults: String(params.maxResults),
        });
        
        const result = await jiraRequest(`/search?${queryParams.toString()}`);
        
        const issues = result.issues.map((issue: any) => ({
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status?.name,
          assignee: issue.fields.assignee?.displayName || 'Unassigned',
          priority: issue.fields.priority?.name,
        }));
        
        return {
          content: `Found ${result.total} issues:\n${issues.map((i: any) => 
            `- ${i.key}: ${i.summary} [${i.status}]`
          ).join('\n')}`,
          isError: false,
          details: { issues, total: result.total },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: `Failed to search Jira: ${message}`,
          isError: true,
        };
      }
    },
  });
  
  // Register configuration command
  api.registerCommand('jira-config', {
    description: 'Configure Jira integration',
    args: '[--url <url>] [--token <token>] [--email <email>] [--project <project>]',
    async handler(args, ctx) {
      const flags: Record<string, string> = {};
      
      // Parse simple flags
      const matches = args.matchAll(/--(\w+)\s+([^\s]+)/g);
      for (const match of matches) {
        flags[match[1]] = match[2];
      }
      
      if (flags.url) {
        api.setConfig(CONFIG_KEYS.baseUrl, flags.url);
        ctx.logger.info(`Jira URL set: ${flags.url}`);
      }
      
      if (flags.token) {
        api.setConfig(CONFIG_KEYS.apiToken, flags.token);
        ctx.logger.info('API token set');
      }
      
      if (flags.email) {
        api.setConfig(CONFIG_KEYS.email, flags.email);
        ctx.logger.info(`Email set: ${flags.email}`);
      }
      
      if (flags.project) {
        api.setConfig(CONFIG_KEYS.defaultProject, flags.project);
        ctx.logger.info(`Default project set: ${flags.project}`);
      }
      
      // Show current config
      const config = getConfig();
      ctx.logger.info('Current Jira configuration:');
      ctx.logger.info(`  URL: ${config.baseUrl || '(not set)'}`);
      ctx.logger.info(`  Email: ${config.email || '(not set)'}`);
      ctx.logger.info(`  Token: ${config.apiToken ? '(set)' : '(not set)'}`);
      ctx.logger.info(`  Default Project: ${config.defaultProject || '(not set)'}`);
    },
  });
  
  // Register command to create issue from agent task
  api.registerCommand('jira-task', {
    description: 'Create a Jira issue from the current agent task',
    args: '<summary> [description]',
    async handler(args, ctx) {
      const [summary, ...descParts] = args.split(' ');
      const description = descParts.join(' ') || `Created from Dash agent task`;
      
      if (!summary) {
        ctx.logger.error('Usage: /jira-task <summary> [description]');
        return;
      }
      
      const config = getConfig();
      if (!config.defaultProject) {
        ctx.logger.error('Default project not set. Use /jira-config --project <key>');
        return;
      }
      
      try {
        const result = await jiraRequest('/issue', {
          method: 'POST',
          body: JSON.stringify({
            fields: {
              project: { key: config.defaultProject },
              summary,
              description,
              issuetype: { name: 'Task' },
            },
          }),
        });
        
        ctx.notify(`Created Jira issue: ${result.key}`, 'info');
        ctx.logger.info(`Issue URL: ${config.baseUrl}/browse/${result.key}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.notify(`Failed to create issue: ${message}`, 'error');
      }
    },
  });
  
  // Listen for agent completion and optionally create issues
  api.on('agent_complete', async (event) => {
    // Could auto-create issues for failed tasks
    // This is a placeholder for custom logic
    api.log('debug', `Agent ${event.agentId} completed - Jira integration active`);
  });
  
  api.log('info', 'Jira integrator extension loaded');
}
