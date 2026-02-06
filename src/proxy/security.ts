/**
 * Proxy Security Module
 * 
 * Handles authentication, authorization, rate limiting, content filtering,
 * PII detection, and audit logging for the LLM proxy.
 * 
 * @module proxy/security
 */

import { 
  AuthResult, 
  User, 
  RateLimitStatus, 
  FilterResult, 
  PIIReport,
  SecurityEvent,
  AuthContext,
  RateLimitConfig,
  Message,
  ProxyError,
  ProxyErrorCode
} from './types.js';

// =============================================================================
// Security Configuration
// =============================================================================

/**
 * Security configuration options
 */
export interface SecurityConfig {
  /** Require authentication for all requests */
  requireAuth: boolean;
  
  /** Rate limit configuration */
  rateLimits: RateLimitConfig;
  
  /** Custom rate limits per tier */
  tieredRateLimits: Record<string, RateLimitConfig>;
  
  /** Enable content filtering */
  enableContentFilter: boolean;
  
  /** Enable PII detection */
  enablePIIDetection: boolean;
  
  /** Content filter patterns */
  contentFilterPatterns: string[];
  
  /** Blocked keywords/patterns */
  blockedPatterns: RegExp[];
  
  /** PII patterns to detect */
  piiPatterns: Record<string, RegExp>;
  
  /** Model access control per role */
  modelAccessRules: Record<string, string[]>;
  
  /** JWT secret for token verification */
  jwtSecret?: string;
  
  /** API key validation function */
  validateApiKey?: (key: string) => Promise<User | null>;
  
  /** Audit log storage path */
  auditLogPath?: string;
}

/**
 * Default security configuration
 */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  requireAuth: true,
  rateLimits: {
    requestsPerMinute: 60,
    tokensPerMinute: 100000,
    burstSize: 10
  },
  tieredRateLimits: {
    free: {
      requestsPerMinute: 20,
      tokensPerMinute: 10000,
      burstSize: 5
    },
    basic: {
      requestsPerMinute: 60,
      tokensPerMinute: 100000,
      burstSize: 10
    },
    pro: {
      requestsPerMinute: 300,
      tokensPerMinute: 1000000,
      burstSize: 30
    },
    enterprise: {
      requestsPerMinute: 1000,
      tokensPerMinute: 5000000,
      burstSize: 100
    }
  },
  enableContentFilter: true,
  enablePIIDetection: true,
  contentFilterPatterns: [],
  blockedPatterns: [],
  piiPatterns: {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phone: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    creditCard: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})\b/g,
    apiKey: /\b(?:sk-|pk-)[a-zA-Z0-9]{32,}\b/g,
    ipv4: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    ipv6: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
    jwt: /\beyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\b/g
  },
  modelAccessRules: {
    '*': ['*'], // Default: all roles can access all models
    free: ['gpt-3.5-turbo', 'gemini-flash', 'claude-haiku'],
    basic: ['gpt-3.5-turbo', 'gpt-4o-mini', 'gemini-flash', 'claude-haiku', 'claude-sonnet-4'],
    pro: ['*'],
    enterprise: ['*']
  }
};

// =============================================================================
// Rate Limiter
// =============================================================================

/**
 * Token bucket for rate limiting
 */
interface TokenBucket {
  tokens: number;
  lastUpdate: number;
}

/**
 * Rate limiter using token bucket algorithm
 */
