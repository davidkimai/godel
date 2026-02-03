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
export declare class NightModeManager {
    private enabled;
    private lastHumanActivity;
    private config;
    constructor();
    isWithinNightHours(): boolean;
    enableNightMode(): Promise<void>;
    disableNightMode(): Promise<void>;
    recordHumanActivity(): void;
    isHumanAfk(): boolean;
    getStatus(): NightModeStatus;
    generateMorningSummary(options: Record<string, number>): Promise<MorningSummary>;
    private generateRecommendations;
}
export declare const nightModeManager: NightModeManager;
export declare function isNightModeActive(): boolean;
export declare function getNightModeStatus(): string;
export declare function recordHumanReturn(): void;
export declare function canSpawnInNightMode(isCritical: boolean): boolean;
//# sourceMappingURL=night-mode.d.ts.map