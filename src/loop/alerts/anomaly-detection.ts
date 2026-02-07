/**
 * Anomaly Detection - Statistical and seasonal anomaly detection
 * 
 * Provides multiple algorithms for detecting anomalies in time series data:
 * - Statistical (Z-score based)
 * - Seasonal (for metrics with daily/weekly patterns)
 * - Exponential smoothing
 */

import type { TimeSeriesPoint, TimeSeriesStorage, TimeSeriesQuery } from './storage.js';
import type { EventBus } from '../event-bus.js';
import { createLogger } from '../../utils/logger.js';

/**
 * Module logger
 */
const log = createLogger('anomaly-detection');

/**
 * Anomaly detection result
 */
export interface AnomalyResult {
  /** Timestamp when anomaly was detected */
  timestamp: number;
  /** Actual value */
  value: number;
  /** Expected (predicted) value */
  expected: number;
  /** Deviation in standard deviations from expected */
  deviation: number;
  /** Anomaly severity */
  severity: 'low' | 'medium' | 'high';
  /** Detection algorithm used */
  algorithm: string;
}

/**
 * Anomaly detector interface
 */
export interface AnomalyDetector {
  /**
   * Detect anomalies in a time series
   * @param points - Time series data points
   * @returns Array of detected anomalies
   */
  detect(points: TimeSeriesPoint[]): AnomalyResult[];
}

/**
 * Statistical anomaly detection using Z-score
 * Detects values that deviate significantly from the mean
 */
export class StatisticalAnomalyDetector implements AnomalyDetector {
  constructor(
    private threshold: number = 3,  // Standard deviations
    private windowSize: number = 100 // Points to establish baseline
  ) {}

  detect(points: TimeSeriesPoint[]): AnomalyResult[] {
    if (points.length < this.windowSize) return [];

    // Calculate rolling statistics
    const baseline = points.slice(0, this.windowSize);
    const mean = baseline.reduce((sum, p) => sum + p.value, 0) / baseline.length;
    const variance = baseline.reduce((sum, p) => sum + Math.pow(p.value - mean, 2), 0) / baseline.length;
    const stdDev = Math.sqrt(variance);

    const anomalies: AnomalyResult[] = [];

    for (let i = this.windowSize; i < points.length; i++) {
      const point = points[i];
      const zScore = stdDev > 0 ? Math.abs((point.value - mean) / stdDev) : 0;

      if (zScore > this.threshold) {
        anomalies.push({
          timestamp: point.timestamp,
          value: point.value,
          expected: mean,
          deviation: zScore,
          severity: zScore > this.threshold * 2 ? 'high' : zScore > this.threshold * 1.5 ? 'medium' : 'low',
          algorithm: 'statistical'
        });
      }

      // Update rolling baseline
      baseline.shift();
      baseline.push(point);
    }

    return anomalies;
  }

  /**
   * Get current threshold
   */
  getThreshold(): number {
    return this.threshold;
  }

  /**
   * Update threshold
   */
  setThreshold(threshold: number): void {
    this.threshold = threshold;
  }
}

/**
 * Seasonality type for seasonal anomaly detection
 */
export type SeasonalityType = 'hourly' | 'daily' | 'weekly';

/**
 * Seasonal anomaly detection for metrics with recurring patterns
 * Groups data by time period and compares against historical averages
 */
export class SeasonalAnomalyDetector implements AnomalyDetector {
  constructor(
    private seasonality: SeasonalityType = 'daily',
    private threshold: number = 3
  ) {}

