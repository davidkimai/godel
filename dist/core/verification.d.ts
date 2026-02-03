export interface VerificationDetail {
    check: string;
    status: 'pass' | 'fail' | 'skip';
    message: string;
    duration: number;
}
export interface VerificationResult {
    success: boolean;
    swarmId: string;
    timestamp: Date;
    duration: number;
    buildVerified: boolean;
    buildDuration: number;
    buildErrors: number;
    testsVerified: boolean;
    testPassRate: number;
    testsPassed: number;
    testsFailed: number;
    integrationVerified: boolean;
    integrationErrors: string[];
    performanceVerified: boolean;
    performanceChange: number;
    rollbackRequired: boolean;
    rollbackReason?: string;
    rollbackPerformed: boolean;
    summary: string;
    details: VerificationDetail[];
}
export declare const DEFAULT_VERIFICATION_CONFIG: {
    testPassRateThreshold: number;
    buildTimeThreshold: number;
    maxNewErrors: number;
    autoRollback: boolean;
    checkpointBefore: boolean;
};
export declare class VerificationPipeline {
    private config;
    private baselineMetrics;
    setBaseline(metrics: Record<string, number>): void;
    verifySwarm(swarmId: string): Promise<VerificationResult>;
    private verifyBuild;
    private verifyTests;
    private verifyIntegration;
    private verifyPerformance;
}
export declare const verificationPipeline: VerificationPipeline;
export declare function quickVerify(): Promise<boolean>;
export declare function getVerificationStatus(): string;
//# sourceMappingURL=verification.d.ts.map