export class RateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private config: RateLimitConfig;
  
  constructor(config: RateLimitConfig) {
    this.config = config;
  }
  
  /**
   * Check if request is within rate limit
   */
  checkLimit(key: string, tokens: number = 1): RateLimitStatus {
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    
    // Get or create bucket
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = {
        tokens: this.config.burstSize,
        lastUpdate: now
      };
      this.buckets.set(key, bucket);
    }
    
    // Refill tokens based on time elapsed
    const elapsedMs = now - bucket.lastUpdate;
    const tokensToAdd = (elapsedMs / windowMs) * this.config.requestsPerMinute;
    bucket.tokens = Math.min(this.config.burstSize, bucket.tokens + tokensToAdd);
    bucket.lastUpdate = now;
    
    // Calculate reset time
    const resetAt = new Date(now + windowMs);
    
    // Check if request can be processed
    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return {
        allowed: true,
        limit: this.config.requestsPerMinute,
        remaining: Math.floor(bucket.tokens),
        resetAt
      };
    }
    
    // Rate limit exceeded
    return {
      allowed: false,
      limit: this.config.requestsPerMinute,
      remaining: 0,
      resetAt,
      retryAfter: Math.ceil((tokens - bucket.tokens) / (this.config.requestsPerMinute / 60))
    };
  }
  
  /**
   * Record token usage for a user/model combination
   */
  recordUsage(userId: string, model: string, tokens: number): void {
    const key = `tokens:${userId}:${model}`;
    const bucket = this.buckets.get(key);
    
    if (bucket) {
      bucket.tokens = Math.max(0, bucket.tokens - tokens);
    }
  }
  
  /**
   * Get rate limit status without consuming tokens
   */
  getStatus(key: string): RateLimitStatus {
    const bucket = this.buckets.get(key);
    
    if (!bucket) {
      return {
        allowed: true,
        limit: this.config.requestsPerMinute,
        remaining: this.config.burstSize,
        resetAt: new Date(Date.now() + 60000)
      };
    }
    
    return {
      allowed: bucket.tokens > 0,
      limit: this.config.requestsPerMinute,
      remaining: Math.floor(bucket.tokens),
      resetAt: new Date(Date.now() + 60000)
    };
  }
  
  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.buckets.delete(key);
  }
  
  /**
   * Clear all buckets
   */
  clear(): void {
    this.buckets.clear();
  }
  
  /**
   * Get bucket count (for monitoring)
   */
  getBucketCount(): number {
    return this.buckets.size;
  }
}

// =============================================================================
// Content Filter
// =============================================================================

/**
 * Content filtering for input/output sanitization
 */
export class ContentFilter {
  private blockedPatterns: RegExp[];
  private enableFiltering: boolean;
  
  constructor(config: { blockedPatterns: RegExp[]; enableFiltering: boolean }) {
    this.blockedPatterns = config.blockedPatterns;
    this.enableFiltering = config.enableFiltering;
  }
  
  /**
   * Filter input messages
   */
  filterInput(messages: Message[]): FilterResult {
    if (!this.enableFiltering) {
      return { passed: true };
    }
    
    const content = messages
      .map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
      .join(' ');
    
    return this.checkContent(content);
  }
  
  /**
   * Filter output content
   */
  filterOutput(content: string): FilterResult {
    if (!this.enableFiltering) {
      return { passed: true };
    }
    
    return this.checkContent(content);
  }
  
  /**
   * Check content against blocked patterns
   */
  private checkContent(content: string): FilterResult {
    const matches: string[] = [];
    
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(content)) {
        matches.push(pattern.source);
      }
      // Reset lastIndex for global regex
      pattern.lastIndex = 0;
    }
    
    if (matches.length > 0) {
      return {
        passed: false,
        reason: 'Content matched blocked patterns',
        matches
      };
    }
    
    return { passed: true };
  }
  
  /**
   * Add a blocked pattern
   */
  addBlockedPattern(pattern: RegExp): void {
    this.blockedPatterns.push(pattern);
  }
  
  /**
   * Remove a blocked pattern
   */
  removeBlockedPattern(pattern: RegExp): void {
    const idx = this.blockedPatterns.findIndex(p => p.source === pattern.source);
    if (idx !== -1) {
      this.blockedPatterns.splice(idx, 1);
    }
  }
}

// =============================================================================
// PII Detector
// =============================================================================

/**
 * PII (Personally Identifiable Information) detector
 */
export class PIIDetector {
  private patterns: Record<string, RegExp>;
  private enableDetection: boolean;
  
  constructor(config: { patterns: Record<string, RegExp>; enableDetection: boolean }) {
    this.patterns = { ...config.patterns };
    this.enableDetection = config.enableDetection;
  }
  
