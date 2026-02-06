/**
 * Extension System Tests
 * 
 * Tests for:
 * - Extension loading
 * - Permission enforcement
 * - Hot reload
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { 
  ExtensionLoader, 
  loadExtensions, 
  PermissionManager,
  getExtensionsDir 
} from '../../src/core/extension-loader';
import type { ExtensionAPI, ExtensionContext } from '../../src/core/extension-api';

// Test utilities
const TEST_TIMEOUT = 30000;

/**
 * Create a temporary test extension file
 */
function createTestExtension(
  name: string, 
  content: string, 
  dir: string
): string {
  const extPath = path.join(dir, `${name}.ts`);
  fs.writeFileSync(extPath, content, 'utf-8');
  return extPath;
}

/**
 * Create a simple test extension that registers a tool
 * Note: In real extensions, you'd import Type from '@sinclair/typebox'
 * For tests, we use a simple object schema since jiti has module resolution issues from temp dirs
 */
function createSimpleTestExtension(name: string): string {
  return `
import type { ExtensionAPI, ExtensionContext } from '@godel/core/extension-api';

export default function testExtension(api: ExtensionAPI, ctx: ExtensionContext) {
  api.log('info', '${name} extension loaded');
  
  api.registerTool({
    name: '${name}_tool',
    description: 'Test tool from ${name}',
    parameters: {
      type: 'object',
      properties: {
        input: { type: 'string' }
      },
      required: ['input']
    } as any,
    permissions: ['fs:read'],
    async execute(toolCallId, params, ctx) {
      return {
        content: 'Test result: ' + params.input,
        isError: false
      };
    }
  });
  
  api.on('agent_start', async (event) => {
    api.log('debug', 'Agent started: ' + event.agentId);
  });
}
`;
}

/**
 * Create an extension with permission testing
 */
function createPermissionTestExtension(): string {
  return `
import type { ExtensionAPI, ExtensionContext } from '@godel/core/extension-api';

export default function permissionTestExtension(api: ExtensionAPI, ctx: ExtensionContext) {
  // Register tool that requires fs:write permission
  api.registerTool({
    name: 'write_file',
    description: 'Write to a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['path', 'content']
    } as any,
    permissions: ['fs:write'],
    async execute(toolCallId, params, ctx) {
      // Check permission
      if (!ctx.hasPermission('fs:write')) {
        return {
          content: 'Permission denied: fs:write',
          isError: true
        };
      }
      return {
        content: 'File written successfully',
        isError: false
      };
    }
  });
  
  // Register tool that requires net:write permission
  api.registerTool({
    name: 'fetch_url',
    description: 'Fetch a URL',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string' }
      },
      required: ['url']
    } as any,
    permissions: ['net:write'],
    async execute(toolCallId, params, ctx) {
      if (!ctx.hasPermission('net:write')) {
        return {
          content: 'Permission denied: net:write',
          isError: true
        };
      }
      return {
        content: 'Fetched: ' + params.url,
        isError: false
      };
    }
  });
}
`;
}

