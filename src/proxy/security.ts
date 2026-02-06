/**
 * Proxy Security - Authentication, authorization, and content filtering
 */

import { AuthContext, AuthResult, RateLimitStatus, FilterResult, PIIReport, CompletionRequest } from './types';

export class ProxySecurity {
  private apiKeys: Map<string, AuthContext> = new Map();
  private rateLimits: Map<string, { count: number; tokens: number; resetAt: Date }> = new Map();
  private requestsPerMinute: number;
  private tokensPerMinute: number;

  constructor(requestsPerMinute: number = 60, tokensPerMinute: number = 10000) {
    this.requestsPerMinute = requestsPerMinute;
    this.tokensPerMinute = tokensPerMinute;
  }

  /**
   * Register an API key
   */
  registerApiKey(apiKey: string, context: AuthContext): void {
    this.apiKeys.set(apiKey, context);
  }

  /**
   * Authenticate request using API key
   */
  authenticateRequest(apiKey: string | undefined): AuthResult {
    if (!apiKey) {
      return { authenticated: false, error: 'API key required' };
    }

    const context = this.apiKeys.get(apiKey);
    if (!context) {
      return { authenticated: false, error: 'Invalid API key' };
    }

    return { authenticated: true, user: context };
  }

  /**
   * Check rate limit for user
   */
  checkRateLimit(userId: string, estimatedTokens: number = 1000): RateLimitStatus {
    const now = new Date();
    const key = `${userId}:${now.getHours()}:${Math.floor(now.getMinutes() / 5) * 5}`;
    
    const current = this.rateLimits.get(key);
    
    if (!current) {
      const resetAt = new Date(now);
      resetAt.setMinutes(resetAt.getMinutes() + 5);
      this.rateLimits.set(key, { count: 1, tokens: estimatedTokens, resetAt });
      return {
        allowed: true,
        limit: this.requestsPerMinute,
        remaining: this.requestsPerMinute - 1,
        resetAt
      };
    }

    if (now > current.resetAt) {
      const resetAt = new Date(now);
      resetAt.setMinutes(resetAt.getMinutes() + 5);
      this.rateLimits.set(key, { count: 1, tokens: estimatedTokens, resetAt });
      return {
        allowed: true,
        limit: this.requestsPerMinute,
        remaining: this.requestsPerMinute - 1,
        resetAt
      };
    }

    if (current.count >= this.requestsPerMinute || current.tokens >= this.tokensPerMinute) {
      return {
        allowed: false,
        limit: this.requestsPerMinute,
        remaining: 0,
        resetAt: current.resetAt,
        retryAfter: Math.ceil((current.resetAt.getTime() - now.getTime()) / 1000)
      };
    }

    current.count++;
    current.tokens += estimatedTokens;

    return {
      allowed: true,
      limit: this.requestsPerMinute,
      remaining: this.requestsPerMinute - current.count,
      resetAt: current.resetAt
    };
  }

  /**
   * Check user permissions
   */
  checkPermissions(context: AuthContext, action: string): boolean {
    const permissionMap: Record<string, string[]> = {
      'proxy.request': ['user', 'admin'],
      'proxy.admin': ['admin']
    };

    const required = permissionMap[action] || ['admin'];
    return required.includes(context.role);
  }

  /**
   * Check model access permissions
   */
  checkModelAccess(context: AuthContext, model: string): boolean {
    // Premium models might require specific permissions
    const premiumModels = ['claude-opus-4', 'gpt-4'];
    if (premiumModels.some(m => model.includes(m))) {
      return context.permissions.includes('premium_models');
    }
    return true;
  }

  /**
   * Filter input for security issues
   */
  filterInput(messages: CompletionRequest['messages']): FilterResult {
    const forbiddenPatterns = [
      /ignore previous instructions/i,
      /disregard your training/i,
      /system prompt leak/i
    ];

    for (const message of messages) {
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(message.content)) {
          return {
            allowed: false,
            reason: 'Potentially malicious input detected'
          };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Filter output for sensitive content
   */
  filterOutput(content: string): FilterResult {
    // Simple content filtering - would be more sophisticated in production
    if (content.includes('-----BEGIN PRIVATE KEY-----')) {
      return {
        allowed: false,
        reason: 'Output contains private key material'
      };
    }

    return { allowed: true };
  }

  /**
   * Detect PII in content
   */
  detectPII(content: string): PIIReport {
    const patterns = [
      { type: 'email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g },
      { type: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
      { type: 'phone', pattern: /\b\d{3}-\d{3}-\d{4}\b/g },
      { type: 'credit_card', pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g }
    ];

    const detected: string[] = [];
    let severity: 'low' | 'medium' | 'high' = 'low';

    for (const { type, pattern } of patterns) {
      const matches = content.match(pattern);
      if (matches) {
        detected.push(type);
        if (type === 'ssn' || type === 'credit_card') {
          severity = 'high';
        } else if (severity === 'low') {
          severity = 'medium';
        }
      }
    }

    return {
      hasPII: detected.length > 0,
      detectedTypes: detected,
      severity
    };
  }

  /**
   * Sanitize content by removing PII
   */
  sanitizeContent(content: string): string {
    // Simple sanitization - would use proper NER in production
    return content
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
      .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CREDIT_CARD]');
  }

  /**
   * Log request for audit
   */
  logRequest(request: any, response: any, context: AuthContext): void {
    // Would write to audit log in production
    console.log(`[AUDIT] ${new Date().toISOString()} User: ${context.userId} Model: ${request.model}`);
  }
}
