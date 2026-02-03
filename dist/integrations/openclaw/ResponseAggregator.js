"use strict";
/**
 * ResponseAggregator.ts
 *
 * Aggregates and merges responses from multiple OpenClaw channels
 * Handles conflict resolution and latency optimization
 * per OpenClaw Integration Spec section 3.3
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConflictResolver = exports.ContentAnalyzer = exports.LatencyOptimizer = exports.ResponseAggregator = exports.DEFAULT_AGGREGATION_CONFIG = void 0;
exports.DEFAULT_AGGREGATION_CONFIG = {
    strategy: 'confidence_based',
    timeout: 5000,
    minResponses: 1,
    maxResponses: 10,
    requireConsensus: false,
    consensusThreshold: 0.8,
    channelWeights: new Map(),
    contentMergeStrategy: 'intelligent',
};
// ============================================================================
// CONTENT ANALYSIS
// ============================================================================
class ContentAnalyzer {
    /**
     * Calculate similarity between two text contents (0-1)
     */
    static calculateSimilarity(a, b) {
        if (a === b)
            return 1.0;
        if (!a || !b)
            return 0.0;
        // Normalize texts
        const normalize = (text) => text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const normA = normalize(a);
        const normB = normalize(b);
        // Jaccard similarity on word sets
        const wordsA = new Set(normA.split(' '));
        const wordsB = new Set(normB.split(' '));
        const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
        const union = new Set([...wordsA, ...wordsB]);
        return intersection.size / union.size;
    }
    /**
     * Extract key facts from content
     */
    static extractFacts(content) {
        const facts = [];
        // Split by sentences
        const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
        for (const sentence of sentences) {
            // Look for factual statements (containing numbers, dates, specific terms)
            if (this.isFactual(sentence)) {
                facts.push(sentence);
            }
        }
        return facts;
    }
    static isFactual(sentence) {
        // Contains numbers
        if (/\d/.test(sentence))
            return true;
        // Contains dates
        if (/\b\d{4}-\d{2}-\d{2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/i.test(sentence))
            return true;
        // Contains specific identifiers
        if (/\b(?:id|uuid|key|token|error|success|failed|completed)\b/i.test(sentence))
            return true;
        return false;
    }
    /**
     * Deduplicate similar content
     */
    static deduplicate(responses) {
        const unique = [];
        const threshold = 0.8;
        for (const response of responses) {
            let isDuplicate = false;
            for (const existing of unique) {
                const similarity = this.calculateSimilarity(response.content, existing.content);
                if (similarity >= threshold) {
                    isDuplicate = true;
                    // Keep the one with higher confidence (lower latency + higher channel success)
                    if (response.latency < existing.latency) {
                        const index = unique.indexOf(existing);
                        unique[index] = response;
                    }
                    break;
                }
            }
            if (!isDuplicate) {
                unique.push(response);
            }
        }
        return unique;
    }
    /**
     * Merge contents intelligently
     */
    static mergeIntelligent(responses) {
        if (responses.length === 0)
            return '';
        if (responses.length === 1)
            return responses[0].content;
        // Group by similarity
        const groups = [];
        const threshold = 0.7;
        for (const response of responses) {
            let added = false;
            for (const group of groups) {
                const similarity = this.calculateSimilarity(response.content, group[0].content);
                if (similarity >= threshold) {
                    group.push(response);
                    added = true;
                    break;
                }
            }
            if (!added) {
                groups.push([response]);
            }
        }
        // Pick the largest group (consensus)
        const consensusGroup = groups.reduce((a, b) => a.length > b.length ? a : b);
        // Merge responses from consensus group
        return this.concatenate(consensusGroup);
    }
    /**
     * Simple concatenation with separators
     */
    static concatenate(responses) {
        return responses
            .map(r => r.content)
            .join('\n\n---\n\n');
    }
}
exports.ContentAnalyzer = ContentAnalyzer;
// ============================================================================
// CONFLICT RESOLUTION
// ============================================================================
class ConflictResolver {
    /**
     * Detect conflicts between responses
     */
    static detectConflicts(responses) {
        const conflicts = [];
        if (responses.length < 2)
            return conflicts;
        // Check for content mismatches
        const contentGroups = this.groupBySimilarity(responses);
        if (contentGroups.length > 1) {
            conflicts.push({
                type: 'content_mismatch',
                channels: responses.map(r => r.channelId),
                description: `Responses split into ${contentGroups.length} different content groups`,
                severity: 'high',
                values: contentGroups.map(g => g.map(r => r.content.substring(0, 100))),
            });
        }
        // Check for timing discrepancies (responses too far apart)
        const timestamps = responses.map(r => r.timestamp.getTime());
        const maxGap = Math.max(...timestamps) - Math.min(...timestamps);
        if (maxGap > 5000) { // 5 seconds
            conflicts.push({
                type: 'timing_discrepancy',
                channels: responses.map(r => r.channelId),
                description: `Response time discrepancy of ${maxGap}ms`,
                severity: maxGap > 30000 ? 'high' : 'low',
                values: timestamps,
            });
        }
        return conflicts;
    }
    static groupBySimilarity(responses) {
        const groups = [];
        const threshold = 0.6;
        for (const response of responses) {
            let added = false;
            for (const group of groups) {
                const similarity = ContentAnalyzer.calculateSimilarity(response.content, group[0].content);
                if (similarity >= threshold) {
                    group.push(response);
                    added = true;
                    break;
                }
            }
            if (!added) {
                groups.push([response]);
            }
        }
        return groups;
    }
    /**
     * Resolve conflicts using specified strategy
     */
    static resolve(responses, strategy, channelConfigs) {
        if (responses.length <= 1) {
            return { selected: responses, discarded: [], reason: 'Only one response' };
        }
        switch (strategy) {
            case 'first_wins':
                return this.firstWins(responses);
            case 'last_wins':
                return this.lastWins(responses);
            case 'majority_vote':
                return this.majorityVote(responses);
            case 'weighted_average':
                return this.weightedAverage(responses, channelConfigs);
            case 'confidence_based':
                return this.confidenceBased(responses, channelConfigs);
            case 'channel_priority':
                return this.channelPriority(responses, channelConfigs);
            default:
                return this.confidenceBased(responses, channelConfigs);
        }
    }
    static firstWins(responses) {
        const sorted = [...responses].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        return {
            selected: [sorted[0]],
            discarded: sorted.slice(1),
            reason: 'First response selected',
        };
    }
    static lastWins(responses) {
        const sorted = [...responses].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        return {
            selected: [sorted[0]],
            discarded: sorted.slice(1),
            reason: 'Last response selected',
        };
    }
    static majorityVote(responses) {
        // Group by similarity
        const groups = [];
        for (const response of responses) {
            let added = false;
            for (const group of groups) {
                const similarity = ContentAnalyzer.calculateSimilarity(response.content, group[0].content);
                if (similarity >= 0.7) {
                    group.push(response);
                    added = true;
                    break;
                }
            }
            if (!added) {
                groups.push([response]);
            }
        }
        // Find the largest group
        const majority = groups.reduce((a, b) => a.length > b.length ? a : b);
        return {
            selected: majority,
            discarded: responses.filter(r => !majority.includes(r)),
            reason: `Majority vote: ${majority.length}/${responses.length} agree`,
        };
    }
    static weightedAverage(responses, channelConfigs) {
        // Score each response
        const scored = responses.map(r => {
            const config = channelConfigs?.get(r.channelId);
            const weight = config ? this.calculateChannelWeight(config) : 1.0;
            return { response: r, weight };
        });
        // Select highest weighted
        const best = scored.reduce((a, b) => a.weight > b.weight ? a : b);
        return {
            selected: [best.response],
            discarded: responses.filter(r => r !== best.response),
            reason: `Weighted selection: ${best.weight.toFixed(2)}`,
        };
    }
    static confidenceBased(responses, channelConfigs) {
        // Calculate confidence score for each response
        // Higher confidence = lower latency + higher channel success rate + more agreement
        const scored = responses.map(r => {
            const config = channelConfigs?.get(r.channelId);
            const channelScore = config ? config.successRate : 0.5;
            const latencyScore = Math.max(0, 1 - r.latency / 5000);
            // Check agreement with other responses
            let agreementCount = 0;
            for (const other of responses) {
                if (other === r)
                    continue;
                const similarity = ContentAnalyzer.calculateSimilarity(r.content, other.content);
                if (similarity > 0.7)
                    agreementCount++;
            }
            const agreementScore = responses.length > 1 ? agreementCount / (responses.length - 1) : 1;
            const confidence = (channelScore + latencyScore + agreementScore) / 3;
            return { response: r, confidence };
        });
        // Select highest confidence
        const best = scored.reduce((a, b) => a.confidence > b.confidence ? a : b);
        return {
            selected: [best.response],
            discarded: responses.filter(r => r !== best.response),
            reason: `Confidence-based: ${best.confidence.toFixed(2)}`,
        };
    }
    static channelPriority(responses, channelConfigs) {
        if (!channelConfigs) {
            return this.confidenceBased(responses);
        }
        // Score by channel priority
        const scored = responses.map(r => {
            const config = channelConfigs.get(r.channelId);
            const priority = config?.priority === 'primary' ? 3 :
                config?.priority === 'secondary' ? 2 : 1;
            return { response: r, priority };
        });
        // Select highest priority
        const best = scored.reduce((a, b) => a.priority > b.priority ? a : b);
        return {
            selected: [best.response],
            discarded: responses.filter(r => r !== best.response),
            reason: `Channel priority: ${best.priority}`,
        };
    }
    static calculateChannelWeight(config) {
        const priorityWeight = config.priority === 'primary' ? 3 :
            config.priority === 'secondary' ? 2 : 1;
        return config.successRate * priorityWeight * config.weight;
    }
}
exports.ConflictResolver = ConflictResolver;
// ============================================================================
// RESPONSE AGGREGATOR
// ============================================================================
class ResponseAggregator {
    constructor(config = {}, channelConfigs = new Map()) {
        this.pendingAggregations = new Map();
        this.config = { ...exports.DEFAULT_AGGREGATION_CONFIG, ...config };
        this.channelConfigs = channelConfigs;
    }
    /**
     * Start a new aggregation
     */
    startAggregation(requestId) {
        const aggregation = {
            id: this.generateId(),
            requestId,
            status: 'pending',
            responses: [],
            mergedContent: '',
            confidence: 0,
            startTime: new Date(),
            totalLatency: 0,
            channelsUsed: [],
            conflicts: [],
            resolution: this.config.strategy,
        };
        this.pendingAggregations.set(requestId, {
            aggregation,
            timeout: setTimeout(() => this.handleTimeout(requestId), this.config.timeout),
        });
        return aggregation;
    }
    /**
     * Add a response to an aggregation
     */
    addResponse(requestId, response) {
        const pending = this.pendingAggregations.get(requestId);
        if (!pending) {
            throw new Error(`No pending aggregation for request ${requestId}`);
        }
        const { aggregation } = pending;
        aggregation.responses.push(response);
        aggregation.channelsUsed.push(response.channelId);
        // Check if we have enough responses
        if (aggregation.responses.length >= this.config.minResponses) {
            return this.finalize(requestId);
        }
        return null; // Still waiting
    }
    /**
     * Finalize an aggregation
     */
    finalize(requestId) {
        const pending = this.pendingAggregations.get(requestId);
        if (!pending) {
            throw new Error(`No pending aggregation for request ${requestId}`);
        }
        clearTimeout(pending.timeout);
        this.pendingAggregations.delete(requestId);
        const { aggregation } = pending;
        aggregation.endTime = new Date();
        aggregation.totalLatency = aggregation.endTime.getTime() - aggregation.startTime.getTime();
        // Detect conflicts
        aggregation.conflicts = ConflictResolver.detectConflicts(aggregation.responses);
        // Resolve conflicts
        const resolution = ConflictResolver.resolve(aggregation.responses, this.config.strategy, this.channelConfigs);
        // Merge content
        aggregation.mergedContent = this.mergeContent(resolution.selected);
        // Calculate confidence
        aggregation.confidence = this.calculateConfidence(aggregation.responses, aggregation.conflicts, resolution);
        // Update status
        aggregation.status = aggregation.responses.length >= this.config.minResponses ? 'complete' : 'partial';
        return aggregation;
    }
    /**
     * Handle timeout
     */
    handleTimeout(requestId) {
        const pending = this.pendingAggregations.get(requestId);
        if (!pending)
            return;
        const { aggregation } = pending;
        if (aggregation.responses.length >= this.config.minResponses) {
            // We have minimum responses, finalize
            this.finalize(requestId);
        }
        else {
            // Timeout with insufficient responses
            aggregation.endTime = new Date();
            aggregation.totalLatency = aggregation.endTime.getTime() - aggregation.startTime.getTime();
            aggregation.status = 'timeout';
            aggregation.confidence = 0;
            this.pendingAggregations.delete(requestId);
        }
    }
    /**
     * Merge content based on strategy
     */
    mergeContent(responses) {
        if (responses.length === 0)
            return '';
        if (responses.length === 1)
            return responses[0].content;
        switch (this.config.contentMergeStrategy) {
            case 'concatenate':
                return ContentAnalyzer.concatenate(responses);
            case 'deduplicate':
                const unique = ContentAnalyzer.deduplicate(responses);
                return ContentAnalyzer.concatenate(unique);
            case 'intelligent':
            default:
                return ContentAnalyzer.mergeIntelligent(responses);
        }
    }
    /**
     * Calculate overall confidence score
     */
    calculateConfidence(responses, conflicts, resolution) {
        if (responses.length === 0)
            return 0;
        // Base confidence from response count
        let confidence = Math.min(responses.length / this.config.minResponses, 1.0);
        // Adjust for conflicts
        const conflictPenalty = conflicts.reduce((sum, c) => {
            return sum + (c.severity === 'high' ? 0.3 : c.severity === 'medium' ? 0.2 : 0.1);
        }, 0);
        confidence -= conflictPenalty;
        // Adjust for channel quality
        const channelScores = responses.map(r => {
            const config = this.channelConfigs.get(r.channelId);
            return config?.successRate || 0.5;
        });
        const avgChannelScore = channelScores.reduce((a, b) => a + b, 0) / channelScores.length;
        confidence = confidence * 0.5 + avgChannelScore * 0.5;
        // Bonus for consensus
        if (resolution.selected.length > responses.length / 2) {
            confidence += 0.1;
        }
        return Math.max(0, Math.min(1, confidence));
    }
    /**
     * Get pending aggregation
     */
    getPending(requestId) {
        return this.pendingAggregations.get(requestId)?.aggregation;
    }
    /**
     * Cancel a pending aggregation
     */
    cancel(requestId) {
        const pending = this.pendingAggregations.get(requestId);
        if (!pending)
            return false;
        clearTimeout(pending.timeout);
        this.pendingAggregations.delete(requestId);
        return true;
    }
    /**
     * Update channel configurations
     */
    updateChannelConfigs(configs) {
        this.channelConfigs = configs;
    }
    /**
     * Generate unique ID
     */
    generateId() {
        return `agg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    /**
     * Get all pending aggregations
     */
    getAllPending() {
        return Array.from(this.pendingAggregations.values()).map(p => p.aggregation);
    }
}
exports.ResponseAggregator = ResponseAggregator;
// ============================================================================
// LATENCY OPTIMIZATION
// ============================================================================
class LatencyOptimizer {
    /**
     * Calculate optimal timeout based on channel latencies
     */
    static calculateOptimalTimeout(channelConfigs, confidenceLevel = 0.95) {
        if (channelConfigs.length === 0)
            return 5000;
        // Get average latencies
        const latencies = channelConfigs
            .filter(c => c.averageLatency > 0)
            .map(c => c.averageLatency);
        if (latencies.length === 0)
            return 5000;
        // Calculate percentiles
        latencies.sort((a, b) => a - b);
        const p95Index = Math.floor(latencies.length * confidenceLevel);
        const p95 = latencies[Math.min(p95Index, latencies.length - 1)];
        // Add buffer for network variance
        return Math.min(p95 * 1.5 + 1000, 30000); // Cap at 30s
    }
    /**
     * Rank channels by expected latency
     */
    static rankByLatency(channelConfigs) {
        return [...channelConfigs].sort((a, b) => {
            // Combine average latency with success rate penalty
            const scoreA = a.averageLatency / a.successRate;
            const scoreB = b.averageLatency / b.successRate;
            return scoreA - scoreB;
        });
    }
    /**
     * Select fastest subset of channels for time-critical tasks
     */
    static selectFastest(channelConfigs, count, maxLatency) {
        const ranked = this.rankByLatency(channelConfigs);
        if (maxLatency) {
            return ranked
                .filter(c => c.averageLatency <= maxLatency)
                .slice(0, count);
        }
        return ranked.slice(0, count);
    }
}
exports.LatencyOptimizer = LatencyOptimizer;
//# sourceMappingURL=ResponseAggregator.js.map