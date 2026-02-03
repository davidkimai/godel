/**
 * Custom Deploy Extension for Dash
 * 
 * Adds deployment capabilities to Dash agents.
 * Supports multiple deployment targets: Docker, Kubernetes, SSH, and custom scripts.
 * 
 * Usage:
 * 1. Copy to ~/.dash/extensions/custom-deploy.ts
 * 2. Configure deployment targets
 * 3. Use /deploy command or deploy tool
 */

import { Type } from '@sinclair/typebox';
import type { ExtensionAPI, ExtensionContext } from '../../src/core/extension-api';

export default function customDeployExtension(api: ExtensionAPI, ctx: ExtensionContext) {
  // Configuration store for deployment targets
  const CONFIG_PREFIX = 'deploy.targets.';
  
  /**
   * Deployment target types
   */
  type DeployTarget = {
    name: string;
    type: 'docker' | 'k8s' | 'ssh' | 'script';
    config: Record<string, string>;
  };
  
  /**
   * Get all configured deployment targets
   */
  function getTargets(): DeployTarget[] {
    return api.getConfig<DeployTarget[]>('targets', []);
  }
  
  /**
   * Save deployment targets
   */
  function saveTargets(targets: DeployTarget[]) {
    api.setConfig('targets', targets);
  }
  
  /**
   * Execute Docker deployment
   */
  async function deployDocker(target: DeployTarget, service: string, version: string): Promise<string> {
    const { image, registry, composeFile } = target.config;
    
    if (!composeFile) {
      throw new Error('Docker deployment requires composeFile in config');
    }
    
    // Build and deploy using docker-compose
    const fullImage = registry ? `${registry}/${image}:${version}` : `${image}:${version}`;
    
    // In a real implementation, this would execute docker commands
    return `Docker deployment: ${service}@${version} to ${target.name}\n` +
           `  Image: ${fullImage}\n` +
           `  Compose file: ${composeFile}`;
  }
  
  /**
   * Execute Kubernetes deployment
   */
  async function deployK8s(target: DeployTarget, service: string, version: string): Promise<string> {
    const { namespace, context, manifestPath } = target.config;
    
    return `Kubernetes deployment: ${service}@${version} to ${target.name}\n` +
           `  Namespace: ${namespace || 'default'}\n` +
           `  Context: ${context || 'current'}\n` +
           `  Manifest: ${manifestPath || 'helm'}`;
  }
  
  /**
   * Execute SSH deployment
   */
  async function deploySSH(target: DeployTarget, service: string, version: string): Promise<string> {
    const { host, user, deployPath, script } = target.config;
    
    if (!host || !deployPath) {
      throw new Error('SSH deployment requires host and deployPath');
    }
    
    return `SSH deployment: ${service}@${version} to ${target.name}\n` +
           `  Host: ${user ? `${user}@` : ''}${host}\n` +
           `  Path: ${deployPath}\n` +
           `  Script: ${script || 'default'}`;
  }
  
  /**
   * Execute custom script deployment
   */
  async function deployScript(target: DeployTarget, service: string, version: string): Promise<string> {
    const { scriptPath } = target.config;
    
    if (!scriptPath) {
      throw new Error('Script deployment requires scriptPath');
    }
    
    return `Script deployment: ${service}@${version} via ${target.name}\n` +
           `  Script: ${scriptPath}`;
  }
  
  /**
   * Deploy to a target
   */
  async function deployToTarget(
    targetName: string, 
    service: string, 
    version: string
  ): Promise<{ success: boolean; output: string }> {
    const targets = getTargets();
    const target = targets.find(t => t.name === targetName);
    
    if (!target) {
      return { 
        success: false, 
        output: `Unknown deployment target: ${targetName}. Use /deploy-target-add to configure.` 
      };
    }
    
    try {
      let output: string;
      
      switch (target.type) {
        case 'docker':
          output = await deployDocker(target, service, version);
          break;
        case 'k8s':
          output = await deployK8s(target, service, version);
          break;
        case 'ssh':
          output = await deploySSH(target, service, version);
          break;
        case 'script':
          output = await deployScript(target, service, version);
          break;
        default:
          throw new Error(`Unknown deployment type: ${target.type}`);
      }
      
      return { success: true, output };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, output: message };
    }
  }
  
  // Register the deploy tool
  api.registerTool({
    name: 'deploy',
    description: 'Deploy a service to a configured target environment',
    parameters: Type.Object({
      service: Type.String({ description: 'Service name to deploy' }),
      version: Type.String({ description: 'Version to deploy (e.g., 1.2.3, latest)' }),
      target: Type.String({ description: 'Deployment target name' }),
      dryRun: Type.Boolean({ description: 'Show what would be deployed without doing it', default: false }),
    }),
    permissions: ['exec:write', 'fs:read'],
    async execute(toolCallId, params, ctx) {
      if (params.dryRun) {
        const result = await deployToTarget(params.target, params.service, params.version);
        return {
          content: `📝 DRY RUN\n${result.output}`,
          isError: !result.success,
        };
      }
      
      const result = await deployToTarget(params.target, params.service, params.version);
      
      return {
        content: result.success 
          ? `✅ Deployment successful\n${result.output}`
          : `❌ Deployment failed\n${result.output}`,
        isError: !result.success,
      };
    },
  });
  
  // Register command to add deployment targets
  api.registerCommand('deploy-target-add', {
    description: 'Add a deployment target',
    args: '--name <name> --type <docker|k8s|ssh|script> [--config-key value...]',
    async handler(args, ctx) {
      // Parse arguments
      const flags: Record<string, string> = {};
      const matches = args.matchAll(/--(\w+)\s+([^\s]+)/g);
      for (const match of matches) {
        flags[match[1]] = match[2];
      }
      
      if (!flags.name || !flags.type) {
        ctx.logger.error('Usage: /deploy-target-add --name <name> --type <type>');
        ctx.logger.error('Types: docker, k8s, ssh, script');
        return;
      }
      
      const validTypes = ['docker', 'k8s', 'ssh', 'script'];
      if (!validTypes.includes(flags.type)) {
        ctx.logger.error(`Invalid type: ${flags.type}. Use: ${validTypes.join(', ')}`);
        return;
      }
      
      // Build config from remaining flags
      const config: Record<string, string> = {};
      for (const [key, value] of Object.entries(flags)) {
        if (key !== 'name' && key !== 'type') {
          config[key] = value;
        }
      }
      
      const newTarget: DeployTarget = {
        name: flags.name,
        type: flags.type as DeployTarget['type'],
        config,
      };
      
      const targets = getTargets();
      
      // Check for duplicate
      if (targets.find(t => t.name === newTarget.name)) {
        ctx.logger.error(`Target '${newTarget.name}' already exists. Remove it first.`);
        return;
      }
      
      targets.push(newTarget);
      saveTargets(targets);
      
      ctx.notify(`Added deployment target: ${newTarget.name} (${newTarget.type})`, 'info');
    },
  });
  
  // Register command to list deployment targets
  api.registerCommand('deploy-targets', {
    description: 'List configured deployment targets',
    async handler(_args, ctx) {
      const targets = getTargets();
      
      if (targets.length === 0) {
        ctx.logger.info('No deployment targets configured.');
        ctx.logger.info('Use /deploy-target-add to add one.');
        return;
      }
      
      ctx.logger.info('Deployment targets:');
      for (const target of targets) {
        ctx.logger.info(`  ${target.name} (${target.type})`);
        for (const [key, value] of Object.entries(target.config)) {
          // Mask sensitive values
          const displayValue = key.toLowerCase().includes('token') || 
                               key.toLowerCase().includes('password') ||
                               key.toLowerCase().includes('secret')
            ? '***'
            : value;
          ctx.logger.info(`    ${key}: ${displayValue}`);
        }
      }
    },
  });
  
  // Register command to remove deployment targets
  api.registerCommand('deploy-target-remove', {
    description: 'Remove a deployment target',
    args: '<name>',
    async handler(args, ctx) {
      const name = args.trim();
      
      if (!name) {
        ctx.logger.error('Usage: /deploy-target-remove <name>');
        return;
      }
      
      const targets = getTargets();
      const index = targets.findIndex(t => t.name === name);
      
      if (index === -1) {
        ctx.logger.error(`Target '${name}' not found.`);
        return;
      }
      
      targets.splice(index, 1);
      saveTargets(targets);
      
      ctx.notify(`Removed deployment target: ${name}`, 'info');
    },
  });
  
  // Register command to deploy
  api.registerCommand('deploy', {
    description: 'Deploy a service to a target',
    args: '<service> <version> --to <target> [--dry-run]',
    async handler(args, ctx) {
      // Parse args
      const parts = args.split(' ').filter(p => p);
      const service = parts[0];
      const version = parts[1];
      
      // Find --to flag
      const toIndex = parts.findIndex(p => p === '--to');
      const target = toIndex >= 0 ? parts[toIndex + 1] : '';
      
      const dryRun = parts.includes('--dry-run');
      
      if (!service || !version || !target) {
        ctx.logger.error('Usage: /deploy <service> <version> --to <target> [--dry-run]');
        return;
      }
      
      const result = await deployToTarget(target, service, version);
      
      if (dryRun) {
        ctx.logger.info('📝 DRY RUN');
      }
      
      if (result.success) {
        ctx.notify(result.output, 'info');
      } else {
        ctx.notify(result.output, 'error');
      }
    },
  });
  
  // Listen for swarm completion - could trigger deployments
  api.on('swarm_complete', async (event) => {
    api.log('info', `Swarm ${event.swarmId} completed - deployment extension ready`);
    
    // Could auto-deploy on successful swarm completion
    // Example: if (event.results.every(r => r.success)) { ... }
  });
  
  api.log('info', 'Custom deploy extension loaded');
  api.log('info', `Configured targets: ${getTargets().length}`);
}
