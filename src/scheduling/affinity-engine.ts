/**
 * Affinity Engine
 * 
 * Evaluates affinity and anti-affinity rules for agent placement.
 * Supports hard and soft constraints, label selectors, and topology-based spreading.
 */

import {
  AffinityRule,
  LabelSelector,
  MatchExpression,
  NodeAllocation,
  AgentAffinity,
} from './types';
import { logger } from '../utils/logger';

// ============================================================================
// AFFINITY SCORE
// ============================================================================

export interface AffinityScore {
  /** Total score (0-100, higher = better) */
  totalScore: number;
  /** Individual rule scores */
  ruleScores: Array<{
    rule: AffinityRule;
    score: number;
    matched: boolean;
  }>;
  /** Whether all hard constraints are satisfied */
  hardConstraintsSatisfied: boolean;
}

// ============================================================================
// AFFINITY ENGINE CLASS
// ============================================================================

export interface AffinityEngineConfig {
  /** Default weight for soft constraints */
  defaultSoftWeight?: number;
  /** Maximum score for a single soft constraint */
  maxSoftScore?: number;
  /** Enable detailed logging */
  verbose?: boolean;
}

export class AffinityEngine {
  private config: Required<AffinityEngineConfig>;

  constructor(config: AffinityEngineConfig = {}) {
    this.config = {
      defaultSoftWeight: 10,
      maxSoftScore: 100,
      verbose: false,
      ...config,
    };
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Evaluate affinity rules for placing an agent on a node
   */
  evaluateAffinity(
    agentLabels: Record<string, string>,
    node: NodeAllocation,
    allNodes: NodeAllocation[],
    affinity?: AgentAffinity
  ): AffinityScore {
    if (!affinity) {
      return {
        totalScore: 50, // Neutral score
        ruleScores: [],
        hardConstraintsSatisfied: true,
      };
    }

    const ruleScores: AffinityScore['ruleScores'] = [];
    let hardConstraintsSatisfied = true;
    let totalScore = 50; // Start with neutral score

    // Evaluate agent affinity (co-location)
    if (affinity.agentAffinity) {
      for (const rule of affinity.agentAffinity) {
        const result = this.evaluateAgentAffinityRule(
          agentLabels,
          rule,
          node,
          allNodes
        );
        ruleScores.push(result);

        if (rule.weight === 'hard' && !result.matched) {
          hardConstraintsSatisfied = false;
        } else if (rule.weight === 'soft' && result.matched) {
          totalScore += result.score;
        }
      }
    }

    // Evaluate agent anti-affinity (separation)
    if (affinity.agentAntiAffinity) {
      for (const rule of affinity.agentAntiAffinity) {
        const result = this.evaluateAgentAntiAffinityRule(
          agentLabels,
          rule,
          node,
          allNodes
        );
        ruleScores.push(result);

        if (rule.weight === 'hard' && !result.matched) {
          hardConstraintsSatisfied = false;
        } else if (rule.weight === 'soft' && result.matched) {
          totalScore += result.score;
        }
      }
    }

    // Evaluate node affinity
    if (affinity.nodeAffinity) {
      for (const rule of affinity.nodeAffinity) {
        const result = this.evaluateNodeAffinityRule(agentLabels, rule, node);
        ruleScores.push(result);

        if (rule.weight === 'hard' && !result.matched) {
          hardConstraintsSatisfied = false;
        } else if (rule.weight === 'soft' && result.matched) {
          totalScore += result.score;
        }
      }
    }

    // Cap total score
    totalScore = Math.max(0, Math.min(100, totalScore));

    if (this.config.verbose) {
      logger.debug('[AffinityEngine] Evaluated affinity:', {
        nodeId: node.capacity.nodeId,
        totalScore,
        hardConstraintsSatisfied,
        ruleScores,
      });
    }

    return {
      totalScore,
      ruleScores,
      hardConstraintsSatisfied,
    };
  }

  /**
   * Check if a node satisfies all hard constraints
   */
  satisfiesHardConstraints(
    agentLabels: Record<string, string>,
    node: NodeAllocation,
    allNodes: NodeAllocation[],
    affinity?: AgentAffinity
  ): boolean {
    const score = this.evaluateAffinity(agentLabels, node, allNodes, affinity);
    return score.hardConstraintsSatisfied;
  }

  /**
   * Rank nodes by affinity score
   */
  rankNodes(
    agentLabels: Record<string, string>,
    nodes: NodeAllocation[],
    affinity?: AgentAffinity
  ): Array<{ node: NodeAllocation; score: AffinityScore }> {
    const scored = nodes.map((node) => ({
      node,
      score: this.evaluateAffinity(agentLabels, node, nodes, affinity),
    }));

    // Sort by total score descending, filtering out nodes that don't satisfy hard constraints
    return scored
      .filter((s) => s.score.hardConstraintsSatisfied)
      .sort((a, b) => b.score.totalScore - a.score.totalScore);
  }

  // ============================================================================
  // RULE EVALUATION
  // ============================================================================

  private evaluateAgentAffinityRule(
    agentLabels: Record<string, string>,
    rule: AffinityRule,
    node: NodeAllocation,
    allNodes: NodeAllocation[]
  ): { rule: AffinityRule; score: number; matched: boolean } {
    // Get agents on the target node
    const agentsOnNode = node["agents"];
    
    // For topology-based spreading, check other nodes in same topology
    let matchingAgents = agentsOnNode;
    
    if (rule.topologyKey) {
      // Find nodes in same topology domain
      const topologyNodes = this.getNodesInTopology(
        node,
        allNodes,
        rule.topologyKey
      );
      matchingAgents = topologyNodes.flatMap((n) => n.agents);
    }

    // Check if any agent on the node matches the selector
    let hasMatch = false;
    
    for (const agentId of matchingAgents) {
      // In a real implementation, we'd fetch agent labels from storage
      // For now, we simulate by checking if the agent exists
      if (rule.agentSelector) {
        // Mock: assume agent labels match if selector exists
        // In practice, fetch agent labels and call matchesLabelSelector
        hasMatch = this.matchesLabelSelector(agentLabels, rule.agentSelector);
        if (hasMatch) break;
      } else {
        hasMatch = true;
        break;
      }
    }

    if (rule.weight === 'hard') {
      return {
        rule,
        score: hasMatch ? 100 : 0,
        matched: hasMatch,
      };
    }

    // Soft constraint scoring
    const weightValue = rule.weightValue || this.config.defaultSoftWeight;
    return {
      rule,
      score: hasMatch ? weightValue : 0,
      matched: hasMatch,
    };
  }

  private evaluateAgentAntiAffinityRule(
    agentLabels: Record<string, string>,
    rule: AffinityRule,
    node: NodeAllocation,
    allNodes: NodeAllocation[]
  ): { rule: AffinityRule; score: number; matched: boolean } {
    // Get agents on the target node
    const agentsOnNode = node["agents"];
    
    // For topology-based spreading, check other nodes in same topology
    let matchingAgents = agentsOnNode;
    
    if (rule.topologyKey) {
      const topologyNodes = this.getNodesInTopology(
        node,
        allNodes,
        rule.topologyKey
      );
      matchingAgents = topologyNodes.flatMap((n) => n.agents);
    }

    // Check if any matching agent is on the node (which we want to avoid)
    let hasConflict = false;
    
    for (const agentId of matchingAgents) {
      if (rule.agentSelector) {
        // Mock: check if agent labels conflict
        hasConflict = this.matchesLabelSelector(agentLabels, rule.agentSelector);
        if (hasConflict) break;
      } else {
        hasConflict = true;
        break;
      }
    }

    // For anti-affinity, matched means no conflict
    const matched = !hasConflict;

    if (rule.weight === 'hard') {
      return {
        rule,
        score: matched ? 100 : 0,
        matched,
      };
    }

    // Soft constraint - reward avoiding conflicts
    const weightValue = rule.weightValue || this.config.defaultSoftWeight;
    return {
      rule,
      score: matched ? weightValue : 0,
      matched,
    };
  }

  private evaluateNodeAffinityRule(
    agentLabels: Record<string, string>,
    rule: AffinityRule,
    node: NodeAllocation
  ): { rule: AffinityRule; score: number; matched: boolean } {
    if (!rule.nodeSelector) {
      return { rule, score: 0, matched: true };
    }

    const matched = this.matchesLabelSelector(node.capacity.labels, rule.nodeSelector);

    if (rule.weight === 'hard') {
      return {
        rule,
        score: matched ? 100 : 0,
        matched,
      };
    }

    const weightValue = rule.weightValue || this.config.defaultSoftWeight;
    return {
      rule,
      score: matched ? weightValue : 0,
      matched,
    };
  }

  // ============================================================================
  // LABEL SELECTOR MATCHING
  // ============================================================================

  /**
   * Check if labels match a label selector
   */
  matchesLabelSelector(
    labels: Record<string, string>,
    selector: LabelSelector
  ): boolean {
    // Check matchLabels
    if (selector.matchLabels) {
      for (const [key, value] of Object.entries(selector.matchLabels)) {
        if (labels[key] !== value) {
          return false;
        }
      }
    }

    // Check matchExpressions
    if (selector.matchExpressions) {
      for (const expr of selector.matchExpressions) {
        if (!this.matchesExpression(labels, expr)) {
          return false;
        }
      }
    }

    return true;
  }

  private matchesExpression(
    labels: Record<string, string>,
    expr: MatchExpression
  ): boolean {
    const value = labels[expr.key];

    switch (expr.operator) {
      case 'In':
        return value !== undefined && expr.values?.includes(value) === true;
      
      case 'NotIn':
        return value === undefined || expr.values?.includes(value) === false;
      
      case 'Exists':
        return value !== undefined;
      
      case 'DoesNotExist':
        return value === undefined;
      
      default:
        return false;
    }
  }

  // ============================================================================
  // TOPOLOGY HELPERS
  // ============================================================================

  private getNodesInTopology(
    targetNode: NodeAllocation,
    allNodes: NodeAllocation[],
    topologyKey: string
  ): NodeAllocation[] {
    const targetValue = targetNode.capacity.labels[topologyKey];
    
    if (!targetValue) {
      return [targetNode];
    }

    return allNodes.filter((node) => {
      const nodeValue = node.capacity.labels[topologyKey];
      return nodeValue === targetValue;
    });
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Validate affinity configuration
   */
  validateAffinity(affinity: AgentAffinity): string[] {
    const errors: string[] = [];

    const validateRule = (rule: AffinityRule, index: number, type: string) => {
      if (rule.weight === 'soft' && rule.weightValue !== undefined) {
        if (rule.weightValue < 1 || rule.weightValue > 100) {
          errors.push(`${type}[${index}]: weightValue must be between 1 and 100`);
        }
      }

      if (rule.agentSelector && rule.nodeSelector) {
        errors.push(`${type}[${index}]: cannot have both agentSelector and nodeSelector`);
      }

      if (rule.topologyKey && !rule.agentSelector) {
        errors.push(`${type}[${index}]: topologyKey requires agentSelector`);
      }
    };

    affinity.agentAffinity?.forEach((rule, i) => validateRule(rule, i, 'agentAffinity'));
    affinity.agentAntiAffinity?.forEach((rule, i) => validateRule(rule, i, 'agentAntiAffinity'));
    affinity.nodeAffinity?.forEach((rule, i) => validateRule(rule, i, 'nodeAffinity'));

    return errors;
  }

  /**
   * Create a label selector from simple key-value pairs
   */
  static createLabelSelector(labels: Record<string, string>): LabelSelector {
    return {
      matchLabels: labels,
    };
  }

  /**
   * Create an affinity rule for co-location
   */
  static createCoLocationRule(
    labels: Record<string, string>,
    weight: 'hard' | 'soft' = 'soft',
    weightValue?: number
  ): AffinityRule {
    return {
      type: 'affinity',
      weight,
      weightValue,
      agentSelector: {
        matchLabels: labels,
      },
    };
  }

  /**
   * Create an anti-affinity rule for spreading
   */
  static createSpreadingRule(
    labels: Record<string, string>,
    topologyKey?: string,
    weight: 'hard' | 'soft' = 'soft',
    weightValue?: number
  ): AffinityRule {
    return {
      type: 'antiAffinity',
      weight,
      weightValue,
      agentSelector: {
        matchLabels: labels,
      },
      topologyKey,
    };
  }
}

export default AffinityEngine;