  detect(points: TimeSeriesPoint[]): AnomalyResult[] {
    if (points.length < 24) return [];

    // Group by season
    const seasonalGroups = new Map<number, number[]>();
    
    for (const point of points) {
      const season = this.getSeason(point.timestamp);
      if (!seasonalGroups.has(season)) {
        seasonalGroups.set(season, []);
      }
      seasonalGroups.get(season)!.push(point.value);
    }

    // Calculate seasonal statistics
    const seasonalStats = new Map<number, { mean: number; stdDev: number; count: number }>();
    for (const [season, values] of seasonalGroups) {
      if (values.length < 2) continue;
      
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      seasonalStats.set(season, { mean, stdDev: Math.sqrt(variance), count: values.length });
    }

    // Detect anomalies in recent points
    const anomalies: AnomalyResult[] = [];
    const recentPoints = points.slice(-24); // Check last 24 points
    
    for (const point of recentPoints) {
      const season = this.getSeason(point.timestamp);
      const stats = seasonalStats.get(season);
      
      if (stats && stats.stdDev > 0 && stats.count >= 3) {
        const zScore = Math.abs((point.value - stats.mean) / stats.stdDev);
        
        if (zScore > this.threshold) {
          anomalies.push({
            timestamp: point.timestamp,
            value: point.value,
            expected: stats.mean,
            deviation: zScore,
            severity: zScore > this.threshold * 2 ? 'high' : 'medium',
            algorithm: 'seasonal'
          });
        }
      }
    }

    return anomalies;
  }

  private getSeason(timestamp: number): number {
    const date = new Date(timestamp);
    
    switch (this.seasonality) {
      case 'hourly':
        return date.getMinutes();
      case 'daily':
        return date.getHours();
      case 'weekly':
        return date.getDay();
      default:
        return 0;
    }
  }

  /**
   * Get current seasonality setting
   */
  getSeasonality(): SeasonalityType {
    return this.seasonality;
  }

  /**
   * Update seasonality
   */
  setSeasonality(seasonality: SeasonalityType): void {
    this.seasonality = seasonality;
  }
}

/**
 * Exponential smoothing anomaly detector
 * Uses EWMA (Exponentially Weighted Moving Average) for prediction
 */
export class ExponentialSmoothingDetector implements AnomalyDetector {
  private alpha: number; // Smoothing factor
  private threshold: number;

  constructor(
    alpha: number = 0.3,
    threshold: number = 3
  ) {
    this.alpha = alpha;
    this.threshold = threshold;
  }

  detect(points: TimeSeriesPoint[]): AnomalyResult[] {
    if (points.length < 10) return [];

    const anomalies: AnomalyResult[] = [];
    
    // Initialize with mean of first few points
    let ewma = points.slice(0, 5).reduce((sum, p) => sum + p.value, 0) / 5;
    let variance = 0;
    
    for (let i = 5; i < points.length; i++) {
      const point = points[i];
      const error = point.value - ewma;
      
      // Update variance estimate
      variance = this.alpha * Math.pow(error, 2) + (1 - this.alpha) * variance;
      const stdDev = Math.sqrt(variance);
      
      // Check for anomaly
      if (stdDev > 0 && Math.abs(error) > this.threshold * stdDev) {
        anomalies.push({
          timestamp: point.timestamp,
          value: point.value,
          expected: ewma,
          deviation: Math.abs(error) / stdDev,
          severity: Math.abs(error) > this.threshold * 2 * stdDev ? 'high' : 'medium',
          algorithm: 'exponential-smoothing'
        });
      }
      
      // Update EWMA
      ewma = this.alpha * point.value + (1 - this.alpha) * ewma;
    }

    return anomalies;
  }
}

/**
 * MAD (Median Absolute Deviation) anomaly detector
 * Robust to outliers, good for non-normal distributions
 */
export class MADAnomalyDetector implements AnomalyDetector {
  constructor(private threshold: number = 3) {}

  detect(points: TimeSeriesPoint[]): AnomalyResult[] {
    if (points.length < 10) return [];

    const values = points.map(p => p.value);
    const median = this.calculateMedian(values);
    const absoluteDeviations = values.map(v => Math.abs(v - median));
    const mad = this.calculateMedian(absoluteDeviations);

    // For a normal distribution, MAD * 1.4826 ≈ standard deviation
    const modifiedZThreshold = this.threshold * 0.6745;

    const anomalies: AnomalyResult[] = [];

    for (const point of points) {
      const modifiedZScore = mad > 0 ? (0.6745 * (point.value - median)) / mad : 0;
      
      if (Math.abs(modifiedZScore) > modifiedZThreshold) {
        anomalies.push({
          timestamp: point.timestamp,
          value: point.value,
          expected: median,
          deviation: Math.abs(modifiedZScore) / 0.6745,
          severity: Math.abs(modifiedZScore) > modifiedZThreshold * 2 ? 'high' : 'medium',
          algorithm: 'mad'
        });
      }
    }

    return anomalies;
  }