  /**
   * Detect PII in content
   */
  detect(content: string): PIIReport {
    if (!this.enableDetection) {
      return { detected: false, types: [] };
    }
    
    const detectedTypes: string[] = [];
    const values: string[] = [];
    const confidence: Record<string, number> = {};
    
    for (const [type, pattern] of Object.entries(this.patterns)) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        detectedTypes.push(type);
        // Store hashed values for audit (not actual values)
        matches.forEach(m => values.push(this.hashValue(m)));
        confidence[type] = Math.min(1, matches.length * 0.1 + 0.5);
      }
      // Reset lastIndex for global regex
      pattern.lastIndex = 0;
    }
    
    return {
      detected: detectedTypes.length > 0,
      types: detectedTypes,
      values: values.length > 0 ? values : undefined,
      confidence: detectedTypes.length > 0 ? confidence : undefined
    };
  }
  
  /**
   * Sanitize content by redacting PII
   */
  sanitize(content: string): string {
    if (!this.enableDetection) {
      return content;
    }
    
    let sanitized = content;
    
    for (const [type, pattern] of Object.entries(this.patterns)) {
      sanitized = sanitized.replace(pattern, `[REDACTED_${type.toUpperCase()}]`);
      pattern.lastIndex = 0;
    }
    
    return sanitized;
  }
  
  /**
   * Hash a value for audit logging (without storing actual PII)
   */
  private hashValue(value: string): string {
    // Simple hash for demonstration - use proper hashing in production
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `hash_${Math.abs(hash).toString(16)}`;
  }
  
  /**
   * Add a PII pattern
   */
  addPattern(name: string, pattern: RegExp): void {
    this.patterns[name] = pattern;
  }
  
  /**
   * Remove a PII pattern
   */
  removePattern(name: string): void {
    delete this.patterns[name];
  }
}

// =============================================================================
// Audit Logger
// =============================================================================

/**
 * Audit logger for security events
 */
export class AuditLogger {
  private events: SecurityEvent[] = [];
  private maxEvents: number;
  private logCallback?: (event: SecurityEvent) => void;
  
  constructor(config: { maxEvents?: number; logCallback?: (event: SecurityEvent) => void } = {}) {
    this.maxEvents = config.maxEvents || 10000;
    this.logCallback = config.logCallback;
  }
  
  /**
   * Log a security event
   */
  log(event: Omit<SecurityEvent, 'timestamp'>): void {
    const fullEvent: SecurityEvent = {
      ...event,
      timestamp: new Date()
    };
    
    this.events.push(fullEvent);
    
    // Trim old events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
    
    // Call external log callback if provided
    if (this.logCallback) {
      this.logCallback(fullEvent);
    }
    
    // Log critical events immediately
    if (event.severity === 'critical') {
      console.error(`[SECURITY CRITICAL] ${event.type}: ${JSON.stringify(event.details)}`);
    }
  }
  
  /**
   * Get recent events
   */
  getEvents(options: {
    type?: string;
    severity?: string;
    userId?: string;
    since?: Date;
    limit?: number;
  } = {}): SecurityEvent[] {
    let filtered = this.events;
    
    if (options.type) {
      filtered = filtered.filter(e => e.type === options.type);
    }
    
    if (options.severity) {
      filtered = filtered.filter(e => e.severity === options.severity);
    }
    
    if (options.userId) {
      filtered = filtered.filter(e => e.userId === options.userId);
    }
    
    if (options.since) {
      filtered = filtered.filter(e => e.timestamp >= options.since!);
    }
    
    const limit = options.limit || 100;
    return filtered.slice(-limit);
  }
  
  /**
   * Get event count
   */
  getEventCount(): number {
    return this.events.length;
  }
  
  /**
   * Clear all events
   */
  clear(): void {
    this.events = [];
  }
  
  /**
   * Export events as JSON
   */
  export(): string {
    return JSON.stringify(this.events, null, 2);
  }
}

// =============================================================================
// Main Security Class
// =============================================================================

/**
 * Main security class that orchestrates all security features
 */
export class ProxySecurity {
  private config: SecurityConfig;
  private rateLimiter: RateLimiter;
  private contentFilter: ContentFilter;
  private piiDetector: PIIDetector;
  private auditLogger: AuditLogger;
  private userCache: Map<string, { user: User; expires: number }> = new Map();
  
  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = { ...DEFAULT_SECURITY_CONFIG, ...config };
    
