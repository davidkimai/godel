/**
 * @fileoverview Intent Parser - Natural language to structured intent conversion
 * 
 * This module provides deterministic parsing of natural language commands
 * into structured Intent objects. It uses regex patterns and keyword matching
 * to identify intent types, extract subjects, requirements, and assess complexity.
 * 
 * Target accuracy: 90%+ for common patterns
 * 
 * @module @godel/cli/intent/parser
 */

import {
  Intent,
  IntentType,
  INTENT_TYPES,
  ComplexityLevel,
  ParseResult,
  IntentPattern,
  ParserConfig,
} from './types';

// ============================================================================
// DEFAULT PARSER CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: ParserConfig = {
  minConfidence: 0.6,
  includeAlternatives: false,
  strictMode: false,
};

// ============================================================================
// INTENT PATTERNS
// ============================================================================

/**
 * Built-in intent patterns for natural language matching.
 * Each pattern includes primary regex patterns, keywords, and complexity indicators.
 */
// NOTE: Patterns are matched in order, so more specific patterns should come first
const BUILT_IN_PATTERNS: IntentPattern[] = [
  // TEST patterns (must come before implement since "write tests" is more specific than "write")
  {
    type: 'test',
    patterns: [
      // Allow adjectives between write/add/create and tests (including hyphenated words)
      /^write\s+(?:[\w-]+\s+)*tests?\s+(?:for\s+)?(.+)$/i,
      /^add\s+(?:[\w-]+\s+)*tests?\s+(?:for\s+)?(.+)$/i,
      /^create\s+(?:[\w-]+\s+)*tests?\s+(?:for\s+)?(.+)$/i,
      /^test\s+(.+)$/i,
      /^verify\s+(.+)$/i,
      /^validate\s+(.+)$/i,
      /^check\s+(.+)$/i,
    ],
    keywords: ['test', 'tests', 'testing', 'verify', 'validate', 'check', 'assert', 'spec'],
    complexityIndicators: {
      low: ['unit', 'simple', 'basic'],
      medium: ['integration', 'component', 'feature'],
      high: ['e2e', 'end-to-end', 'comprehensive', 'full coverage', 'load', 'performance'],
    },
  },
  {
    type: 'implement',
    patterns: [
      /^implement\s+(.+)$/i,
      /^create\s+(.+)$/i,
      /^add\s+(.+)$/i,
      /^build\s+(.+)$/i,
      /^develop\s+(.+)$/i,
      /^make\s+(.+)$/i,
      /^set up\s+(.+)$/i,
      /^write\s+(.+)$/i,
    ],
    keywords: ['implement', 'create', 'add', 'build', 'develop', 'make', 'setup', 'set up', 'write', 'generate', 'produce'],
    complexityIndicators: {
      low: ['simple', 'basic', 'quick', 'small', 'minor', 'trivial'],
      medium: ['full', 'complete', 'proper', 'standard', 'normal'],
      high: ['complex', 'comprehensive', 'advanced', 'sophisticated', 'enterprise', 'scalable', 'robust'],
    },
  },
  {
    type: 'refactor',
    patterns: [
      /^refactor\s+(.+)$/i,
      /^rewrite\s+(.+)$/i,
      /^restructure\s+(.+)$/i,
      /^reorganize\s+(.+)$/i,
      /^clean up\s+(.+)$/i,
      /^optimize\s+(.+)$/i,
      /^improve\s+(.+)$/i,
      /^modernize\s+(.+)$/i,
    ],
    keywords: ['refactor', 'rewrite', 'restructure', 'reorganize', 'cleanup', 'clean up', 'optimize', 'improve', 'modernize'],
    complexityIndicators: {
      low: ['minor', 'small', 'quick', 'simple cleanup'],
      medium: ['code', 'module', 'component', 'function'],
      high: ['architecture', 'system', 'large-scale', 'major', 'core', 'fundamental'],
    },
  },
  {
    type: 'review',
    patterns: [
      /^review\s+(.+)$/i,
      /^audit\s+(.+)$/i,
      /^analyze\s+code\s+(.+)$/i,
      /^check\s+code\s+(.+)$/i,
      /^inspect\s+(.+)$/i,
      /^examine\s+(.+)$/i,
    ],
    keywords: ['review', 'audit', 'inspect', 'examine', 'analyze code', 'check code', 'assess'],
    complexityIndicators: {
      low: ['quick', 'surface', 'basic', 'simple'],
      medium: ['code review', 'security', 'performance'],
      high: ['deep', 'thorough', 'comprehensive', 'architectural', 'full codebase'],
    },
  },
  {
    type: 'deploy',
    patterns: [
      /^deploy\s+(.+)$/i,
      /^release\s+(.+)$/i,
      /^publish\s+(.+)$/i,
      /^ship\s+(.+)$/i,
      /^push\s+(.+)$/i,
      /^launch\s+(.+)$/i,
    ],
    keywords: ['deploy', 'release', 'publish', 'ship', 'push', 'launch', 'go live'],
    complexityIndicators: {
      low: ['staging', 'dev', 'preview'],
      medium: ['production', 'live', 'main'],
      high: ['multi-region', 'blue-green', 'canary', 'zero-downtime'],
    },
  },
  {
    type: 'fix',
    patterns: [
      /^fix\s+(.+)$/i,
      /^repair\s+(.+)$/i,
      /^resolve\s+(.+)$/i,
      /^debug\s+(.+)$/i,
      /^solve\s+(.+)$/i,
      /^correct\s+(.+)$/i,
      /^patch\s+(.+)$/i,
      /^bug\s+(?:in\s+)?(.+)$/i,
      /^issue\s+(?:with\s+)?(.+)$/i,
    ],
    keywords: ['fix', 'repair', 'resolve', 'debug', 'solve', 'correct', 'patch', 'bug', 'issue', 'error', 'problem'],
    complexityIndicators: {
      low: ['typo', 'minor', 'simple', 'quick'],
      medium: ['issue', 'error', 'defect', 'broken', 'problem'],
      high: ['critical', 'complex', 'deep', 'root cause', 'systemic'],
    },
  },
  {
    type: 'analyze',
    patterns: [
      /^analyze\s+(.+)$/i,
      /^investigate\s+(.+)$/i,
      /^research\s+(.+)$/i,
      /^study\s+(.+)$/i,
      /^explore\s+(.+)$/i,
      /^understand\s+(.+)$/i,
      /^evaluate\s+(.+)$/i,
      /^assess\s+(.+)$/i,
    ],
    keywords: ['analyze', 'analysis', 'investigate', 'research', 'study', 'explore', 'understand', 'evaluate', 'assess'],
    complexityIndicators: {
      low: ['quick', 'brief', 'surface', 'overview'],
      medium: ['detailed', 'standard', 'normal'],
      high: ['deep', 'thorough', 'comprehensive', 'extensive', 'complete'],
    },
  },
];

