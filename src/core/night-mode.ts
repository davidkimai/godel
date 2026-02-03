import { logger } from '../utils/logger';

const NIGHT_MODE_CONFIG = {
  startHour: 23,
  endHour: 7,
  maxAgents: 5,
  maxConcurrentSwarms: 2,
  maxTotalSpendPerNight: 25.00,
  maxSpendPerHour: 5.00,
  newSwarmsAllowed: false,
  criticalFixesAllowed: true,
};

export interface NightModeConfig {
  startHour: number;
  endHour: number;
  maxAgents: number;
  maxConcurrentSwarms: number;
  maxTotalSpendPerNight: number;
  maxSpendPerHour: number;
  newSwarmsAllowed: boolean;
  criticalFixesAllowed: boolean;
}

export interface NightModeStatus {
  enabled: boolean;
  config: NightModeConfig;
  isWithinNightHours: boolean;
  timeUntilNextTransition: string;
  nextTransitionType: 'start' | 'end';
  currentLimits: {
    maxAgents: number;
    maxSwarms: number;
    maxSpendNight: number;
  };
}

export interface MorningSummary {
  timestamp: Date;
  nightModeActive: boolean;
  totalSpend: number;
  agentChanges: number;
  swarmActivity: number;
  criticalFixesApplied: number;
  healthIncidents: number;
  recommendations: string[];
}

export class NightModeManager {
  private enabled: boolean = false;
  private lastHumanActivity: Date = new Date();
  private config: NightModeConfig = { ...NIGHT_MODE_CONFIG };

  constructor() {
    if (this.isWithinNightHours()) {
      this.enabled = true;
    }
  }

  isWithinNightHours(): boolean {
    const now = new Date();
    const currentHour = now.getHours();
    if (this.config.startHour > this.config.endHour) {
      return currentHour >= this.config.startHour || currentHour < this.config.endHour;
    }
    return currentHour >= this.config.startHour && currentHour < this.config.endHour;
  }

  async enableNightMode(): Promise<void> {
    if (this.enabled) return;
    this.enabled = true;
    process.env['DASH_NIGHT_MODE'] = 'true';
    logger.info('night-mode', 'Night mode ENABLED', { 
      startHour: this.config.startHour,
      endHour: this.config.endHour,
      maxAgents: this.config.maxAgents,
      maxSpend: this.config.maxTotalSpendPerNight 
    });
  }

  async disableNightMode(): Promise<void> {
    if (!this.enabled) return;
    this.enabled = false;
    process.env['DASH_NIGHT_MODE'] = 'false';
    logger.info('night-mode', 'Night mode DISABLED', {});
  }

  recordHumanActivity(): void {
    this.lastHumanActivity = new Date();
    if (this.enabled) {
      this.disableNightMode();
    }
  }

  isHumanAfk(): boolean {
    return (Date.now() - this.lastHumanActivity.getTime()) > 30 * 60 * 1000;
  }

  getStatus(): NightModeStatus {
    const now = new Date();
    const currentHour = now.getHours();
    
    let nextTransition: { type: 'start' | 'end'; time: Date };
    if (this.isWithinNightHours()) {
      const target = new Date(now);
      target.setHours(this.config.endHour, 0, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      nextTransition = { type: 'end', time: target };
    } else {
      const target = new Date(now);
      target.setHours(this.config.startHour, 0, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      nextTransition = { type: 'start', time: target };
    }

    const diffMs = nextTransition.time.getTime() - now.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    const currentLimits = this.enabled
      ? { maxAgents: this.config.maxAgents, maxSwarms: this.config.maxConcurrentSwarms, maxSpendNight: this.config.maxTotalSpendPerNight }
      : { maxAgents: 50, maxSwarms: 10, maxSpendNight: 100.00 };

    return {
      enabled: this.enabled,
      config: this.config,
      isWithinNightHours: this.isWithinNightHours(),
      timeUntilNextTransition: `${hours}h ${minutes}m`,
      nextTransitionType: nextTransition.type,
      currentLimits,
    };
  }

  async generateMorningSummary(options: Record<string, number>): Promise<MorningSummary> {
    await this.disableNightMode();

    const summary: MorningSummary = {
      timestamp: new Date(),
      nightModeActive: true,
      totalSpend: options['totalSpend'] || 0,
      agentChanges: options['agentChanges'] || 0,
      swarmActivity: options['swarmActivity'] || 0,
      criticalFixesApplied: options['criticalFixesApplied'] || 0,
      healthIncidents: options['healthIncidents'] || 0,
      recommendations: this.generateRecommendations(options),
    };

    logger.info('night-mode', 'Morning summary generated', { 
      totalSpend: summary.totalSpend,
      agentChanges: summary.agentChanges,
      criticalFixes: summary.criticalFixesApplied 
    });
    
    return summary;
  }

  private generateRecommendations(options: Record<string, number>): string[] {
    const recs: string[] = [];
    const fixes = options['criticalFixesApplied'] || 0;
    const incidents = options['healthIncidents'] || 0;
    const spend = options['totalSpend'] || 0;
    
    if (fixes > 0) recs.push(`${fixes} critical fixes applied`);
    if (incidents > 0) recs.push(`${incidents} health incidents - review logs`);
    if (spend > 20) recs.push(`High overnight spend: $${spend.toFixed(2)}`);
    if (recs.length === 0) recs.push('Quiet night - no issues detected');
    return recs;
  }
}

export const nightModeManager = new NightModeManager();

export function isNightModeActive(): boolean {
  return nightModeManager.getStatus().enabled;
}

export function getNightModeStatus(): string {
  const status = nightModeManager.getStatus();
  const emoji = status.enabled ? '🌙' : '☀️';
  return `${emoji} ${status.isWithinNightHours ? 'Night' : 'Day'} Mode | Next: ${status.timeUntilNextTransition}`;
}

export function recordHumanReturn(): void {
  nightModeManager.recordHumanActivity();
}

export function canSpawnInNightMode(isCritical: boolean): boolean {
  const status = nightModeManager.getStatus();
  if (!status.enabled) return true;
  if (isCritical && status.config.criticalFixesAllowed) return true;
  return false;
}