    this.rateLimiter = new RateLimiter(this.config.rateLimits);
    this.contentFilter = new ContentFilter({
      blockedPatterns: this.config.blockedPatterns,
      enableFiltering: this.config.enableContentFilter
    });
    this.piiDetector = new PIIDetector({
      patterns: this.config.piiPatterns,
      enableDetection: this.config.enablePIIDetection
    });
    this.auditLogger = new AuditLogger();
  }
  
  // ==========================================================================
  // Authentication
  // ==========================================================================
  
  /**
   * Authenticate a request
   */
  async authenticate(auth: AuthContext): Promise<AuthResult> {
    // If auth is not required, allow all requests
    if (!this.config.requireAuth) {
      return {
        authenticated: true,
        user: {
          id: 'anonymous',
          email: 'anonymous@local',
          roles: ['*']
        }
      };
    }
    
    // Check for cached user
    if (auth.userId) {
      const cached = this.userCache.get(auth.userId);
      if (cached && cached.expires > Date.now()) {
        return {
          authenticated: true,
          user: cached.user
        };
      }
    }
    
    // Auth is required but no valid auth provided
    if (!auth.authenticated) {
      this.auditLogger.log({
        type: 'auth_failure',
        severity: 'medium',
        ipAddress: auth.ipAddress || 'unknown',
        details: { reason: 'No authentication provided' }
      });
      
      return {
        authenticated: false,
        error: 'Authentication required'
      };
    }
    
    // At this point, auth is validated externally
    // Create a basic user from auth context
    const user: User = {
      id: auth.userId || 'unknown',
      email: 'user@example.com', // Would be fetched from DB
      roles: auth.roles || ['free'],
      rateLimitTier: 'basic'
    };
    
    // Cache user
    this.userCache.set(user.id, {
      user,
      expires: Date.now() + 5 * 60 * 1000 // 5 minute cache
    });
    
    return {
      authenticated: true,
      user
    };
  }
  
  /**
   * Validate API key
   */
  async validateApiKey(apiKey: string): Promise<User | null> {
    if (this.config.validateApiKey) {
      return this.config.validateApiKey(apiKey);
    }
    
    // Default validation - would be replaced with actual DB lookup
    if (apiKey.startsWith('dash_')) {
      return {
        id: 'api_user',
        email: 'api@example.com',
        roles: ['pro'],
        rateLimitTier: 'pro'
      };
    }
    
    return null;
  }
  
  // ==========================================================================
  // Authorization
  // ==========================================================================
  
  /**
   * Check if user has permission for an action
   */
  checkPermissions(user: User, action: string): boolean {
    // Admin users can do everything
    if (user.roles.includes('admin') || user.roles.includes('*')) {
      return true;
    }
    
    // Check role-based permissions
    const actionParts = action.split(':');
    const resource = actionParts[0];
    const permission = actionParts[1] || 'read';
    
    for (const role of user.roles) {
      const rules = this.config.modelAccessRules[role] || this.config.modelAccessRules['*'];
      
      if (rules.includes('*') || rules.includes(resource)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check if user has access to a specific model
   */
  checkModelAccess(user: User, model: string): boolean {
    // Admin users can access all models
    if (user.roles.includes('admin')) {
      return true;
    }
    
    // Check user's allowed models
    if (user.allowedModels) {
      return user.allowedModels.includes('*') || user.allowedModels.includes(model);
    }
    
    // Check role-based access rules
    for (const role of user.roles) {
      const allowedModels = this.config.modelAccessRules[role];
      if (allowedModels) {
        if (allowedModels.includes('*') || allowedModels.includes(model)) {
          return true;
        }
      }
    }
    
    // Log unauthorized model access attempt
    this.auditLogger.log({
      type: 'unauthorized_model',
      severity: 'medium',
      userId: user.id,
      ipAddress: 'unknown',
      details: { model, userRoles: user.roles }
    });
    
    return false;
  }
  
  // ==========================================================================
  // Rate Limiting
  // ==========================================================================
  
  /**
   * Check rate limit for a user
   */
  checkRateLimit(userId: string, model: string, tier?: string): RateLimitStatus {
    const key = `${userId}:${model}`;
    const status = this.rateLimiter.checkLimit(key);
    
    if (!status.allowed) {
      this.auditLogger.log({
        type: 'rate_limit_exceeded',
        severity: 'low',
        userId,
        ipAddress: 'unknown',
        details: { model, limit: status.limit, remaining: status.remaining }
      });
    }
    
    return status;
  }
  
  /**
   * Record token usage
   */
  recordUsage(userId: string, model: string, tokens: number): void {
    this.rateLimiter.recordUsage(userId, model, tokens);
  }
  
  /**
   * Get rate limit status without consuming quota
   */
  getRateLimitStatus(userId: string, model: string): RateLimitStatus {
    const key = `${userId}:${model}`;
    return this.rateLimiter.getStatus(key);
  }
  
  // ==========================================================================
  // Content Filtering
  // ==========================================================================
  
  /**
   * Filter input messages
   */
  filterInput(messages: Message[]): FilterResult {
    const result = this.contentFilter.filterInput(messages);
    
    if (!result.passed) {
      this.auditLogger.log({
        type: 'content_filtered',
        severity: 'medium',
        ipAddress: 'unknown',
        details: { reason: result.reason, matches: result.matches }
      });
    }
    
    return result;
  }
  
  /**
   * Filter output content
   */
  filterOutput(content: string): FilterResult {
    const result = this.contentFilter.filterOutput(content);
    
    if (!result.passed) {
      this.auditLogger.log({
        type: 'content_filtered',
        severity: 'medium',
        ipAddress: 'unknown',
        details: { reason: result.reason }
      });
    }
    
    return result;
  }
  
  // ==========================================================================
  // PII Detection
  // ==========================================================================
  
  /**
   * Detect PII in content
   */
  detectPII(content: string): PIIReport {
    const report = this.piiDetector.detect(content);
    
    if (report.detected) {
      this.auditLogger.log({
        type: 'pii_detected',
        severity: 'high',
        ipAddress: 'unknown',
        details: { types: report.types, confidence: report.confidence }
      });
    }
    
    return report;
  }
  
  /**
   * Sanitize content by redacting PII
   */
  sanitizeContent(content: string): string {
    return this.piiDetector.sanitize(content);
  }
  
  // ==========================================================================
  // Audit Logging
  // ==========================================================================
  
  /**
   * Log a security event
   */
  logSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>): void {
    this.auditLogger.log(event);
  }
  
  /**
   * Get security events
   */
  getSecurityEvents(options?: Parameters<AuditLogger['getEvents']>[0]): SecurityEvent[] {
    return this.auditLogger.getEvents(options);
  }
  
  /**
   * Get audit logger instance
   */
  getAuditLogger(): AuditLogger {
    return this.auditLogger;
  }
  
  // ==========================================================================
  // Error Handling
  // ==========================================================================
  
  /**
   * Create a standardized proxy error
   */
  createError(code: ProxyErrorCode, message: string, details?: Record<string, unknown>): ProxyError {
    const statusCodes: Record<ProxyErrorCode, number> = {
      'AUTHENTICATION_FAILED': 401,
      'AUTHORIZATION_FAILED': 403,
      'RATE_LIMIT_EXCEEDED': 429,
      'PROVIDER_UNAVAILABLE': 503,
      'MODEL_NOT_FOUND': 404,
      'INVALID_REQUEST': 400,
      'CONTENT_FILTERED': 400,
      'PII_DETECTED': 400,
      'COST_LIMIT_EXCEEDED': 429,
      'TIMEOUT': 504,
      'INTERNAL_ERROR': 500
    };
    
    return {
      code,
      message,
      statusCode: statusCodes[code] || 500,
      details
    };
  }
  
  // ==========================================================================
  // Configuration
  // ==========================================================================
  
  /**
   * Update security configuration
   */
  updateConfig(config: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Re-create rate limiter if config changed
    if (config.rateLimits) {
      this.rateLimiter = new RateLimiter(this.config.rateLimits);
    }
  }
  
  /**
   * Get current configuration
   */
  getConfig(): SecurityConfig {
    return { ...this.config };
  }
  
  /**
   * Add blocked pattern
   */
  addBlockedPattern(pattern: RegExp): void {
    this.contentFilter.addBlockedPattern(pattern);
  }
  
  /**
   * Add PII pattern
   */
  addPIIPattern(name: string, pattern: RegExp): void {
    this.piiDetector.addPattern(name, pattern);
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Extract bearer token from authorization header
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Extract API key from various header formats
 */
export function extractApiKey(headers: Record<string, string | string[] | undefined>): string | null {
  // Check x-api-key header
  const apiKey = headers['x-api-key'];
  if (typeof apiKey === 'string') return apiKey;
  
  // Check authorization header
  const auth = headers['authorization'];
  if (typeof auth === 'string') {
    return extractBearerToken(auth);
  }
  
  return null;
}

/**
 * Generate secure random API key
 */
export function generateApiKey(prefix: string = 'dash'): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = '';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}_${key}`;
}

/**
 * Hash a password/API key for storage
 */
export async function hashCredential(credential: string): Promise<string> {
  // In production, use bcrypt or Argon2
  // This is a simple hash for demonstration
  const encoder = new TextEncoder();
  const data = encoder.encode(credential);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a credential against its hash
 */
export async function verifyCredential(credential: string, hash: string): Promise<boolean> {
  const credentialHash = await hashCredential(credential);
  return credentialHash === hash;
}