// ============================================================================
// REQUIREMENT EXTRACTION PATTERNS
// ============================================================================

/**
 * Patterns for extracting requirements from natural language.
 */
const REQUIREMENT_PATTERNS = [
  // "with X" pattern
  /\bwith\s+([a-zA-Z0-9_\s,]+(?:and\s+[a-zA-Z0-9_\s]+)?)/gi,
  // "using X" pattern
  /\busing\s+([a-zA-Z0-9_\s,]+(?:and\s+[a-zA-Z0-9_\s]+)?)/gi,
  // "that supports X" pattern
  /\bthat\s+supports?\s+([a-zA-Z0-9_\s,]+(?:and\s+[a-zA-Z0-9_\s]+)?)/gi,
  // "including X" pattern
  /\bincluding\s+([a-zA-Z0-9_\s,]+(?:and\s+[a-zA-Z0-9_\s]+)?)/gi,
  // "for X" pattern (when not part of "tests for")
  /\bfor\s+([a-zA-Z0-9_\s]+?)(?:\s+(?:to|that|with|using)\b|$)/gi,
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize input text for consistent parsing.
 */
function normalizeInput(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, ' ')        // Normalize whitespace
    .replace(/[;:,]$/, '')       // Remove trailing punctuation
    .replace(/^["']|["']$/g, '') // Remove surrounding quotes
    .trim();
}

/**
 * Calculate confidence score based on pattern match quality.
 */
function calculateConfidence(
  intentType: IntentType,
  matchQuality: number,
  subjectClarity: number,
  input: string
): number {
  let confidence = matchQuality * 0.5 + subjectClarity * 0.5;
  
  // Boost confidence for longer, more detailed inputs
  const wordCount = input.split(/\s+/).length;
  if (wordCount >= 5 && wordCount <= 20) {
    confidence += 0.05;
  }
  
  // Cap at 1.0
  return Math.min(1.0, confidence);
}

/**
 * Assess complexity based on keywords and input characteristics.
 */
function assessComplexity(
  intentType: IntentType,
  input: string,
  patterns: IntentPattern[]
): ComplexityLevel {
  const inputLower = input.toLowerCase();
  const pattern = patterns.find(p => p.type === intentType);
  
  if (!pattern) return 'medium';
  
  let lowScore = 0;
  let mediumScore = 0;
  let highScore = 0;
  
  // Check complexity indicators
  for (const indicator of pattern.complexityIndicators.low) {
    if (inputLower.includes(indicator.toLowerCase())) {
      lowScore++;
    }
  }
  
  for (const indicator of pattern.complexityIndicators.medium) {
    if (inputLower.includes(indicator.toLowerCase())) {
      mediumScore++;
    }
  }
  
  for (const indicator of pattern.complexityIndicators.high) {
    if (inputLower.includes(indicator.toLowerCase())) {
      highScore++;
    }
  }
  
  // Input length heuristic
  const wordCount = input.split(/\s+/).length;
  
  // Determine complexity based on indicators first, then word count as tiebreaker
  
  // High complexity indicators always win
  if (highScore > 0) return 'high';
  
  // Word count can override medium indicators for very short or very long inputs
  if (wordCount <= 2) return 'low';      // Very short inputs are low complexity
  if (wordCount >= 10) return 'high';    // Very long inputs are high complexity
  
  // Otherwise use indicator scores
  if (mediumScore > 0) return 'medium';
  if (lowScore > 0) return 'low';
  
  // Default to medium for medium-length inputs with no indicators
  return 'medium';
}

/**
 * Extract requirements from input text.
 */
function extractRequirements(input: string): string[] {
  const requirements: string[] = [];
  
  for (const pattern of REQUIREMENT_PATTERNS) {
    pattern.lastIndex = 0; // Reset regex
    let match;
    while ((match = pattern.exec(input)) !== null) {
      const requirement = match[1]
        .trim()
        .replace(/\s+and\s+/gi, ', ')
        .replace(/,\s*,/g, ',')
        .trim();
      
      if (requirement && !requirements.includes(requirement)) {
        requirements.push(requirement);
      }
    }
  }
  
  return requirements;
}

/**
 * Extract the subject from a pattern match.
 */
function extractSubject(match: RegExpExecArray, input: string): string {
  // If pattern has a capture group, use it
  if (match.length > 1 && match[1]) {
    return match[1].trim();
  }
  
  // Otherwise, remove the action keyword and return the rest
  const words = input.split(/\s+/);
  return words.slice(1).join(' ').trim();
}

// ============================================================================
// PARSER CLASS
// ============================================================================

export class IntentParser {
  private patterns: IntentPattern[];
  private config: ParserConfig;

  constructor(config: Partial<ParserConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.patterns = [...BUILT_IN_PATTERNS];
    
    // Add custom patterns if provided
    if (this.config.customPatterns) {
      this.patterns.push(...this.config.customPatterns);
    }
  }

  /**
   * Parse natural language input into a structured Intent.
   * 
   * @param input - Natural language command
   * @returns ParseResult with intent or error
   */
  parse(input: string): ParseResult {
    try {
      const normalizedInput = normalizeInput(input);
      
      if (!normalizedInput) {
        return {
          success: false,
          error: 'Empty input provided',
          confidence: 0,
        };
      }
      
      // Try to match against patterns
      let bestMatch: {
        type: IntentType;
        subject: string;
        matchQuality: number;
      } | null = null;
      
      let bestScore = 0;
      
      for (const pattern of this.patterns) {
        for (const regex of pattern.patterns) {
          regex.lastIndex = 0; // Reset regex
          const match = regex.exec(normalizedInput);
          
          if (match) {
            const subject = extractSubject(match, normalizedInput);
            // Calculate match quality based on coverage
            const matchLength = match[0].length;
            const inputLength = normalizedInput.length;
            const coverage = matchLength / inputLength;
            const matchQuality = 0.5 + (coverage * 0.5);
            
            if (matchQuality > bestScore) {
              bestScore = matchQuality;
              bestMatch = {
                type: pattern.type,
                subject,
                matchQuality,
              };
            }
          }
        }
      }
      
      // If no pattern match, try keyword matching
      if (!bestMatch) {
        const inputLower = normalizedInput.toLowerCase();
        
        for (const pattern of this.patterns) {
          for (const keyword of pattern.keywords) {
            if (inputLower.startsWith(keyword.toLowerCase())) {
              const subject = normalizedInput.slice(keyword.length).trim();
              if (subject) {
                bestMatch = {
                  type: pattern.type,
                  subject,
                  matchQuality: 0.6,
                };
                bestScore = 0.6;
                break;
              }
            }
          }
          if (bestMatch) break;
        }
      }
      
      // If still no match, return failure
      if (!bestMatch) {
        return {
          success: false,
          error: `Could not parse intent from: "${normalizedInput}". Try starting with an action verb like "implement", "fix", "test", etc.`,
          confidence: 0,
        };
      }
      
      // Assess complexity
      const complexity = assessComplexity(bestMatch.type, normalizedInput, this.patterns);
      
      // Extract requirements
      const requirements = extractRequirements(normalizedInput);
      
      // Calculate confidence
      const subjectClarity = bestMatch.subject.length > 0 ? 
        Math.min(1, bestMatch.subject.length / 20) : 0.5;
      const confidence = calculateConfidence(
        bestMatch.type,
        bestMatch.matchQuality,
        subjectClarity,
        normalizedInput
      );
      
      // Check minimum confidence
      if (this.config.strictMode && confidence < this.config.minConfidence) {
        return {
          success: false,
          error: `Parse confidence (${confidence.toFixed(2)}) below threshold (${this.config.minConfidence})`,
          confidence,
        };
      }
      
      // Build intent
      const intent: Intent = {
        type: bestMatch.type,
        subject: bestMatch.subject,
        requirements,
        complexity,
        context: {
          originalInput: input,
          normalizedInput,
          parserVersion: '1.0.0',
        },
      };
      
      return {
        success: true,
        intent,
        confidence,
      };
      
    } catch (error) {
      return {
        success: false,
        error: `Parse error: ${error instanceof Error ? error.message : String(error)}`,
        confidence: 0,
      };
    }
  }

  /**
   * Add a custom pattern for intent matching.
   * 
   * @param pattern - Custom intent pattern
   */
  addPattern(pattern: IntentPattern): void {
    this.patterns.push(pattern);
  }

  /**
   * Get all supported intent types.
   */
  getSupportedTypes(): IntentType[] {
    return [...INTENT_TYPES];
  }

  /**
   * Batch parse multiple inputs.
   * 
   * @param inputs - Array of natural language commands
   * @returns Array of ParseResults
   */
  parseBatch(inputs: string[]): ParseResult[] {
    return inputs.map(input => this.parse(input));
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Parse a natural language command into an Intent.
 * 
 * @param input - Natural language command
 * @param config - Optional parser configuration
 * @returns ParseResult
 */
export function parseIntent(input: string, config?: Partial<ParserConfig>): ParseResult {
  const parser = new IntentParser(config);
  return parser.parse(input);
}

/**
 * Create a parser with custom configuration.
 * 
 * @param config - Parser configuration
 * @returns Configured IntentParser instance
 */
export function createParser(config: Partial<ParserConfig>): IntentParser {
  return new IntentParser(config);
}

/**
 * Validate if an input can be parsed as an intent.
 * 
 * @param input - Natural language command
 * @returns True if valid intent
 */
export function isValidIntent(input: string): boolean {
  const result = parseIntent(input);
  return result.success;
}

/**
 * Get intent type from input without full parsing.
 * 
 * @param input - Natural language command
 * @returns IntentType or null if not determinable
 */
export function detectIntentType(input: string): IntentType | null {
  const result = parseIntent(input);
  return result.success && result.intent ? result.intent.type : null;
}
