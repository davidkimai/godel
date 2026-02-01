"use strict";
/**
 * Agent Model Tests
 */
Object.defineProperty(exports, "__esModule", { value: true });
const agent_1 = require("../../src/models/agent");
describe('Agent Model', () => {
    describe('AgentStatus Enum', () => {
        it('should have all expected statuses', () => {
            expect(agent_1.AgentStatus.PENDING).toBe('pending');
            expect(agent_1.AgentStatus.RUNNING).toBe('running');
            expect(agent_1.AgentStatus.PAUSED).toBe('paused');
            expect(agent_1.AgentStatus.COMPLETED).toBe('completed');
            expect(agent_1.AgentStatus.FAILED).toBe('failed');
            expect(agent_1.AgentStatus.BLOCKED).toBe('blocked');
            expect(agent_1.AgentStatus.KILLED).toBe('killed');
        });
    });
    describe('createAgent Factory', () => {
        it('should create an agent with default options', () => {
            const agent = (0, agent_1.createAgent)({
                model: 'kimi-k2.5',
                task: 'Test task'
            });
            expect(agent.id).toMatch(/^agent-\d+-[a-z0-9]+$/);
            expect(agent.status).toBe(agent_1.AgentStatus.PENDING);
            expect(agent.model).toBe('kimi-k2.5');
            expect(agent.task).toBe('Test task');
            expect(agent.spawnedAt).toBeInstanceOf(Date);
            expect(agent.runtime).toBe(0);
            expect(agent.childIds).toEqual([]);
            expect(agent.retryCount).toBe(0);
            expect(agent.maxRetries).toBe(3);
            expect(agent.metadata).toEqual({});
        });
        it('should create an agent with custom id', () => {
            const agent = (0, agent_1.createAgent)({
                id: 'custom-agent-id',
                model: 'claude-sonnet',
                task: 'Custom task'
            });
            expect(agent.id).toBe('custom-agent-id');
        });
        it('should create an agent with label', () => {
            const agent = (0, agent_1.createAgent)({
                model: 'gpt-4',
                task: 'Labeled task',
                label: 'My Agent'
            });
            expect(agent.label).toBe('My Agent');
        });
        it('should create an agent with swarm and parent', () => {
            const agent = (0, agent_1.createAgent)({
                model: 'test-model',
                task: 'Swarm task',
                swarmId: 'swarm-123',
                parentId: 'parent-456'
            });
            expect(agent.swarmId).toBe('swarm-123');
            expect(agent.parentId).toBe('parent-456');
        });
        it('should create an agent with custom maxRetries', () => {
            const agent = (0, agent_1.createAgent)({
                model: 'test-model',
                task: 'Retry task',
                maxRetries: 5
            });
            expect(agent.maxRetries).toBe(5);
        });
        it('should create an agent with budget limit', () => {
            const agent = (0, agent_1.createAgent)({
                model: 'test-model',
                task: 'Budget task',
                budgetLimit: 100
            });
            expect(agent.budgetLimit).toBe(100);
        });
        it('should create an agent with initial context items', () => {
            const agent = (0, agent_1.createAgent)({
                model: 'test-model',
                task: 'Context task',
                contextItems: ['file1.ts', 'file2.ts']
            });
            expect(agent.context.inputContext).toContain('file1.ts');
            expect(agent.context.inputContext).toContain('file2.ts');
            expect(agent.context.contextSize).toBe(2);
        });
        it('should create an agent with code data when language is provided', () => {
            const agent = (0, agent_1.createAgent)({
                model: 'test-model',
                task: 'Code task',
                language: 'typescript'
            });
            expect(agent.code).toBeDefined();
            expect(agent.code.language).toBe('typescript');
            expect(agent.code.fileTree).toBeDefined();
            expect(agent.code.dependencies).toBeDefined();
            expect(agent.code.symbolIndex).toBeDefined();
        });
        it('should not create code data when language is not provided', () => {
            const agent = (0, agent_1.createAgent)({
                model: 'test-model',
                task: 'No code task'
            });
            expect(agent.code).toBeUndefined();
        });
        it('should initialize reasoning with default values', () => {
            const agent = (0, agent_1.createAgent)({
                model: 'test-model',
                task: 'Reasoning task'
            });
            expect(agent.reasoning).toBeDefined();
            expect(agent.reasoning.traces).toEqual([]);
            expect(agent.reasoning.decisions).toEqual([]);
            expect(agent.reasoning.confidence).toBe(1.0);
        });
    });
    describe('Agent Context', () => {
        it('should have correct initial context values', () => {
            const agent = (0, agent_1.createAgent)({
                model: 'test-model',
                task: 'Test'
            });
            expect(agent.context.inputContext).toEqual([]);
            expect(agent.context.outputContext).toEqual([]);
            expect(agent.context.sharedContext).toEqual([]);
            expect(agent.context.contextWindow).toBe(100000);
            expect(agent.context.contextUsage).toBe(0);
        });
    });
});
//# sourceMappingURL=agent.test.js.map