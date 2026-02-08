/**
 * Godel Security Guardrails Module
 * 
 * Provides comprehensive security enforcement for agent operations:
 * - Sandbox escape prevention
 * - Path traversal protection
 * - Command injection detection
 * - Network allowlist enforcement
 * - Content sanitization
 * - Resource limits enforcement
 * 
 * @module safety/guardrails
 */

import * as path from 'path';
import { EventEmitter } from 'events';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Security violation severity levels
 */
export type ViolationSeverity = 'info' | 'warning' | 'critical' | 'fatal';

/**
 * Types of security checks performed by guardrails
 */
export type GuardrailType = 
  | 'path_traversal'
  | 'command_injection'
  | 'sandbox_escape'
  | 'network_violation'
  | 'content_violation'
  | 'resource_limit'
  | 'permission_denied';

/**
 * Result of a security check
 */
export interface GuardrailResult {
  allowed: boolean;
  type: GuardrailType;
  message: string;
  details?: Record<string, unknown>;
  severity: ViolationSeverity;
  timestamp: Date;
}

/**
 * Security violation record
 */
export interface SecurityViolation {
  id: string;
  agentId: string;
  teamId?: string;
  type: GuardrailType;
  severity: ViolationSeverity;
  message: string;
  input: string;
  timestamp: Date;
  resolved: boolean;
  resolution?: string;
}

/**
 * Path validation options
 */
export interface PathValidationOptions {
  allowAbsolute: boolean;
  allowRelative: boolean;
  basePath?: string;
  allowedPaths: string[];
  blockedPaths: string[];
  followSymlinks: boolean;
}

/**
 * Command validation options
 */
export interface CommandValidationOptions {
  allowedCommands: string[];
  blockedCommands: string[];
  allowedPatterns: RegExp[];
  blockedPatterns: RegExp[];
  maxLength: number;
  allowPipes: boolean;
  allowRedirections: boolean;
  allowBackground: boolean;
}

/**
 * Network allowlist configuration
 */
export interface NetworkAllowlistConfig {
  allowedHosts: string[];
  allowedDomains: string[];
  allowedPorts: number[];
  allowedProtocols: string[];
  blockedHosts: string[];
  blockedDomains: string[];
  requireExplicitAllow: boolean;
}

/**
 * Sandbox escape detection patterns
 */
export interface SandboxEscapePatterns {
  fileSystem: RegExp[];
  process: RegExp[];
  network: RegExp[];
  memory: RegExp[];
  privilege: RegExp[];
}

/**
 * Resource limits configuration
 */
export interface ResourceLimits {
  maxFileSize: number;
  maxTotalSize: number;
  maxFiles: number;
  maxExecutionTime: number;
  maxMemoryUsage: number;
  maxCpuTime: number;
  maxNetworkRequests: number;
}

/**
 * Content validation options
 */
export interface ContentValidationOptions {
  maxLength: number;
  allowedMimeTypes: string[];
  blockedMimeTypes: string[];
  sanitizeHtml: boolean;
  allowScripts: boolean;
  allowIframes: boolean;
  maxNestingDepth: number;
}

/**
 * Guardrails configuration
 */
