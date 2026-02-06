/**
 * Slack Notifier Extension for Godel
 * 
 * Sends notifications to Slack when agents complete tasks or encounter errors.
 * 
 * Configuration:
 * - Set SLACK_WEBHOOK_URL environment variable or use setConfig
 * 
 * Usage:
 * 1. Copy to ~/.godel/extensions/slack-notifier.ts
 * 2. Set your Slack webhook URL
 * 3. Restart Godel or wait for hot reload
 */

import { Type } from '@sinclair/typebox';
import type { ExtensionAPI, ExtensionContext } from '../../src/core/extension-api';

export default function slackNotifierExtension(api: ExtensionAPI, ctx: ExtensionContext) {
  // Configuration key for Slack webhook
  const WEBHOOK_CONFIG_KEY = 'webhookUrl';
  
  // Register a tool to send Slack notifications
  api.registerTool({
    name: 'slack_notify',
    description: 'Send a notification to Slack',
    parameters: Type.Object({
      message: Type.String({ description: 'Message to send' }),
      channel: Type.Optional(Type.String({ description: 'Channel override (optional)' })),
      username: Type.Optional(Type.String({ description: 'Bot username', default: 'Godel' })),
    }),
    permissions: ['net:write'],
    async execute(toolCallId, params, ctx) {
      const webhookUrl = api.getConfig<string>(WEBHOOK_CONFIG_KEY);
      
      if (!webhookUrl) {
        return {
          content: 'Slack webhook URL not configured. Set slack-notifier.webhookUrl config.',
          isError: true,
        };
      }
      
      try {
        const payload = {
          text: params.message,
          username: params.username || 'Godel',
          channel: params.channel,
        };
        
        // Check network permission
        if (!ctx.hasPermission('net:write')) {
          return {
            content: 'Permission denied: net:write required to send Slack notifications',
            isError: true,
          };
        }
        
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        return {
          content: `✅ Notification sent to Slack${params.channel ? ` (${params.channel})` : ''}`,
          isError: false,
          details: { sentAt: new Date().toISOString() },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: `Failed to send Slack notification: ${message}`,
          isError: true,
        };
      }
    },
  });
  
  // Register a command to configure the webhook
  api.registerCommand('slack-config', {
    description: 'Configure Slack webhook URL',
    args: '<webhook-url>',
    async handler(args, ctx) {
      const webhookUrl = args.trim();
      
      if (!webhookUrl) {
        ctx.logger.error('Usage: /slack-config <webhook-url>');
        return;
      }
      
      if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
        ctx.logger.error('Invalid Slack webhook URL');
        return;
      }
      
      api.setConfig(WEBHOOK_CONFIG_KEY, webhookUrl);
      ctx.logger.info('Slack webhook URL configured successfully');
      ctx.notify('Slack configuration saved', 'info');
    },
  });
  
  // Register a command to test the webhook
  api.registerCommand('slack-test', {
    description: 'Test Slack webhook configuration',
    async handler(_args, ctx) {
      const webhookUrl = api.getConfig<string>(WEBHOOK_CONFIG_KEY);
      
      if (!webhookUrl) {
        ctx.logger.error('Slack webhook not configured. Use /slack-config first.');
        return;
      }
      
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: '🔔 Test notification from Godel!' }),
        });
        
        if (response.ok) {
          ctx.notify('Test notification sent successfully', 'info');
        } else {
          ctx.notify(`Test failed: ${response.statusText}`, 'error');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.notify(`Test failed: ${message}`, 'error');
      }
    },
  });
  
  // Listen for agent completion events and send notifications
  api.on('agent_complete', async (event) => {
    const webhookUrl = api.getConfig<string>(WEBHOOK_CONFIG_KEY);
    if (!webhookUrl) return;
    
    const { agentId, result, duration } = event;
    const durationSec = (duration / 1000).toFixed(1);
    
    // Only notify on errors or if result contains 'error'
    const resultStr = JSON.stringify(result).toLowerCase();
    if (resultStr.includes('error') || resultStr.includes('fail')) {
      const message = `⚠️ Agent ${agentId} completed with issues in ${durationSec}s`;
      
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            text: message,
            attachments: [{
              color: 'warning',
              text: `Result: ${JSON.stringify(result).slice(0, 500)}`,
            }]
          }),
        });
      } catch (error) {
        api.log('error', `Failed to send Slack notification: ${error}`);
      }
    }
  });
  
  // Listen for agent errors
  api.on('agent_error', async (event) => {
    const webhookUrl = api.getConfig<string>(WEBHOOK_CONFIG_KEY);
    if (!webhookUrl) return;
    
    const { agentId, error } = event;
    const message = `🚨 Agent ${agentId} encountered an error: ${error}`;
    
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: message,
          username: 'Godel - Error Alert',
        }),
      });
    } catch (err) {
      api.log('error', `Failed to send error notification: ${err}`);
    }
  });
  
  api.log('info', 'Slack notifier extension loaded');
}
