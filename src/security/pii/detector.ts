/**
 * PII Detector
 * 
 * Detects Personally Identifiable Information (PII) in text and data.
 * Supports multiple types of PII including emails, phone numbers, SSNs,
 * credit cards, and custom patterns.
 */

import { EventEmitter } from 'events';

// PII types
export type PIIType =
  | 'email'
  | 'phone'
  | 'ssn'
  | 'credit_card'
  | 'ip_address'
  | 'mac_address'
  | 'date_of_birth'
  | 'passport'
  | 'driver_license'
  | 'bank_account'
  | 'api_key'
  | 'password'
  | 'token'
  | 'name'
  | 'address'
  | 'custom';

// Severity levels for detected PII
export type PIISeverity = 'low' | 'medium' | 'high' | 'critical';

// Detection result
export interface PIIDetection {
  type: PIIType;
  value: string;
  position: {
    start: number;
    end: number;
  };
  confidence: number; // 0-1
  severity: PIISeverity;
  masked?: string;
  metadata?: Record<string, unknown>;
}

// Detection options
export interface DetectionOptions {
  types?: PIIType[];
  minConfidence?: number;
  includeCustomPatterns?: boolean;
  customPatterns?: CustomPattern[];
  ignoreCase?: boolean;
}

// Custom pattern definition
export interface CustomPattern {
  name: string;
  pattern: RegExp;
  type: PIIType;
  severity: PIISeverity;
  validator?: (match: string) => boolean;
}

// Scan result
export interface ScanResult {
  hasPII: boolean;
  detections: PIIDetection[];
  byType: Record<PIIType, PIIDetection[]>;
  highestSeverity: PIISeverity;
  riskScore: number; // 0-100
}

// Default PII patterns
const DEFAULT_PATTERNS: CustomPattern[] = [
  // Email addresses
  {
    name: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    type: 'email',
    severity: 'medium',
  },
  
  // Phone numbers (various formats)
  {
    name: 'phone_us',
    pattern: /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
    type: 'phone',
    severity: 'medium',
  },
  
  // SSN (US Social Security Number)
  {
    name: 'ssn',
    pattern: /\b(?!000|666|9\d{2})\d{3}[-.\s]?(?!00)\d{2}[-.\s]?(?!0000)\d{4}\b/g,
    type: 'ssn',
    severity: 'critical',
  },
  
  // Credit card numbers
  {
    name: 'credit_card',
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})\b/g,
    type: 'credit_card',
    severity: 'critical',
    validator: (match) => {
      // Luhn algorithm validation
      let sum = 0;
      let isEven = false;
      const digits = match.replace(/\D/g, '').split('').reverse().map(Number);
      
      for (const digit of digits) {
        if (isEven) {
          const doubled = digit * 2;
          sum += doubled > 9 ? doubled - 9 : doubled;
        } else {
          sum += digit;
        }
        isEven = !isEven;
      }
      
      return sum % 10 === 0;
    },
  },
  
  // IP addresses
  {
    name: 'ip_v4',
    pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    type: 'ip_address',
    severity: 'low',
  },
  
  // MAC addresses
  {
    name: 'mac_address',
    pattern: /\b([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})\b/g,
    type: 'mac_address',
    severity: 'low',
  },
  
  // Date of birth (common formats)
  {
    name: 'date_of_birth',
    pattern: /\b(?:0[1-9]|1[0-2])[\/\-.](?:0[1-9]|[12]\d|3[01])[\/\-.](?:19|20)\d{2}\b/g,
    type: 'date_of_birth',
    severity: 'high',
  },
  
  // API keys (common patterns)
  {
    name: 'api_key_generic',
    pattern: /\b(?:api[_-]?key|apikey)[\s]*[:=][\s]*['"]?([a-zA-Z0-9_\-]{16,})['"]?/gi,
    type: 'api_key',
    severity: 'high',
  },
  
  // AWS Access Key ID
  {
    name: 'aws_access_key',
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
    type: 'api_key',
    severity: 'high',
  },
  
  // GitHub tokens
  {
    name: 'github_token',
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/g,
    type: 'token',
    severity: 'critical',
  },
  
  // Slack tokens
  {
    name: 'slack_token',
    pattern: /\bxox[baprs]-[0-9]{10,13}-[0-9]{10,13}(-[a-zA-Z0-9]{24})?\b/g,
    type: 'token',
    severity: 'critical',
  },
  
  // JWT tokens
  {
    name: 'jwt_token',
    pattern: /\beyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\b/g,
    type: 'token',
    severity: 'high',
  },
  
  // Password patterns
  {
    name: 'password_in_text',
    pattern: /\b(?:password|passwd|pwd)[\s]*[:=][\s]*['"]?([^\s'"]{4,})['"]?/gi,
    type: 'password',
    severity: 'critical',
  },
  
  // Bank account numbers (basic pattern)
  {
    name: 'bank_account',
    pattern: /\b\d{8,17}\b/g,
    type: 'bank_account',
    severity: 'high',
  },
  
  // Passport numbers (generic pattern)
  {
    name: 'passport',
    pattern: /\b[A-Z]{1,2}\d{6,9}\b/g,
    type: 'passport',
    severity: 'high',
  },
];