  private calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }
}

/**
 * Composite anomaly detector that runs multiple algorithms
 */
export class CompositeAnomalyDetector implements AnomalyDetector {
  private detectors: AnomalyDetector[];

  constructor(detectors?: AnomalyDetector[]) {
    this.detectors = detectors || [
      new StatisticalAnomalyDetector(),
      new MADAnomalyDetector()
    ];
  }

  detect(points: TimeSeriesPoint[]): AnomalyResult[] {
    const allAnomalies: AnomalyResult[] = [];
    
    for (const detector of this.detectors) {
      try {
        const anomalies = detector.detect(points);
        allAnomalies.push(...anomalies);
      } catch (error) {
        log.logError('Detector failed', error);
      }
    }

    // Deduplicate by timestamp, keeping highest severity
    const deduplicated = new Map<number, AnomalyResult>();
    
    for (const anomaly of allAnomalies) {
      const existing = deduplicated.get(anomaly.timestamp);
      if (!existing || this.severityRank(anomaly.severity) > this.severityRank(existing.severity)) {
        deduplicated.set(anomaly.timestamp, anomaly);
      }
    }

    return Array.from(deduplicated.values());
  }

  private severityRank(severity: string): number {
    const ranks: Record<string, number> = { low: 1, medium: 2, high: 3 };
    return ranks[severity] || 0;
  }

  /**
   * Add a detector to the composite
   */
  addDetector(detector: AnomalyDetector): void {
    this.detectors.push(detector);
  }
}

/**
 * Anomaly detection service that monitors metrics
 */
export class AnomalyDetectionService {
  private detectors: Map<string, AnomalyDetector> = new Map();
  private detectionHistory: Map<string, AnomalyResult[]> = new Map();
  private maxHistory: number;

  constructor(
    private metricsStorage: TimeSeriesStorage,
    private eventBus: EventBus,
    options: { maxHistory?: number } = {}
  ) {
    this.maxHistory = options.maxHistory || 1000;
  }

  /**
   * Register a detector for a metric pattern
   * @param metricPattern - Metric name or pattern (supports wildcards)
   * @param detector - Anomaly detector implementation
   */
  addDetector(metricPattern: string, detector: AnomalyDetector): void {
    this.detectors.set(metricPattern, detector);
  }

  /**
   * Remove a detector
   */
  removeDetector(metricPattern: string): boolean {
    return this.detectors.delete(metricPattern);
  }

  /**
   * Run anomaly detection on all registered metrics
   */
  async runDetection(): Promise<AnomalyResult[]> {
    const allAnomalies: AnomalyResult[] = [];

    for (const [pattern, detector] of this.detectors) {
      try {
        // Get last 7 days of data
        const end = Date.now();
        const start = end - 7 * 24 * 60 * 60 * 1000;
        
        const points = await this.metricsStorage.query({
          metric: pattern,
          start,
          end
        });

        if (points.length < 10) continue;

        const anomalies = detector.detect(points);
        
        for (const anomaly of anomalies) {
          // Store in history
          const history = this.detectionHistory.get(pattern) || [];
          history.push(anomaly);
          
          // Trim history
          if (history.length > this.maxHistory) {
            history.shift();
          }
          
          this.detectionHistory.set(pattern, history);

          // Publish event
          this.eventBus.publish('anomaly:detected', {
            metric: pattern,
            timestamp: anomaly.timestamp,
            value: anomaly.value,
            expected: anomaly.expected,
            deviation: anomaly.deviation,
            severity: anomaly.severity,
            algorithm: anomaly.algorithm
          }, { priority: 'high', source: 'anomaly-detector' });
        }

        allAnomalies.push(...anomalies);
      } catch (error) {
        log.logError('Anomaly detection failed', error, { pattern });
      }
    }

    return allAnomalies;
  }

  /**
   * Get detection history for a metric pattern
   */
  getHistory(metricPattern: string): AnomalyResult[] {
    return [...(this.detectionHistory.get(metricPattern) || [])];
  }

  /**
   * Clear detection history
   */
  clearHistory(metricPattern?: string): void {
    if (metricPattern) {
      this.detectionHistory.delete(metricPattern);
    } else {
      this.detectionHistory.clear();
    }
  }
}
