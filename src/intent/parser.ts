/**
 * @fileoverview Intent Parser - LLM-based and rule-based intent parsing
 * 
 * This module provides natural language parsing with LLM primary parsing
 * and rule-based fallback for robustness.
 * 
 * @module @godel/intent/parser
 */

import {
  ParsedIntent,
  TaskType,
  IntentAction,
  TargetType,
  PriorityLevel,
  LLMService,
  ParserConfig,
} from './types';
import { createLogger } from '../utils/logger';

/**
 * Module logger
 */
const log = createLogger('intent-parser');

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG: ParserConfig = {
  useLLM: true,
  strictMode: false,
};

// ============================================================================
// TASK TYPE KEYWORDS
// ============================================================================

const TASK_TYPE_KEYWORDS: Record<TaskType, string[]> = {
  refactor: ['refactor', 'rewrite', 'restructure', 'reorganize', 'cleanup', 'clean up', 'modernize'],
  implement: ['implement', 'create', 'add', 'build', 'develop', 'make', 'write', 'generate'],
  fix: ['fix', 'repair', 'resolve', 'debug', 'solve', 'correct', 'patch', 'bug', 'issue'],
  test: ['test', 'verify', 'validate', 'check', 'assert', 'spec', 'unittest'],
  optimize: ['optimize', 'improve performance', 'speed up', 'enhance', 'tune', 'boost'],
  review: ['review', 'audit', 'inspect', 'examine', 'assess', 'analyze code'],
  document: ['document', 'doc', 'write docs', 'documentate', 'explain'],
  analyze: ['analyze', 'investigate', 'research', 'study', 'explore', 'understand'],
};

// ============================================================================
// TARGET TYPE PATTERNS
// ============================================================================

