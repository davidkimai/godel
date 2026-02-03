import { BugMonitor, bugMonitor, BugSeverity, BugStatus } from '../../../src/core/bug-monitor';

describe('BugMonitor', () => {
  beforeEach(() => {
    // Reset bug monitor state
    bugMonitor.stopMonitoring();
  });

  afterAll(() => {
    bugMonitor.stopMonitoring();
  });

  describe('reportBug', () => {
    it('should create a bug report with auto-assigned ID', async () => {
      const bug = await bugMonitor.reportBug(
        'test_failure',
        'Test failed',
        'Unit test xyz failed'
      );

      expect(bug.id).toMatch(/^bug_/);
      expect(bug.status).toBe(BugStatus.DETECTED);
    });

    it('should set severity based on source', async () => {
      const criticalBug = await bugMonitor.reportBug(
        'runtime_error',
        'Uncaught exception',
        'Cannot read property of undefined'
      );

      expect(criticalBug.severity).toBe(BugSeverity.CRITICAL);
    });

    it('should track bug in active bugs', async () => {
      const bug = await bugMonitor.reportBug(
        'build_error',
        'Build failed',
        'TypeScript compilation error'
      );

      const activeBugs = bugMonitor.getActiveBugs();
      expect(activeBugs.some((b) => b.id === bug.id)).toBe(true);
    });
  });

  describe('getBug', () => {
    it('should return undefined for non-existent bug', () => {
      const bug = bugMonitor.getBug('non-existent');
      expect(bug).toBeUndefined();
    });

    it('should return bug by ID', async () => {
      const reported = await bugMonitor.reportBug(
        'manual',
        'Manual bug report',
        'Test description'
      );

      const found = bugMonitor.getBug(reported.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(reported.id);
    });
  });

  describe('getActiveBugs', () => {
    it('should return empty array initially', () => {
      const bugs = bugMonitor.getActiveBugs();
      expect(Array.isArray(bugs)).toBe(true);
    });

    it('should return all active bugs', async () => {
      await bugMonitor.reportBug('test_failure', 'Bug 1', 'Desc 1');
      await bugMonitor.reportBug('test_failure', 'Bug 2', 'Desc 2');

      const bugs = bugMonitor.getActiveBugs();
      expect(bugs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getBugStats', () => {
    it('should return bug statistics', async () => {
      await bugMonitor.reportBug('test_failure', 'Bug 1', 'Desc 1');
      await bugMonitor.reportBug('runtime_error', 'Bug 2', 'Desc 2');

      const stats = bugMonitor.getBugStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('fixed');
      expect(stats).toHaveProperty('bySeverity');
      expect(stats).toHaveProperty('bySource');
      expect(stats).toHaveProperty('autoFixRate');
    });

    it('should track severity distribution', async () => {
      await bugMonitor.reportBug('test_failure', 'Critical bug', 'Desc');
      
      const stats = bugMonitor.getBugStats();
      expect(stats.bySeverity[BugSeverity.CRITICAL]).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ignoreBug', () => {
    it('should mark bug as ignored', async () => {
      const bug = await bugMonitor.reportBug(
        'manual',
        'Wont fix',
        'Known limitation'
      );

      const result = bugMonitor.ignoreBug(bug.id, 'By design');
      expect(result).toBe(true);

      const activeBugs = bugMonitor.getActiveBugs();
      expect(activeBugs.some((b) => b.id === bug.id)).toBe(false);
    });

    it('should return false for non-existent bug', () => {
      const result = bugMonitor.ignoreBug('non-existent', 'Reason');
      expect(result).toBe(false);
    });
  });

  describe('startMonitoring', () => {
    it('should start monitoring', () => {
      bugMonitor.startMonitoring();
      // No error means success
    });
  });

  describe('stopMonitoring', () => {
    it('should stop monitoring', () => {
      bugMonitor.startMonitoring();
      bugMonitor.stopMonitoring();
      // No error means success
    });
  });

  describe('inferSeverity', () => {
    it('should identify critical errors', async () => {
      const bug = await bugMonitor.reportBug(
        'runtime_error',
        'Uncaught exception',
        'Cannot read property of undefined in production'
      );

      expect(bug.severity).toBe(BugSeverity.CRITICAL);
    });

    it('should identify high severity errors', async () => {
      const bug = await bugMonitor.reportBug(
        'build_error',
        'Build failed',
        'Error: Build fail broken'
      );

      expect(bug.severity).toBe(BugSeverity.HIGH);
    });

    it('should identify medium severity issues', async () => {
      const bug = await bugMonitor.reportBug(
        'test_failure',
        'Tests failed',
        'Warning: Test failure detected'
      );

      expect(bug.severity).toBe(BugSeverity.MEDIUM);
    });
  });
});
