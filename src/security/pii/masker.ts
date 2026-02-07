/**
 * PII Masker
 * 
 * Masks and anonymizes Personally Identifiable Information (PII).
 * Provides multiple masking strategies for different PII types.
 */

import { EventEmitter } from 'events';
import { createHash, randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import type { PIIDetection, PIIType, ScanResult } from './detector';
import { PIIDetector } from './detector';

// Masking strategies
export type MaskingStrategy =
  | 'full'           // Replace with fixed mask: ****
  | 'partial'        // Show first/last chars: j***@example.com
  | 'hash'           // Replace with hash: a1b2c3...
  | 'tokenize'       // Replace with token: [PII-123]
  | 'encrypt'        // Encrypt and store reference
  | 'redact'         // Remove completely
  | 'custom';        // Use custom function

// Masking options
export interface MaskingOptions {
  strategy?: MaskingStrategy;
  customMasker?: (value: string, type: PIIType) => string;
  preserveLength?: boolean;
  prefixLength?: number;
  suffixLength?: number;
  tokenPrefix?: string;
  hashAlgorithm?: 'sha256' | 'sha512';
  encryptionKey?: Buffer;
}

// Default masking rules by PII type
export interface MaskingRule {
  type: PIIType;
  strategy: MaskingStrategy;
  options?: Partial<MaskingOptions>;
}

const DEFAULT_MASKING_RULES: MaskingRule[] = [
  { type: 'email', strategy: 'partial', options: { prefixLength: 2, suffixLength: 4 } },
  { type: 'phone', strategy: 'partial', options: { prefixLength: 0, suffixLength: 4 } },
  { type: 'ssn', strategy: 'full' },
  { type: 'credit_card', strategy: 'partial', options: { prefixLength: 0, suffixLength: 4 } },
  { type: 'ip_address', strategy: 'partial', options: { prefixLength: 0, suffixLength: 3 } },
  { type: 'mac_address', strategy: 'hash' },
  { type: 'date_of_birth', strategy: 'partial', options: { prefixLength: 0, suffixLength: 4 } },
  { type: 'passport', strategy: 'full' },
  { type: 'driver_license', strategy: 'full' },
  { type: 'bank_account', strategy: 'partial', options: { prefixLength: 0, suffixLength: 4 } },
  { type: 'api_key', strategy: 'full' },
  { type: 'password', strategy: 'full' },
  { type: 'token', strategy: 'full' },
  { type: 'name', strategy: 'partial', options: { prefixLength: 1, suffixLength: 1 } },
  { type: 'address', strategy: 'hash' },
  { type: 'custom', strategy: 'full' },
];

// Token vault for encryption strategy
interface TokenVault {
  [token: string]: {
    value: string;
    type: PIIType;
    encrypted: string;
    createdAt: Date;
  };
}

/**
 * PII Masker
 */
export class PIIMasker extends EventEmitter {
  private detector: PIIDetector;
  private rules: Map<PIIType, MaskingRule>;
  private tokenVault: TokenVault = {};
  private tokenCounter: number = 0;
  private encryptionKey?: Buffer;

  constructor(detector?: PIIDetector) {
    super();
    this.detector = detector || new PIIDetector();
    this.rules = new Map();
    
    // Initialize default rules
    for (const rule of DEFAULT_MASKING_RULES) {
      this.rules.set(rule.type, rule);
    }
  }

  /**
   * Set encryption key for encrypted masking
   */
  setEncryptionKey(key: string | Buffer): void {
    if (typeof key === 'string') {
      this.encryptionKey = scryptSync(key, 'salt', 32);
    } else {
      this.encryptionKey = key;
    }
  }

  /**
   * Mask PII in text
   */
  mask(text: string, options?: Partial<MaskingOptions>): string {
    const scanResult = this.detector.scan(text);
    return this.applyMasking(text, scanResult, options);
  }

  /**
   * Mask with specific strategy
   */
  maskWithStrategy(
    text: string,
    strategy: MaskingStrategy,
    options?: Partial<MaskingOptions>
  ): string {
    const scanResult = this.detector.scan(text);
    return this.applyMasking(text, scanResult, { ...options, strategy });
  }

  /**
   * Mask specific PII types only
   */
  maskTypes(text: string, types: PIIType[], options?: Partial<MaskingOptions>): string {
    const scanResult = this.detector.scan(text, { types });
    return this.applyMasking(text, scanResult, options);
  }

  /**
   * Mask object recursively
   */
  maskObject<T extends Record<string, unknown>>(
    obj: T,
    options?: Partial<MaskingOptions>
  ): T {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.mask(value, options);
      } else if (Array.isArray(value)) {
        result[key] = value.map(item => {
          if (typeof item === 'string') {
            return this.mask(item, options);
          } else if (typeof item === 'object' && item !== null) {
            return this.maskObject(item as Record<string, unknown>, options);
          }
          return item;
        });
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.maskObject(value as Record<string, unknown>, options);
      } else {
        result[key] = value;
      }
    }

    return result as T;
  }

  /**
   * Mask specific field by key name
   */
  maskFields<T extends Record<string, unknown>>(
    obj: T,
    fields: string[],
    strategy: MaskingStrategy = 'full'
  ): T {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (fields.includes(key.toLowerCase()) && typeof value === 'string') {
        result[key] = this.applyMask(value, strategy, { preserveLength: true });
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.maskFields(
          value as Record<string, unknown>,
          fields,
          strategy
        );
      } else {
        result[key] = value;
      }
    }

    return result as T;
  }

  /**
   * Add custom masking rule
   */
  addRule(rule: MaskingRule): void {
    this.rules.set(rule.type, rule);
    this.emit('rule:added', rule);
  }

  /**
   * Get masking rule
   */
  getRule(type: PIIType): MaskingRule | undefined {
    return this.rules.get(type);
  }

  /**
   * Update masking rule
   */
  updateRule(type: PIIType, updates: Partial<Omit<MaskingRule, 'type'>>): void {
    const existing = this.rules.get(type);
    if (existing) {
      const updated: MaskingRule = { ...existing, ...updates };
      this.rules.set(type, updated);
      this.emit('rule:updated', updated);
    }
  }

  /**
   * Remove masking rule
   */
  removeRule(type: PIIType): boolean {
    const removed = this.rules.delete(type);
    if (removed) {
      this.emit('rule:removed', { type });
    }
    return removed;
  }

  /**
   * Apply masking based on scan result
   */
  private applyMasking(
    text: string,
    scanResult: ScanResult,
    options?: Partial<MaskingOptions>
  ): string {
    if (!scanResult.hasPII) {
      return text;
    }

    let result = text;
    const offset = 0;

    // Sort detections by position (reverse order to maintain indices)
    const sortedDetections = [...scanResult.detections].sort(
      (a, b) => b.position.start - a.position.start
    );

    for (const detection of sortedDetections) {
      const rule = options?.strategy
        ? { type: detection.type, strategy: options.strategy, options }
        : this.rules.get(detection.type);

      if (!rule) continue;

      const maskedValue = this.applyMask(
        detection.value,
        rule.strategy,
        { ...rule.options, ...options }
      );

      result =
        result.substring(0, detection.position.start + offset) +
        maskedValue +
        result.substring(detection.position.end + offset);
    }

    return result;
  }

  /**
   * Apply mask to single value
   */
  applyMask(value: string, strategy: MaskingStrategy, options?: Partial<MaskingOptions>): string {
    switch (strategy) {
      case 'full':
        return this.fullMask(value, options);

      case 'partial':
        return this.partialMask(value, options);

      case 'hash':
        return this.hashMask(value, options);

      case 'tokenize':
        return this.tokenMask(value, options);

      case 'encrypt':
        return this.encryptMask(value, options);

      case 'redact':
        return '[REDACTED]';

      case 'custom':
        if (options?.customMasker) {
          return options.customMasker(value, 'custom');
        }
        return this.fullMask(value, options);

      default:
        return this.fullMask(value, options);
    }
  }

  /**
   * Full masking - replace with asterisks
   */
  private fullMask(value: string, options?: Partial<MaskingOptions>): string {
    if (options?.preserveLength) {
      return '*'.repeat(value.length);
    }
    return '****';
  }

  /**
   * Partial masking - show first/last characters
   */
  private partialMask(value: string, options?: Partial<MaskingOptions>): string {
    const prefixLen = options?.prefixLength ?? 2;
    const suffixLen = options?.suffixLength ?? 2;

    if (value.length <= prefixLen + suffixLen) {
      return '*'.repeat(value.length);
    }

    const prefix = value.substring(0, prefixLen);
    const suffix = value.substring(value.length - suffixLen);
    const middle = '*'.repeat(Math.max(1, value.length - prefixLen - suffixLen));

    return `${prefix}${middle}${suffix}`;
  }

  /**
   * Hash masking - replace with hash
   */
  private hashMask(value: string, options?: Partial<MaskingOptions>): string {
    const algorithm = options?.hashAlgorithm || 'sha256';
    const hash = createHash(algorithm).update(value).digest('hex');
    return `[HASH:${hash.substring(0, 16)}]`;
  }

  /**
   * Token masking - replace with token reference
   */
  private tokenMask(value: string, options?: Partial<MaskingOptions>): string {
    const prefix = options?.tokenPrefix || 'PII';
    this.tokenCounter++;
    const token = `[${prefix}-${this.tokenCounter}]`;
    
    this.tokenVault[token] = {
      value,
      type: 'custom',
      encrypted: '',
      createdAt: new Date(),
    };

    return token;
  }

  /**
   * Encrypt masking - encrypt and store reference
   */
  private encryptMask(value: string, options?: Partial<MaskingOptions>): string {
    if (!this.encryptionKey) {
      // Fall back to tokenization if no key
      return this.tokenMask(value, options);
    }

    try {
      const iv = randomBytes(16);
      const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
      
      let encrypted = cipher.update(value, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag().toString('hex');
      
      this.tokenCounter++;
      const token = `[ENC-${this.tokenCounter}]`;
      
      this.tokenVault[token] = {
        value: '',
        type: 'custom',
        encrypted: `${iv.toString('hex')}:${authTag}:${encrypted}`,
        createdAt: new Date(),
      };

      return token;
    } catch {
      return this.fullMask(value, options);
    }
  }

  /**
   * Unmask a tokenized value
   */
  unmask(token: string): string | null {
    const vaultEntry = this.tokenVault[token];
    
    if (!vaultEntry) {
      return null;
    }

    // If encrypted, decrypt
    if (vaultEntry.encrypted && this.encryptionKey) {
      try {
        const [ivHex, authTagHex, encrypted] = vaultEntry.encrypted.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        
        const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
      } catch {
        return null;
      }
    }

    return vaultEntry.value || null;
  }

  /**
   * Check if text is a mask token
   */
  isMaskToken(text: string): boolean {
    return text.startsWith('[') && text.endsWith(']') && 
           (text.includes('PII-') || text.includes('ENC-') || text.includes('HASH:'));
  }

  /**
   * Get token vault statistics
   */
  getVaultStats(): {
    totalTokens: number;
    encryptedTokens: number;
    oldestToken?: Date;
  } {
    const tokens = Object.values(this.tokenVault);
    
    return {
      totalTokens: tokens.length,
      encryptedTokens: tokens.filter(t => t.encrypted).length,
      oldestToken: tokens.length > 0 
        ? tokens.reduce((oldest, t) => t.createdAt < oldest ? t.createdAt : oldest, tokens[0].createdAt)
        : undefined,
    };
  }

  /**
   * Clear token vault
   */
  clearVault(): void {
    this.tokenVault = {};
    this.tokenCounter = 0;
    this.emit('vault:cleared');
  }

  /**
   * Get masking statistics
   */
  getStats(): {
    totalRules: number;
    rulesByType: Record<string, number>;
    vaultStats: ReturnType<typeof this.getVaultStats>;
  } {
    const rulesByType: Record<string, number> = {};
    
    for (const [type] of this.rules) {
      rulesByType[type] = (rulesByType[type] || 0) + 1;
    }

    return {
      totalRules: this.rules.size,
      rulesByType,
      vaultStats: this.getVaultStats(),
    };
  }
}

// Singleton instance
let maskerInstance: PIIMasker | null = null;

export function getPIIMasker(detector?: PIIDetector): PIIMasker {
  if (!maskerInstance) {
    maskerInstance = new PIIMasker(detector);
  }
  return maskerInstance;
}

// Factory function
export function createPIIMasker(detector?: PIIDetector): PIIMasker {
  return new PIIMasker(detector);
}

// Export default rules
export { DEFAULT_MASKING_RULES };

// Note: Types already exported at top of file

export default PIIMasker;