describe('Extension System', () => {
  let tempDir: string;
  
  beforeEach(() => {
    // Create temp directory for test extensions
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'godel-ext-test-'));
  });
  
  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
  
  describe('Extension Loading', () => {
    test('should load a simple extension', async () => {
      const extContent = createSimpleTestExtension('test');
      createTestExtension('test', extContent, tempDir);
      
      const loader = new ExtensionLoader({
        paths: [tempDir],
        hotReload: false,
      });
      
      const result = await loader.load();
      
      expect(result.errors).toHaveLength(0);
      expect(result.extensions).toHaveLength(1);
      expect(result.extensions[0].name).toBe('test');
      expect(result.tools.has('test_tool')).toBe(true);
    }, TEST_TIMEOUT);
    
    test('should load multiple extensions', async () => {
      createTestExtension('ext1', createSimpleTestExtension('ext1'), tempDir);
      createTestExtension('ext2', createSimpleTestExtension('ext2'), tempDir);
      
      const loader = new ExtensionLoader({
        paths: [tempDir],
        hotReload: false,
      });
      
      const result = await loader.load();
      
      expect(result.errors).toHaveLength(0);
      expect(result.extensions).toHaveLength(2);
      expect(result.tools.has('ext1_tool')).toBe(true);
      expect(result.tools.has('ext2_tool')).toBe(true);
    }, TEST_TIMEOUT);
    
    test('should handle extension load errors gracefully', async () => {
      // Create an invalid extension
      createTestExtension('invalid', 'export default "not a function";', tempDir);
      
      const loader = new ExtensionLoader({
        paths: [tempDir],
        hotReload: false,
      });
      
      const result = await loader.load();
      
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.extensions).toHaveLength(0);
    }, TEST_TIMEOUT);
    
    test('should load default extension with built-in tools', async () => {
      const loader = new ExtensionLoader({
        paths: ['./src/extensions/default'],
        hotReload: false,
      });
      
      const result = await loader.load();
      
      expect(result.errors).toHaveLength(0);
      expect(result.extensions.length).toBeGreaterThan(0);
      
      // Check that default tools are registered
      expect(result.tools.has('read')).toBe(true);
      expect(result.tools.has('write')).toBe(true);
      expect(result.tools.has('edit')).toBe(true);
      expect(result.tools.has('bash')).toBe(true);
      expect(result.tools.has('grep')).toBe(true);
      expect(result.tools.has('find')).toBe(true);
    }, TEST_TIMEOUT);
    
    test('should register commands correctly', async () => {
      const extContent = `
import type { ExtensionAPI, ExtensionContext } from '@godel/core/extension-api';

export default function cmdExtension(api: ExtensionAPI, ctx: ExtensionContext) {
  api.registerCommand('test-cmd', {
    description: 'Test command',
    async handler(args, ctx) {
      ctx.logger.info('Command executed');
    }
  });
}
`;
      createTestExtension('cmd-test', extContent, tempDir);
      
      const loader = new ExtensionLoader({
        paths: [tempDir],
        hotReload: false,
      });
      
      const result = await loader.load();
      
      expect(result.errors).toHaveLength(0);
      expect(result.commands.has('test-cmd')).toBe(true);
      
      const cmd = result.commands.get('test-cmd');
      expect(cmd?.definition.description).toBe('Test command');
    }, TEST_TIMEOUT);
  });
  
  describe('Permission System', () => {
    test('should enforce fs:read permission', () => {
      const pm = new PermissionManager({ permissions: ['fs:read'] });
      
      expect(pm.hasPermission('fs:read')).toBe(true);
      expect(pm.hasPermission('fs:write')).toBe(false);
      expect(pm.hasPermission('fs:*')).toBe(false);
    });
    
    test('should enforce fs:* wildcard permission', () => {
      const pm = new PermissionManager({ permissions: ['fs:*'] });
      
      expect(pm.hasPermission('fs:read')).toBe(true);
      expect(pm.hasPermission('fs:write')).toBe(true);
      expect(pm.hasPermission('fs:delete')).toBe(true);
      expect(pm.hasPermission('net:read')).toBe(false);
    });
    
    test('should match wildcard permission', () => {
      const pm = new PermissionManager({ permissions: ['*'] });
      
      expect(pm.hasPermission('fs:read')).toBe(true);
      expect(pm.hasPermission('net:write')).toBe(true);
      expect(pm.hasPermission('exec:read')).toBe(true);
    });
    
    test('should block access to blocked paths', () => {
      const pm = new PermissionManager({
        permissions: ['fs:read'],
        blockedPaths: ['~/.ssh', '/etc']
      });
      
      expect(pm.isPathAllowed('/home/user/project', 'read')).toBe(true);
      expect(pm.isPathAllowed('/home/user/.ssh/id_rsa', 'read')).toBe(false);
      expect(pm.isPathAllowed('/etc/passwd', 'read')).toBe(false);
    });
    
    test('should check network hosts', () => {
      const pm = new PermissionManager({
        permissions: ['net:*'],
        allowedHosts: ['api.github.com', '*.example.com']
      });
      
      expect(pm.isHostAllowed('api.github.com')).toBe(true);
      expect(pm.isHostAllowed('sub.example.com')).toBe(true);
      expect(pm.isHostAllowed('other.com')).toBe(false);
    });
    
    test('should allow all hosts with wildcard', () => {
      const pm = new PermissionManager({
        permissions: ['net:*'],
        allowedHosts: ['*']
      });
      
      expect(pm.isHostAllowed('any.host.com')).toBe(true);
    });
    
    test('should deny tool execution without permission', async () => {
      const extContent = createPermissionTestExtension();
      createTestExtension('perm-test', extContent, tempDir);
      
      const loader = new ExtensionLoader({
        paths: [tempDir],
        hotReload: false,
        sandbox: {
          permissions: ['fs:read'] // Only fs:read, not fs:write
        }
      });
      
      const result = await loader.load();
      expect(result.errors).toHaveLength(0);
      
      const writeTool = result.tools.get('write_file');
      expect(writeTool).toBeDefined();
      
      // Execute tool with permission check
      const toolResult = await writeTool!.definition.execute(
        'test-call',
        { path: '/tmp/test.txt', content: 'test' },
        { cwd: process.cwd(), hasPermission: (p) => p === 'fs:read' }
      );
      
      expect(toolResult.isError).toBe(true);
      expect(toolResult.content).toContain('Permission denied');
    }, TEST_TIMEOUT);
  });
  
  describe('Hot Reload', () => {
    test('should detect file changes and reload', async () => {
      const extPath = path.join(tempDir, 'hotreload-test.ts');
      
      // Create initial extension
      fs.writeFileSync(extPath, `
import type { ExtensionAPI, ExtensionContext } from '@godel/core/extension-api';
export default function ext(api: ExtensionAPI, ctx: ExtensionContext) {
  api.registerTool({
    name: 'v1_tool',
    description: 'Version 1',
    parameters: { type: 'object', properties: {} },
    async execute() { return { content: 'v1', isError: false }; }
  });
}
`, 'utf-8');
      
      const loader = new ExtensionLoader({
        paths: [tempDir],
        hotReload: { enabled: true, debounceMs: 100, patterns: ['**/*.ts'] },
      });
      
      const result = await loader.load();
      expect(result.tools.has('v1_tool')).toBe(true);
      expect(result.tools.has('v2_tool')).toBe(false);
      
      // Set up reload listener
      let reloadResult: typeof result | null = null;
      const unsubscribe = loader.onReload((r) => {
        reloadResult = r;
      });
      
      // Modify the file
      fs.writeFileSync(extPath, `
import type { ExtensionAPI, ExtensionContext } from '@godel/core/extension-api';
export default function ext(api: ExtensionAPI, ctx: ExtensionContext) {
  api.registerTool({
    name: 'v2_tool',
    description: 'Version 2',
    parameters: { type: 'object', properties: {} },
    async execute() { return { content: 'v2', isError: false }; }
  });
}
`, 'utf-8');
      
      // Wait for reload
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check that reload happened
      expect(reloadResult).not.toBeNull();
      expect(loader.getTools().has('v2_tool')).toBe(true);
      expect(loader.getTools().has('v1_tool')).toBe(false);
      
      unsubscribe();
      loader.cleanup();
    }, TEST_TIMEOUT);
    
    test('should not reload when hot reload is disabled', async () => {
      const extPath = path.join(tempDir, 'noreload-test.ts');
      
      fs.writeFileSync(extPath, `
import type { ExtensionAPI, ExtensionContext } from '@godel/core/extension-api';
export default function ext(api: ExtensionAPI, ctx: ExtensionContext) {
  api.log('info', 'loaded');
}
`, 'utf-8');
      
      const loader = new ExtensionLoader({
        paths: [tempDir],
        hotReload: false, // Disabled
      });
      
      await loader.load();
      
      let reloadCount = 0;
      loader.onReload(() => {
        reloadCount++;
      });
      
      // Modify file
      fs.writeFileSync(extPath, `
import type { ExtensionAPI, ExtensionContext } from '@godel/core/extension-api';
export default function ext(api: ExtensionAPI, ctx: ExtensionContext) {
  api.log('info', 'modified');
}
`, 'utf-8');
      
      // Wait
      await new Promise(resolve => setTimeout(resolve, 500));
      
      expect(reloadCount).toBe(0);
      
      loader.cleanup();
    }, TEST_TIMEOUT);
  });
  
  describe('Configuration', () => {
    test('should get and set config values', async () => {
      const config = new Map<string, unknown>();
      
      const extContent = `
import type { ExtensionAPI, ExtensionContext } from '@godel/core/extension-api';

export default function configTest(api: ExtensionAPI, ctx: ExtensionContext) {
  // Set config
  api.setConfig('testKey', 'testValue');
  api.setConfig('numberKey', 42);
  
  // Get config
  const val = api.getConfig('testKey');
  api.log('info', 'Config value: ' + val);
}
`;
      createTestExtension('config-test', extContent, tempDir);
      
      const loader = new ExtensionLoader({
        paths: [tempDir],
        hotReload: false,
        config,
      });
      
      await loader.load();
      
      // Check config was set with extension prefix
      expect(config.get('config-test.testKey')).toBe('testValue');
      expect(config.get('config-test.numberKey')).toBe(42);
    }, TEST_TIMEOUT);
  });
  
  describe('Event Handling', () => {
    test('should emit events to handlers', async () => {
      let receivedAgentId = '';
      
      const extContent = `
import type { ExtensionAPI, ExtensionContext } from '@godel/core/extension-api';

export default function eventTest(api: ExtensionAPI, ctx: ExtensionContext) {
  api.on('agent_start', async (event) => {
    // Store for verification
    (global as any).lastAgentId = event.agentId;
  });
}
`;
      createTestExtension('event-test', extContent, tempDir);
      
      const loader = new ExtensionLoader({
        paths: [tempDir],
        hotReload: false,
      });
      
      await loader.load();
      
      // Emit an event
      await loader.emitEvent({
        type: 'agent_start',
        agentId: 'test-agent-123',
        task: 'test task',
      });
      
      // Verify handler was called
      expect((global as any).lastAgentId).toBe('test-agent-123');
    }, TEST_TIMEOUT);
    
    test('should handle multiple handlers for same event', async () => {
      const calls: string[] = [];
      
      // Create two extensions with handlers
      const ext1 = `
import type { ExtensionAPI, ExtensionContext } from '@godel/core/extension-api';
export default function ext1(api: ExtensionAPI, ctx: ExtensionContext) {
  api.on('agent_complete', async () => { (global as any).calls.push('ext1'); });
}
`;
      const ext2 = `
import type { ExtensionAPI, ExtensionContext } from '@godel/core/extension-api';
export default function ext2(api: ExtensionAPI, ctx: ExtensionContext) {
  api.on('agent_complete', async () => { (global as any).calls.push('ext2'); });
}
`;
      
      (global as any).calls = calls;
      
      createTestExtension('multi1', ext1, tempDir);
      createTestExtension('multi2', ext2, tempDir);
      
      const loader = new ExtensionLoader({
        paths: [tempDir],
        hotReload: false,
      });
      
      await loader.load();
      
      await loader.emitEvent({
        type: 'agent_complete',
        agentId: 'test',
        result: {},
        duration: 100,
      });
      
      expect(calls).toContain('ext1');
      expect(calls).toContain('ext2');
    }, TEST_TIMEOUT);
  });
});