const TARGET_TYPE_PATTERNS: Array<{ type: TargetType; patterns: RegExp[] }> = [
  {
    type: 'file',
    patterns: [
      /file\s+(?:\w+\.?\w*)/i,
      /\w+\.(ts|js|tsx|jsx|py|java|go|rs|cpp|c|h|hpp)$/i,
    ],
  },
  {
    type: 'module',
    patterns: [
      /module\s+(\w+)/i,
      /(?:the|a)\s+(\w+)\s+module/i,
    ],
  },
  {
    type: 'function',
    patterns: [
      /function\s+(\w+)/i,
      /(?:the|a)\s+(\w+)\s+(?:function|method)/i,
    ],
  },
  {
    type: 'feature',
    patterns: [
      /feature\s+(?:to\s+)?(.+?)(?:\s+(?:with|for|in)\s+|$)/i,
    ],
  },
  {
    type: 'bug',
    patterns: [
      /bug\s+(?:#?\d+)?/i,
      /issue\s+(?:#?\d+)?/i,
    ],
  },
  {
    type: 'test',
    patterns: [
      /test\s+(?:for\s+)?(.+?)(?:\s+(?:in|with)\s+|$)/i,
    ],
  },
  {
    type: 'directory',
    patterns: [
      /(?:directory|folder|path)\s+(\S+)/i,
      /(?:in|under)\s+(?:the\s+)?(\w+(?:\/\w+)*)/i,
    ],
  },
];

// ============================================================================
// PRIORITY KEYWORDS
// ============================================================================

const PRIORITY_KEYWORDS: Record<PriorityLevel, string[]> = {
  low: ['low priority', 'when possible', 'eventually', 'not urgent'],
  medium: ['medium priority', 'normal priority'],
  high: ['high priority', 'important', 'urgently'],
  urgent: ['urgent', 'critical', 'asap', 'emergency', 'blocker'],
};

// ============================================================================
// INTENT PARSER CLASS
// ============================================================================

export class IntentParser {
  private config: ParserConfig;
  private llm: LLMService | undefined;

  constructor(config: Partial<ParserConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.llm = config.llm;
  }

  /**
   * Parse natural language input into structured intent.
   * 
   * @param input - Natural language command
   * @returns Parsed intent
   */
  async parse(input: string): Promise<ParsedIntent> {
    const trimmed = input.trim();
    
    if (!trimmed) {
      throw new Error('Empty input provided');
    }

    // Try LLM parsing first if enabled and available
    if (this.config.useLLM && this.llm) {
      try {
        const parsed = await this.llmParse(trimmed);
        return this.validateAndNormalize(parsed, trimmed);
      } catch (error) {
        // Fall back to rule-based parsing
        if (this.config.strictMode) {
          throw error;
        }
        log.warn('LLM parsing failed, using rule-based fallback', { error: (error as Error).message });
      }
    }

    // Use rule-based parsing as fallback
    return this.ruleBasedParse(trimmed);
  }

  /**
   * Parse using LLM.
   */
  private async llmParse(input: string): Promise<Partial<ParsedIntent>> {
    if (!this.llm) {
      throw new Error('LLM service not available');
    }

    const prompt = this.buildParsePrompt(input);
    const response = await this.llm.complete(prompt);
    
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/) 
        || response.match(/\{[\s\S]*\}/);
      
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : response;
      return JSON.parse(jsonStr);
    } catch (e) {
      throw new Error(`Failed to parse LLM response as JSON: ${e}`);
    }
  }

  /**
   * Build the LLM prompt for parsing.
   */
  private buildParsePrompt(input: string): string {
    return `
Parse the following user intent into structured data:

User Input: "${input}"

Respond with JSON only:
{
  "taskType": "refactor|implement|fix|test|review|document|analyze",
  "target": "what to work on",
  "targetType": "file|module|function|feature|bug|test",
  "focus": "specific aspect (optional)",
  "constraints": ["list of constraints (optional)"],
  "priority": "low|medium|high|urgent (optional)"
}

Rules:
- "Refactor the auth module" → taskType: "refactor", target: "auth module", targetType: "module"
- "Fix bug #123 in login" → taskType: "fix", target: "bug #123 in login", targetType: "bug"
- "Write tests for utils" → taskType: "test", target: "utils", targetType: "module"
- "Review the PR" → taskType: "review", target: "PR", targetType: "feature"
- "Implement user authentication with JWT" → taskType: "implement", target: "user authentication", targetType: "feature", focus: "JWT"
- "Document the API endpoints" → taskType: "document", target: "API endpoints", targetType: "feature"

Output JSON only, no explanation.
`;
  }

  /**
   * Parse using rule-based heuristics.
   */
  private ruleBasedParse(input: string): ParsedIntent {
    const lower = input.toLowerCase();
    
    // Detect task type
    const taskType = this.detectTaskType(lower);
    
    // Detect target type
    const targetType = this.detectTargetType(input);
    
    // Extract target
    const target = this.extractTarget(input, taskType);
    
    // Extract focus
    const focus = this.extractFocus(input);
    
    // Extract constraints
    const constraints = this.extractConstraints(input);
    
    // Detect priority
    const priority = this.detectPriority(lower);
    
    return {
      action: taskType as IntentAction,
      taskType,
      target,
      targetType,
      focus,
      constraints: constraints.length > 0 ? { custom: constraints } : undefined,
      priority,
      raw: input,
    };
  }

  /**
   * Detect task type from input.
   */
  private detectTaskType(lower: string): TaskType {
    // Priority order for task type detection (more specific first)
    const typeOrder: TaskType[] = ['test', 'refactor', 'fix', 'review', 'document', 'analyze', 'implement'];
    
    for (const type of typeOrder) {
      for (const keyword of TASK_TYPE_KEYWORDS[type]) {
        if (lower.startsWith(keyword) || lower.includes(keyword)) {
          return type;
        }
      }
    }
    
    // Default to implement if no match
    return 'implement';
  }

  /**
   * Detect target type from input.
   */
  private detectTargetType(input: string): TargetType {
    for (const { type, patterns } of TARGET_TYPE_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(input)) {
          return type;
        }
      }
    }
    
    return 'module'; // Default
  }

  /**
   * Extract target from input.
   */
  private extractTarget(input: string, taskType: TaskType): string {
    const lower = input.toLowerCase();
    const keywords = TASK_TYPE_KEYWORDS[taskType];
    
    // Try to find the keyword and extract what comes after
    for (const keyword of keywords) {
      const idx = lower.indexOf(keyword);
      if (idx !== -1) {
        const after = input.slice(idx + keyword.length).trim();
        // Remove common filler words
        const cleaned = after
          .replace(/^(?:the|a|an)\s+/i, '')
          .replace(/^(?:in|on|for|with)\s+/i, '')
          .replace(/^(?:the|a|an)\s+/i, '')  // May need to remove articles again
          .trim();
        
        if (cleaned) {
          // Limit length and remove trailing punctuation
          return cleaned
            .replace(/[;:,]$/, '')
            .slice(0, 100);
        }
      }
    }
    
    // Fallback: return first 50 chars after first word
    const words = input.split(/\s+/);
    if (words.length > 1) {
      return words.slice(1).join(' ').slice(0, 100);
    }
    
    return input.slice(0, 100);
  }

  /**
   * Extract focus/aspect from input.
   */
  private extractFocus(input: string): string | undefined {
    const patterns = [
      // Match "with [adjective] focus" - capture everything after "with" up to stop words
      /with\s+((?:better|improved|enhanced|more|less)\s+.+?)(?:\s+(?:and|or|for)\s+|$)/i,
      // Also match simple "with X" pattern
      /with\s+(.+?)(?:\s+(?:and|or|for)\s+|$)/i,
      /focusing\s+on\s+(.+?)(?:\s+(?:and|or|for)\s+|$)/i,
      /to\s+(?:improve|enhance|optimize)\s+(.+?)(?:\s+(?:and|or|for)\s+|$)/i,
    ];
    
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return undefined;
  }

  /**
   * Extract constraints from input.
   */
  private extractConstraints(input: string): string[] {
    const constraints: string[] = [];
    const patterns = [
      /maintain\s+(?:backward\s+)?compatibility/i,
      /without\s+breaking\s+changes?/i,
      /keep\s+(?:it\s+)?simple/i,
      /use\s+([\w\s]+)(?:\s+only)?/i,
      /follow\s+([\w\s]+)\s+patterns?/i,
    ];
    
    for (const pattern of patterns) {
      const match = input.match(pattern);
      if (match) {
        constraints.push(match[0]);
      }
    }
    
    return constraints;
  }

  /**
   * Detect priority from input.
   */
  private detectPriority(lower: string): PriorityLevel | undefined {
    // Check in order of priority (urgent first)
    const priorityOrder: PriorityLevel[] = ['urgent', 'high', 'medium', 'low'];
    
    for (const level of priorityOrder) {
      for (const keyword of PRIORITY_KEYWORDS[level]) {
        if (lower.includes(keyword)) {
          return level;
        }
      }
    }
    
    return undefined;
  }

  /**
   * Validate and normalize parsed intent.
   */
  private validateAndNormalize(parsed: Partial<ParsedIntent>, raw: string): ParsedIntent {
    // Validate task type
    const validTaskTypes: TaskType[] = ['refactor', 'implement', 'fix', 'test', 'review', 'document', 'analyze'];
    const taskType = validTaskTypes.includes(parsed.taskType as TaskType) 
      ? parsed.taskType as TaskType 
      : 'implement';
    
    // Validate target type
    const validTargetTypes: TargetType[] = ['file', 'module', 'function', 'feature', 'bug', 'test', 'directory'];
    const targetType = validTargetTypes.includes(parsed.targetType as TargetType)
      ? parsed.targetType as TargetType
      : 'module';
    
    // Validate priority
    let priority: PriorityLevel | undefined;
    if (parsed.priority) {
      const validPriorities: PriorityLevel[] = ['low', 'medium', 'high', 'urgent'];
      priority = validPriorities.includes(parsed.priority) ? parsed.priority : undefined;
    }
    
    return {
      action: taskType as IntentAction,
      taskType,
      target: parsed.target || 'unknown',
      targetType,
      focus: parsed.focus,
      constraints: parsed.constraints,
      priority,
      deadline: parsed.deadline,
      raw,
    };
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Parse a natural language command into a ParsedIntent.
 */
export async function parseIntent(
  input: string, 
  config?: Partial<ParserConfig>
): Promise<ParsedIntent> {
  const parser = new IntentParser(config);
  return parser.parse(input);
}

/**
 * Create a parser with custom configuration.
 */
export function createParser(config: Partial<ParserConfig>): IntentParser {
  return new IntentParser(config);
}

/**
 * Quick parse without LLM (rule-based only).
 */
export function quickParse(input: string): ParsedIntent {
  const parser = new IntentParser({ useLLM: false, strictMode: false });
  const lower = input.toLowerCase();
  
  // Simple fallback parsing
  let taskType: TaskType = 'implement';
  for (const [type, keywords] of Object.entries(TASK_TYPE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) {
        taskType = type as TaskType;
        break;
      }
    }
  }
  
  return {
    action: taskType as IntentAction,
    taskType,
    target: input,
    targetType: 'module',
    raw: input,
  };
}