export interface GuardrailsConfig {
  enabled: boolean;
  logViolations: boolean;
  autoBlock: boolean;
  maxViolationsBeforeBlock: number;
  pathValidation: PathValidationOptions;
  commandValidation: CommandValidationOptions;
  networkAllowlist: NetworkAllowlistConfig;
  resourceLimits: ResourceLimits;
  contentValidation: ContentValidationOptions;
  sandboxEscapePatterns: SandboxEscapePatterns;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_PATH_VALIDATION: PathValidationOptions = {
  allowAbsolute: false,
  allowRelative: true,
  allowedPaths: ['/tmp/godel', '/workspace'],
  blockedPaths: [
    '/etc', '/usr/bin', '/bin', '/sbin', '/usr/sbin',
    '/root', '/home', '/var/log', '/proc', '/sys',
    '..', '~', '$HOME', '$PWD', '$OLDPWD'
  ],
  followSymlinks: false,
};

const DEFAULT_COMMAND_VALIDATION: CommandValidationOptions = {
  allowedCommands: [
    'ls', 'cat', 'echo', 'head', 'tail', 'grep', 'find', 'wc',
    'mkdir', 'rm', 'cp', 'mv', 'touch', 'chmod', 'pwd', 'cd',
    'diff', 'sort', 'uniq', 'awk', 'sed', 'curl', 'wget'
  ],
  blockedCommands: [
    'sudo', 'su', 'bash', 'sh', 'zsh', 'exec', 'eval',
    'python', 'python3', 'node', 'ruby', 'perl', 'php',
    'nc', 'netcat', 'ncat', 'telnet', 'ssh', 'scp',
    'iptables', 'firewall-cmd', 'ufw',
    'mkfs', 'fdisk', 'parted', 'dd',
    'kill', 'pkill', 'killall'
  ],
  allowedPatterns: [],
  blockedPatterns: [
    /\$\(.*\)/,           // Command substitution
    /`.*`/,               // Backtick command substitution
    /;\s*/,               // Command chaining
    /\&\&/,                 // AND operator
    /\|\|/,               // OR operator
  ],
  maxLength: 4096,
  allowPipes: true,
  allowRedirections: true,
  allowBackground: false,
};

const DEFAULT_NETWORK_ALLOWLIST: NetworkAllowlistConfig = {
  allowedHosts: [],
  allowedDomains: [],
  allowedPorts: [80, 443, 8080, 3000, 8000, 9000],
  allowedProtocols: ['http', 'https'],
  blockedHosts: ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'],
  blockedDomains: ['internal.company.com', 'localhost.localdomain'],
  requireExplicitAllow: true,
};

const DEFAULT_RESOURCE_LIMITS: ResourceLimits = {
  maxFileSize: 100 * 1024 * 1024,        // 100MB
  maxTotalSize: 1024 * 1024 * 1024,      // 1GB
  maxFiles: 10000,
  maxExecutionTime: 300000,              // 5 minutes
  maxMemoryUsage: 512 * 1024 * 1024,     // 512MB
  maxCpuTime: 60000,                     // 1 minute
  maxNetworkRequests: 1000,
};

const DEFAULT_CONTENT_VALIDATION: ContentValidationOptions = {
  maxLength: 10 * 1024 * 1024,           // 10MB
  allowedMimeTypes: ['text/plain', 'text/markdown', 'application/json', 'text/html'],
  blockedMimeTypes: ['application/x-executable', 'application/x-sh'],
  sanitizeHtml: true,
  allowScripts: false,
  allowIframes: false,
  maxNestingDepth: 100,
};

const DEFAULT_SANDBOX_ESCAPE_PATTERNS: SandboxEscapePatterns = {
  fileSystem: [
    /\.\.\/\.\./,                    // Double path traversal
    /\/proc\/self\//,                // Process self-reference
    /\/proc\/\d+\/fd/,               // File descriptor access
    /\/sys\/kernel\//,               // Kernel access
    /\/dev\/mem/,                    // Memory device
    /\/dev\/kmem/,                   // Kernel memory
    /\/dev\/port/,                   // I/O port access
  ],
  process: [
    /fork\s*\(/,                      // Fork system call
    /clone\s*\(/,                     // Clone system call
    /exec\s*\(/,                      // Execute system call
    /execve\s*\(/,                    // Execute system call (variant)
    /system\s*\(/,                    // System call
    /popen\s*\(/,                     // Process open
  ],
  network: [
    /socket\s*\(/i,                    // Socket creation (case insensitive)
    /bind\s*\(/i,                      // Socket binding
    /listen\s*\(/i,                    // Socket listening
    /raw_socket/i,                     // Raw socket
    /SOCK_RAW/i,                       // Raw socket constant
  ],
  memory: [
    /mmap\s*\(/,                      // Memory mapping
    /mprotect\s*\(/,                  // Memory protection
    /\/proc\/self\/mem/,              // Self memory access
  ],
  privilege: [
    /setuid\s*\(/,                    // Set user ID
    /setgid\s*\(/,                    // Set group ID
    /setresuid\s*\(/,                 // Set real/effective/saved UID
    /capset\s*\(/,                    // Capability setting
  ],
};

const DEFAULT_CONFIG: GuardrailsConfig = {
  enabled: true,
  logViolations: true,
  autoBlock: true,
  maxViolationsBeforeBlock: 5,
  pathValidation: DEFAULT_PATH_VALIDATION,
  commandValidation: DEFAULT_COMMAND_VALIDATION,
  networkAllowlist: DEFAULT_NETWORK_ALLOWLIST,
  resourceLimits: DEFAULT_RESOURCE_LIMITS,
  contentValidation: DEFAULT_CONTENT_VALIDATION,
  sandboxEscapePatterns: DEFAULT_SANDBOX_ESCAPE_PATTERNS,
};

// ═══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate unique violation ID
 */
function generateViolationId(): string {
  return `viol-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Normalize a path for comparison
 */
function normalizePath(inputPath: string): string {
  return path.normalize(inputPath).replace(/\\/g, '/');
}

/**
 * Check if a path contains traversal attempts
 */
function containsTraversal(inputPath: string): boolean {
  const normalized = normalizePath(inputPath);
  return normalized.includes('../') || normalized.includes('..\\') || 
         normalized.startsWith('..') || normalized.endsWith('..') ||
         /\.\.\/\.\./.test(normalized);
}

/**
 * Resolve environment variables in a path
 */
function resolveEnvVars(input: string): string {
  return input.replace(/\$\{(\w+)\}/g, (_, varName) => process.env[varName] || '')
              .replace(/\$(\w+)/g, (_, varName) => process.env[varName] || '');
}

/**
 * Extract command from a shell command string
 */
function extractCommand(commandString: string): string {
  // Remove leading/trailing whitespace and quotes
  const trimmed = commandString.trim().replace(/^["']|["']$/g, '');
  
  // Get the first word (the command)
  const match = trimmed.match(/^\s*(\S+)/);
  return match ? match[1] : trimmed;
}

/**
 * Parse URL into components
 */
function parseUrl(urlString: string): {
  protocol: string;
  hostname: string;
  port: number;
  pathname: string;
} | null {
  try {
    const url = new URL(urlString);
    return {
      protocol: url.protocol.replace(':', ''),
      hostname: url.hostname,
      port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
      pathname: url.pathname,
    };
  } catch {
    return null;
  }
}

/**
 * Check if a hostname matches a pattern
 */
function matchesHostnamePattern(hostname: string, pattern: string): boolean {
  // Exact match
  if (hostname === pattern) return true;
  
  // Wildcard subdomain match (e.g., *.example.com)
  if (pattern.startsWith('*.')) {
    const domain = pattern.slice(2);
    return hostname === domain || hostname.endsWith('.' + domain);
  }
  
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN GUARDRAILS CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class Guardrails extends EventEmitter {
  private config: GuardrailsConfig;
  private violations: Map<string, SecurityViolation> = new Map();
  private agentViolationCounts: Map<string, number> = new Map();
  private blockedAgents: Set<string> = new Set();

  constructor(config: Partial<GuardrailsConfig> = {}) {
    super();
    this.config = this.mergeConfig(config);
  }

  /**
   * Merge user config with defaults
   */
  private mergeConfig(config: Partial<GuardrailsConfig>): GuardrailsConfig {
    return {
      ...DEFAULT_CONFIG,
      ...config,
      pathValidation: { ...DEFAULT_PATH_VALIDATION, ...config.pathValidation },
      commandValidation: { ...DEFAULT_COMMAND_VALIDATION, ...config.commandValidation },
      networkAllowlist: { ...DEFAULT_NETWORK_ALLOWLIST, ...config.networkAllowlist },
      resourceLimits: { ...DEFAULT_RESOURCE_LIMITS, ...config.resourceLimits },
      contentValidation: { ...DEFAULT_CONTENT_VALIDATION, ...config.contentValidation },
      sandboxEscapePatterns: { ...DEFAULT_SANDBOX_ESCAPE_PATTERNS, ...config.sandboxEscapePatterns },
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GuardrailsConfig>): void {
    this.config = this.mergeConfig(config);
    this.emit('config_updated', this.config);
  }

  /**
   * Get current configuration
   */
  getConfig(): GuardrailsConfig {
    return { ...this.config };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PATH VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validate a file path for traversal attempts and unauthorized access
   */
  validatePath(inputPath: string, agentId: string, teamId?: string): GuardrailResult {
    if (!this.config.enabled) {
      return { allowed: true, type: 'path_traversal', message: 'Guardrails disabled', severity: 'info', timestamp: new Date() };
    }

    // Handle empty path
    if (!inputPath || inputPath.trim() === '') {
      return {
        allowed: true,
        type: 'path_traversal',
        message: 'Empty path validation passed',
        severity: 'info',
        timestamp: new Date(),
        details: { input: inputPath },
      };
    }

    const resolvedPath = resolveEnvVars(inputPath);
    const normalized = normalizePath(resolvedPath);

    // Check for null bytes (null byte injection)
    if (normalized.includes('\0')) {
      return this.createViolation('path_traversal', 'critical', 'Null byte detected in path', agentId, teamId, { input: inputPath });
    }

    // Check for path traversal
    if (containsTraversal(normalized)) {
      return this.createViolation('path_traversal', 'critical', 'Path traversal attempt detected', agentId, teamId, { input: inputPath, normalized });
    }

    // Check for command substitution patterns in path (command injection attempt)
    if (/\$\([^)]*\)/.test(normalized) || normalized.includes('`')) {
      return this.createViolation('path_traversal', 'critical', 'Command substitution detected in path', agentId, teamId, { input: inputPath });
    }

    // Check blocked paths
    for (const blocked of this.config.pathValidation.blockedPaths) {
      const normalizedBlocked = normalizePath(blocked);
      if (normalizedBlocked && (normalized.startsWith(normalizedBlocked + '/') || normalized === normalizedBlocked)) {
        return this.createViolation('path_traversal', 'critical', `Access to blocked path: ${blocked}`, agentId, teamId, { input: inputPath, blocked });
      }
    }

    // Validate absolute paths against allowed paths
    // If allowedPaths is specified, absolute path must be within one of them
    // If allowedPaths is empty and allowAbsolute is false, any absolute path is rejected
    if (path.isAbsolute(normalized)) {
      if (this.config.pathValidation.allowedPaths.length > 0) {
        let inAllowedPath = false;
        for (const allowedPath of this.config.pathValidation.allowedPaths) {
          const normalizedAllowed = normalizePath(allowedPath);
          if (normalizedAllowed && (normalized.startsWith(normalizedAllowed + '/') || normalized === normalizedAllowed)) {
            inAllowedPath = true;
            break;
          }
        }
        
        if (!inAllowedPath) {
          return this.createViolation('path_traversal', 'warning', 'Path not in allowed directories', agentId, teamId, { input: inputPath });
        }
      } else if (!this.config.pathValidation.allowAbsolute) {
        return this.createViolation('path_traversal', 'warning', 'Absolute paths not allowed', agentId, teamId, { input: inputPath });
      }
    }

    return {
      allowed: true,
      type: 'path_traversal',
      message: 'Path validation passed',
      severity: 'info',
      timestamp: new Date(),
      details: { input: inputPath, normalized },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMAND VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validate a command for injection attempts
   */
  validateCommand(commandString: string, agentId: string, teamId?: string): GuardrailResult {
    if (!this.config.enabled) {
      return { allowed: true, type: 'command_injection', message: 'Guardrails disabled', severity: 'info', timestamp: new Date() };
    }

    // Handle empty or whitespace-only commands
    if (!commandString || commandString.trim() === '') {
      return {
        allowed: true,
        type: 'command_injection',
        message: 'Empty command validation passed',
        severity: 'info',
        timestamp: new Date(),
      };
    }

    // Check command length
    if (commandString.length > this.config.commandValidation.maxLength) {
      return this.createViolation('command_injection', 'warning', 'Command exceeds maximum length', agentId, teamId, { 
        length: commandString.length, 
        maxLength: this.config.commandValidation.maxLength 
      });
    }

    // Extract the base command
    const baseCommand = extractCommand(commandString);

    // If base command is empty after extraction, allow it (just whitespace/quotes)
    if (!baseCommand) {
      return {
        allowed: true,
        type: 'command_injection',
        message: 'Command validation passed',
        severity: 'info',
        timestamp: new Date(),
      };
    }

    // Check blocked commands
    if (this.config.commandValidation.blockedCommands.includes(baseCommand)) {
      return this.createViolation('command_injection', 'critical', `Blocked command: ${baseCommand}`, agentId, teamId, { command: baseCommand });
    }

    // Check allowed commands (if list is not empty)
    if (this.config.commandValidation.allowedCommands.length > 0 && 
        !this.config.commandValidation.allowedCommands.includes(baseCommand)) {
      return this.createViolation('command_injection', 'critical', `Command not in allowed list: ${baseCommand}`, agentId, teamId, { command: baseCommand });
    }

    // Check blocked patterns
    for (const pattern of this.config.commandValidation.blockedPatterns) {
      if (pattern.test(commandString)) {
        return this.createViolation('command_injection', 'critical', `Blocked pattern detected: ${pattern.source}`, agentId, teamId, { 
          command: commandString, 
          pattern: pattern.source 
        });
      }
    }

    // Check for background execution - match & at end with optional whitespace
    // But only if it's not just part of the command name (e.g., 'command&' not 'echo &')
    if (!this.config.commandValidation.allowBackground && /&\s*$/.test(commandString) && !commandString.includes('&\&')) {
      return this.createViolation('command_injection', 'warning', 'Background execution not allowed', agentId, teamId, { command: commandString });
    }

    return {
      allowed: true,
      type: 'command_injection',
      message: 'Command validation passed',
      severity: 'info',
      timestamp: new Date(),
      details: { command: baseCommand },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SANDBOX ESCAPE DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detect sandbox escape attempts in code or commands
   */
  detectSandboxEscape(input: string, agentId: string, teamId?: string): GuardrailResult {
    if (!this.config.enabled) {
      return { allowed: true, type: 'sandbox_escape', message: 'Guardrails disabled', severity: 'info', timestamp: new Date() };
    }

    const patterns = this.config.sandboxEscapePatterns;

    // Check file system escape patterns
    for (const pattern of patterns.fileSystem) {
      if (pattern.test(input)) {
        return this.createViolation('sandbox_escape', 'fatal', 'File system sandbox escape attempt detected', agentId, teamId, { 
          input, 
          pattern: pattern.source,
          category: 'filesystem'
        });
      }
    }

    // Check process escape patterns
    for (const pattern of patterns.process) {
      if (pattern.test(input)) {
        return this.createViolation('sandbox_escape', 'fatal', 'Process sandbox escape attempt detected', agentId, teamId, { 
          input, 
          pattern: pattern.source,
          category: 'process'
        });
      }
    }

    // Check network escape patterns
    for (const pattern of patterns.network) {
      if (pattern.test(input)) {
        return this.createViolation('sandbox_escape', 'fatal', 'Network sandbox escape attempt detected', agentId, teamId, { 
          input, 
          pattern: pattern.source,
          category: 'network'
        });
      }
    }

    // Check memory escape patterns
    for (const pattern of patterns.memory) {
      if (pattern.test(input)) {
        return this.createViolation('sandbox_escape', 'fatal', 'Memory sandbox escape attempt detected', agentId, teamId, { 
          input, 
          pattern: pattern.source,
          category: 'memory'
        });
      }
    }

    // Check privilege escape patterns
    for (const pattern of patterns.privilege) {
      if (pattern.test(input)) {
        return this.createViolation('sandbox_escape', 'fatal', 'Privilege escalation attempt detected', agentId, teamId, { 
          input, 
          pattern: pattern.source,
          category: 'privilege'
        });
      }
    }

    return {
      allowed: true,
      type: 'sandbox_escape',
      message: 'No sandbox escape patterns detected',
      severity: 'info',
      timestamp: new Date(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NETWORK ALLOWLIST
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validate network request against allowlist
   */
  validateNetworkRequest(url: string, agentId: string, teamId?: string): GuardrailResult {
    if (!this.config.enabled) {
      return { allowed: true, type: 'network_violation', message: 'Guardrails disabled', severity: 'info', timestamp: new Date() };
    }

    const parsed = parseUrl(url);
    if (!parsed) {
      return this.createViolation('network_violation', 'warning', 'Invalid URL format', agentId, teamId, { url });
    }

    const { protocol, hostname, port } = parsed;
    const config = this.config.networkAllowlist;

    // Check protocol
    if (!config.allowedProtocols.includes(protocol)) {
      return this.createViolation('network_violation', 'critical', `Protocol not allowed: ${protocol}`, agentId, teamId, { url, protocol });
    }

    // Check blocked hosts
    for (const blockedHost of config.blockedHosts) {
      if (hostname === blockedHost) {
        return this.createViolation('network_violation', 'critical', `Access to blocked host: ${hostname}`, agentId, teamId, { url, blockedHost });
      }
    }

    // Check blocked domains
    for (const blockedDomain of config.blockedDomains) {
      if (matchesHostnamePattern(hostname, blockedDomain) || hostname.endsWith('.' + blockedDomain)) {
        return this.createViolation('network_violation', 'critical', `Access to blocked domain: ${blockedDomain}`, agentId, teamId, { url, blockedDomain });
      }
    }

    // Check port
    if (!config.allowedPorts.includes(port)) {
      return this.createViolation('network_violation', 'warning', `Port not allowed: ${port}`, agentId, teamId, { url, port, allowedPorts: config.allowedPorts });
    }

    // Check explicit allow requirement
    if (config.requireExplicitAllow) {
      let explicitlyAllowed = false;

      // Check allowed hosts
      for (const allowedHost of config.allowedHosts) {
        if (hostname === allowedHost) {
          explicitlyAllowed = true;
          break;
        }
      }

      // Check allowed domains
      if (!explicitlyAllowed) {
        for (const allowedDomain of config.allowedDomains) {
          if (matchesHostnamePattern(hostname, allowedDomain)) {
            explicitlyAllowed = true;
            break;
          }
        }
      }

      if (!explicitlyAllowed) {
        return this.createViolation('network_violation', 'warning', `Host not explicitly allowed: ${hostname}`, agentId, teamId, { url, hostname });
      }
    }

    return {
      allowed: true,
      type: 'network_violation',
      message: 'Network request allowed',
      severity: 'info',
      timestamp: new Date(),
      details: { url, hostname, port, protocol },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOURCE LIMITS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if operation would exceed resource limits
   */
  checkResourceLimit(
    resourceType: keyof ResourceLimits,
    value: number,
    agentId: string,
    teamId?: string
  ): GuardrailResult {
    if (!this.config.enabled) {
      return { allowed: true, type: 'resource_limit', message: 'Guardrails disabled', severity: 'info', timestamp: new Date() };
    }

    const limit = this.config.resourceLimits[resourceType];
    
    if (value > limit) {
      return this.createViolation('resource_limit', 'warning', `Resource limit exceeded: ${resourceType}`, agentId, teamId, { 
        resourceType, 
        value, 
        limit 
      });
    }

    return {
      allowed: true,
      type: 'resource_limit',
      message: 'Resource usage within limits',
      severity: 'info',
      timestamp: new Date(),
      details: { resourceType, value, limit },
    };
  }

  /**
   * Validate file size against limits
   */
  validateFileSize(size: number, agentId: string, teamId?: string): GuardrailResult {
    return this.checkResourceLimit('maxFileSize', size, agentId, teamId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTENT VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validate content against security policies
   */
  validateContent(content: string, mimeType: string, agentId: string, teamId?: string): GuardrailResult {
    if (!this.config.enabled) {
      return { allowed: true, type: 'content_violation', message: 'Guardrails disabled', severity: 'info', timestamp: new Date() };
    }

    const config = this.config.contentValidation;

    // Check content length
    if (content.length > config.maxLength) {
      return this.createViolation('content_violation', 'warning', 'Content exceeds maximum length', agentId, teamId, { 
        length: content.length, 
        maxLength: config.maxLength 
      });
    }

    // Check MIME type
    if (config.blockedMimeTypes.includes(mimeType)) {
      return this.createViolation('content_violation', 'critical', `Blocked MIME type: ${mimeType}`, agentId, teamId, { mimeType });
    }

    if (config.allowedMimeTypes.length > 0 && !config.allowedMimeTypes.includes(mimeType)) {
      return this.createViolation('content_violation', 'warning', `MIME type not allowed: ${mimeType}`, agentId, teamId, { mimeType });
    }

    // Check for scripts in HTML content
    if (mimeType.includes('html') && !config.allowScripts) {
      if (/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi.test(content)) {
        return this.createViolation('content_violation', 'critical', 'Scripts not allowed in HTML content', agentId, teamId, {});
      }
    }

    // Check for iframes
    if (mimeType.includes('html') && !config.allowIframes) {
      if (/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi.test(content)) {
        return this.createViolation('content_violation', 'warning', 'Iframes not allowed in HTML content', agentId, teamId, {});
      }
    }

    return {
      allowed: true,
      type: 'content_violation',
      message: 'Content validation passed',
      severity: 'info',
      timestamp: new Date(),
      details: { mimeType, length: content.length },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIOLATION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a security violation
   */
  private createViolation(
    type: GuardrailType,
    severity: ViolationSeverity,
    message: string,
    agentId: string,
    teamId?: string,
    details?: Record<string, unknown>
  ): GuardrailResult {
    const violation: SecurityViolation = {
      id: generateViolationId(),
      agentId,
      teamId,
      type,
      severity,
      message,
      input: JSON.stringify(details),
      timestamp: new Date(),
      resolved: false,
    };

    this.violations.set(violation.id, violation);

    // Track violation count for agent
    const currentCount = this.agentViolationCounts.get(agentId) || 0;
    this.agentViolationCounts.set(agentId, currentCount + 1);

    // Auto-block if threshold reached
    if (this.config.autoBlock && currentCount + 1 >= this.config.maxViolationsBeforeBlock) {
      this.blockedAgents.add(agentId);
      this.emit('agent_blocked', { agentId, violationCount: currentCount + 1 });
    }

    this.emit('violation', violation);

    if (this.config.logViolations) {
      console.error(`[GUARDRAIL VIOLATION] ${severity.toUpperCase()}: ${message} (Agent: ${agentId})`);
    }

    return {
      allowed: false,
      type,
      message,
      severity,
      timestamp: violation.timestamp,
      details,
    };
  }

  /**
   * Get all violations
   */
  getViolations(agentId?: string): SecurityViolation[] {
    const allViolations = Array.from(this.violations.values());
    if (agentId) {
      return allViolations.filter(v => v.agentId === agentId);
    }
    return allViolations;
  }

  /**
   * Get violation count for an agent
   */
  getViolationCount(agentId: string): number {
    return this.agentViolationCounts.get(agentId) || 0;
  }

  /**
   * Check if agent is blocked
   */
  isBlocked(agentId: string): boolean {
    return this.blockedAgents.has(agentId);
  }

  /**
   * Block an agent
   */
  blockAgent(agentId: string, reason: string): void {
    this.blockedAgents.add(agentId);
    this.emit('agent_blocked', { agentId, reason });
  }

  /**
   * Unblock an agent
   */
  unblockAgent(agentId: string): void {
    this.blockedAgents.delete(agentId);
    this.agentViolationCounts.set(agentId, 0);
    this.emit('agent_unblocked', { agentId });
  }

  /**
   * Clear all violations
   */
  clearViolations(): void {
    this.violations.clear();
    this.agentViolationCounts.clear();
    this.blockedAgents.clear();
    this.emit('violations_cleared');
  }

  /**
   * Resolve a violation
   */
  resolveViolation(violationId: string, resolution: string): boolean {
    const violation = this.violations.get(violationId);
    if (violation) {
      violation.resolved = true;
      violation.resolution = resolution;
      this.emit('violation_resolved', { violationId, resolution });
      return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validate multiple aspects at once
   */
  validateAll(
    params: {
      path?: string;
      command?: string;
      networkUrl?: string;
      content?: { data: string; mimeType: string };
      sandboxCheck?: string;
    },
    agentId: string,
    teamId?: string
  ): GuardrailResult[] {
    const results: GuardrailResult[] = [];

    if (params.path) {
      results.push(this.validatePath(params.path, agentId, teamId));
    }

    if (params.command) {
      results.push(this.validateCommand(params.command, agentId, teamId));
    }

    if (params.networkUrl) {
      results.push(this.validateNetworkRequest(params.networkUrl, agentId, teamId));
    }

    if (params.content) {
      results.push(this.validateContent(params.content.data, params.content.mimeType, agentId, teamId));
    }

    if (params.sandboxCheck) {
      results.push(this.detectSandboxEscape(params.sandboxCheck, agentId, teamId));
    }

    return results;
  }

  /**
   * Check if all validations pass
   */
  validateAllPass(
    params: {
      path?: string;
      command?: string;
      networkUrl?: string;
      content?: { data: string; mimeType: string };
      sandboxCheck?: string;
    },
    agentId: string,
    teamId?: string
  ): { allowed: boolean; results: GuardrailResult[] } {
    const results = this.validateAll(params, agentId, teamId);
    const allowed = results.every(r => r.allowed);
    return { allowed, results };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

let instance: Guardrails | null = null;

/**
 * Get the singleton guardrails instance
 */
export function getGuardrails(): Guardrails {
  if (!instance) {
    instance = new Guardrails();
  }
  return instance;
}

/**
 * Create a new guardrails instance with custom config
 */
export function createGuardrails(config?: Partial<GuardrailsConfig>): Guardrails {
  return new Guardrails(config);
}

/**
 * Reset the singleton instance
 */
export function resetGuardrails(): void {
  instance = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT DEFAULT CONFIGURATIONS FOR CUSTOMIZATION
// ═══════════════════════════════════════════════════════════════════════════════

export { DEFAULT_CONFIG as DEFAULT_GUARDRAILS_CONFIG };
export { DEFAULT_PATH_VALIDATION };
export { DEFAULT_COMMAND_VALIDATION };
export { DEFAULT_NETWORK_ALLOWLIST };
export { DEFAULT_RESOURCE_LIMITS };
export { DEFAULT_CONTENT_VALIDATION };
export { DEFAULT_SANDBOX_ESCAPE_PATTERNS };