// Severity weights for risk scoring
const SEVERITY_WEIGHTS: Record<PIISeverity, number> = {
  low: 10,
  medium: 25,
  high: 50,
  critical: 100,
};

/**
 * PII Detector
 */
export class PIIDetector extends EventEmitter {
  private patterns: CustomPattern[];
  private options: DetectionOptions;

  constructor(options: DetectionOptions = {}) {
    super();
    this.options = {
      types: undefined,
      minConfidence: 0.7,
      includeCustomPatterns: true,
      customPatterns: [],
      ignoreCase: true,
      ...options,
    };

    this.patterns = [
      ...DEFAULT_PATTERNS,
      ...(this.options.customPatterns || []),
    ];
  }

  /**
   * Scan text for PII
   */
  scan(text: string, options?: Partial<DetectionOptions>): ScanResult {
    const opts = { ...this.options, ...options };
    const detections: PIIDetection[] = [];

    for (const pattern of this.patterns) {
      // Skip if types filter is specified and pattern type not included
      if (opts.types && !opts.types.includes(pattern.type)) {
        continue;
      }

      // Reset regex lastIndex
      pattern.pattern.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = pattern.pattern.exec(text)) !== null) {
        const value = match[0];
        const start = match.index;
        const end = start + value.length;

        // Run validator if present
        if (pattern.validator && !pattern.validator(value)) {
          continue;
        }

        // Calculate confidence
        const confidence = this.calculateConfidence(value, pattern);

        // Skip if below minimum confidence
        if (confidence < (opts.minConfidence || 0.7)) {
          continue;
        }

        const detection: PIIDetection = {
          type: pattern.type,
          value,
          position: { start, end },
          confidence,
          severity: pattern.severity,
          metadata: {
            pattern: pattern.name,
          },
        };

        detections.push(detection);
      }
    }

    // Remove overlapping detections (keep highest severity)
    const filteredDetections = this.removeOverlapping(detections);

    // Group by type
    const byType = this.groupByType(filteredDetections);

    // Calculate highest severity
    const highestSeverity = this.calculateHighestSeverity(filteredDetections);

    // Calculate risk score
    const riskScore = this.calculateRiskScore(filteredDetections);

    const result: ScanResult = {
      hasPII: filteredDetections.length > 0,
      detections: filteredDetections,
      byType,
      highestSeverity,
      riskScore,
    };

    if (result.hasPII) {
      this.emit('pii:detected', result);
    }

    return result;
  }

  /**
   * Scan object recursively for PII
   */
  scanObject(obj: unknown, path: string = '', options?: Partial<DetectionOptions>): Array<{
    path: string;
    detection: PIIDetection;
  }> {
    const results: Array<{ path: string; detection: PIIDetection }> = [];

    if (obj === null || obj === undefined) {
      return results;
    }

    if (typeof obj === 'string') {
      const scanResult = this.scan(obj, options);
      for (const detection of scanResult.detections) {
        results.push({ path, detection });
      }
    } else if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        results.push(...this.scanObject(obj[i], `${path}[${i}]`, options));
      }
    } else if (typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        const newPath = path ? `${path}.${key}` : key;
        results.push(...this.scanObject(value, newPath, options));
      }
    }

    return results;
  }

  /**
   * Check if text contains PII
   */
  containsPII(text: string, types?: PIIType[]): boolean {
    const result = this.scan(text, { types });
    return result.hasPII;
  }

  /**
   * Get all detected PII types in text
   */
  getDetectedTypes(text: string): PIIType[] {
    const result = this.scan(text);
    return Object.keys(result.byType) as PIIType[];
  }

  /**
   * Add custom pattern
   */
  addPattern(pattern: CustomPattern): void {
    this.patterns.push(pattern);
    this.emit('pattern:added', pattern);
  }

  /**
   * Remove custom pattern
   */
  removePattern(name: string): boolean {
    const index = this.patterns.findIndex(p => p.name === name);
    if (index >= 0) {
      const removed = this.patterns.splice(index, 1)[0];
      this.emit('pattern:removed', removed);
      return true;
    }
    return false;
  }

  /**
   * List all patterns
   */
  listPatterns(): CustomPattern[] {
    return [...this.patterns];
  }

  /**
   * Get patterns by type
   */
  getPatternsByType(type: PIIType): CustomPattern[] {
    return this.patterns.filter(p => p.type === type);
  }

  /**
   * Validate a single value for PII
   */
  validate(value: string, types?: PIIType[]): PIIDetection | null {
    const result = this.scan(value, { types });
    
    // Return the highest confidence detection
    if (result.detections.length > 0) {
      return result.detections.reduce((highest, current) =>
        current.confidence > highest.confidence ? current : highest
      );
    }
    
    return null;
  }

  /**
   * Calculate confidence score for a match
   */
  private calculateConfidence(value: string, pattern: CustomPattern): number {
    let confidence = 0.8; // Base confidence

    // Adjust based on value length
    if (value.length >= 8 && value.length <= 50) {
      confidence += 0.1;
    }

    // Adjust based on pattern type specifics
    switch (pattern.type) {
      case 'email':
        // Check for valid email format
        if (value.includes('@') && value.includes('.')) {
          confidence += 0.1;
        }
        break;
      case 'phone':
        // Check for enough digits
        const digits = value.replace(/\D/g, '').length;
        if (digits === 10) {
          confidence += 0.1;
        }
        break;
      case 'credit_card':
        // Already validated by Luhn algorithm if validator present
        confidence = pattern.validator ? 0.95 : 0.7;
        break;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Remove overlapping detections, keeping highest severity
   */
  private removeOverlapping(detections: PIIDetection[]): PIIDetection[] {
    const sorted = detections.sort((a, b) => b.severity.localeCompare(a.severity));
    const result: PIIDetection[] = [];

    for (const detection of sorted) {
      // Check if this overlaps with any kept detection
      const overlaps = result.some(kept =>
        detection.position.start < kept.position.end &&
        detection.position.end > kept.position.start
      );

      if (!overlaps) {
        result.push(detection);
      }
    }

    return result.sort((a, b) => a.position.start - b.position.start);
  }

  /**
   * Group detections by type
   */
  private groupByType(detections: PIIDetection[]): Record<PIIType, PIIDetection[]> {
    const grouped: Partial<Record<PIIType, PIIDetection[]>> = {};

    for (const detection of detections) {
      if (!grouped[detection.type]) {
        grouped[detection.type] = [];
      }
      grouped[detection.type]!.push(detection);
    }

    return grouped as Record<PIIType, PIIDetection[]>;
  }

  /**
   * Calculate highest severity
   */
  private calculateHighestSeverity(detections: PIIDetection[]): PIISeverity {
    if (detections.length === 0) {
      return 'low';
    }

    const severities: PIISeverity[] = ['low', 'medium', 'high', 'critical'];
    let highestIndex = 0;

    for (const detection of detections) {
      const index = severities.indexOf(detection.severity);
      if (index > highestIndex) {
        highestIndex = index;
      }
    }

    return severities[highestIndex];
  }

  /**
   * Calculate risk score (0-100)
   */
  private calculateRiskScore(detections: PIIDetection[]): number {
    if (detections.length === 0) {
      return 0;
    }

    let totalWeight = 0;
    for (const detection of detections) {
      totalWeight += SEVERITY_WEIGHTS[detection.severity] * detection.confidence;
    }

    // Scale to 0-100
    const score = Math.min(100, totalWeight / Math.max(1, detections.length) * 2);
    return Math.round(score);
  }

  /**
   * Get detection statistics
   */
  getStats(): {
    totalPatterns: number;
    patternsByType: Record<PIIType, number>;
  } {
    const patternsByType: Partial<Record<PIIType, number>> = {};

    for (const pattern of this.patterns) {
      patternsByType[pattern.type] = (patternsByType[pattern.type] || 0) + 1;
    }

    return {
      totalPatterns: this.patterns.length,
      patternsByType: patternsByType as Record<PIIType, number>,
    };
  }
}

// Singleton instance
let detectorInstance: PIIDetector | null = null;

export function getPIIDetector(options?: DetectionOptions): PIIDetector {
  if (!detectorInstance) {
    detectorInstance = new PIIDetector(options);
  }
  return detectorInstance;
}

// Factory function
export function createPIIDetector(options?: DetectionOptions): PIIDetector {
  return new PIIDetector(options);
}

// Note: Types already exported at top of file

export default PIIDetector;
