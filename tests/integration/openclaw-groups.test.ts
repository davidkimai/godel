/**
 * Integration Test: OpenClaw Group Coordination
 * 
 * Tests group chat coordination features:
 * 1. Group creation and lifecycle
 * 2. Agent participation management (join/leave/roles)
 * 3. Thread-based conversation isolation
 * 4. @mention routing and coordination
 * 5. Task coordination with dedicated threads
 * 6. Multi-agent collaboration scenarios
 */

import {
  GroupCoordinator,
  AgentGroup,
  GroupRole,
  ThreadManager,
  Thread,
  ThreadMessage,
  resetGlobalGroupCoordinator,
  resetGlobalThreadManager,
} from '../../src/integrations/openclaw';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('INTEGRATION: OpenClaw Group Coordination', () => {
  let coordinator: GroupCoordinator;
  let threadManager: ThreadManager;

  beforeEach(() => {
    resetGlobalGroupCoordinator();
    resetGlobalThreadManager();
    threadManager = new ThreadManager();
    coordinator = new GroupCoordinator(threadManager);
  });

  afterEach(() => {
    coordinator.reset();
  });

  // ============================================================================
  // TEST SUITE 1: Group Creation and Lifecycle
  // ============================================================================
  describe('1. Group Creation and Lifecycle', () => {
    it('should create a group with default configuration', () => {
      const group = coordinator.createGroup({
        name: 'Test Group',
        topic: 'Testing group coordination',
      });

      expect(group).toBeDefined();
      expect(group.id).toMatch(/^group:\d+:\d+$/);
      expect(group.name).toBe('Test Group');
      expect(group.topic).toBe('Testing group coordination');
      expect(group.status).toBe('active');
      expect(group.agents.size).toBe(0);
      expect(group.threads.size).toBe(1); // Default thread created
      expect(group.config.maxAgents).toBe(50);
      expect(group.config.autoCreateThreads).toBe(true);
    });

    it('should create a group with initial agents', () => {
      const group = coordinator.createGroup({
        name: 'Team Alpha',
        agents: [
          { agentId: 'agent-1', role: 'leader' },
          { agentId: 'agent-2', role: 'contributor' },
          { agentId: 'agent-3', role: 'contributor' },
        ],
      });

      expect(group.agents.size).toBe(3);
      expect(group.agents.get('agent-1')?.role).toBe('leader');
      expect(group.agents.get('agent-2')?.role).toBe('contributor');
    });

    it('should create a default thread for general discussion', () => {
      const group = coordinator.createGroup({
        name: 'Test Group',
      });

      expect(group.defaultThreadId).toBeDefined();
      const defaultThread = threadManager.getThread(group.defaultThreadId!);
      expect(defaultThread).toBeDefined();
      expect(defaultThread?.name).toBe('General');
    });

    it('should archive a group and all its threads', () => {
      const group = coordinator.createGroup({
        name: 'Archive Test',
        agents: [{ agentId: 'agent-1' }],
      });

      const success = coordinator.archiveGroup(group.id);

      expect(success).toBe(true);
      expect(group.status).toBe('archived');

      const thread = threadManager.getThread(group.defaultThreadId!);
      expect(thread?.status).toBe('archived');
    });

    it('should pause and resume a group', () => {
      const group = coordinator.createGroup({
        name: 'Pause Test',
      });

      expect(coordinator.pauseGroup(group.id)).toBe(true);
      expect(group.status).toBe('paused');

      expect(coordinator.resumeGroup(group.id)).toBe(true);
      expect(group.status).toBe('active');
    });

    it('should retrieve a group by ID', () => {
      const group = coordinator.createGroup({
        name: 'Retrieval Test',
      });

      const retrieved = coordinator.getGroup(group.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(group.id);
    });

    it('should emit group.created event', (done) => {
      coordinator.on('group.created', (event: { type: string; groupId: string }) => {
        expect(event.type).toBe('group.created');
        expect(event.groupId).toBeDefined();
        done();
      });

      coordinator.createGroup({
        name: 'Event Test',
      });
    });
  });

  // ============================================================================
  // TEST SUITE 2: Agent Participation Management
  // ============================================================================
  describe('2. Agent Participation Management', () => {
    it('should add agent to group with role', () => {
      const group = coordinator.createGroup({
        name: 'Role Test',
      });

      const success = coordinator.addAgentToGroup(group.id, 'agent-1', 'leader');

      expect(success).toBe(true);
      expect(group.agents.get('agent-1')?.role).toBe('leader');
    });

    it('should support all group roles', () => {
      const group = coordinator.createGroup({
        name: 'Roles Test',
      });

      const roles: GroupRole[] = ['leader', 'coordinator', 'contributor', 'observer'];

      for (let i = 0; i < roles.length; i++) {
        coordinator.addAgentToGroup(group.id, `agent-${i}`, roles[i]);
      }

      expect(group.agents.size).toBe(4);
      for (let i = 0; i < roles.length; i++) {
        expect(group.agents.get(`agent-${i}`)?.role).toBe(roles[i]);
      }
    });

    it('should add agent to default thread when joining group', () => {
      const group = coordinator.createGroup({
        name: 'Auto-join Test',
      });

      coordinator.addAgentToGroup(group.id, 'agent-1');

      const defaultThread = threadManager.getThread(group.defaultThreadId!);
      expect(defaultThread?.participants.has('agent-1')).toBe(true);
    });

    it('should remove agent from all threads when leaving group', () => {
      const group = coordinator.createGroup({
        name: 'Leave Test',
        agents: [{ agentId: 'agent-1' }],
      });

      // Create additional thread and add agent
      const thread = coordinator.createGroupThread(group.id, 'Extra Thread', {
        agentIds: ['agent-1'],
      });

      expect(coordinator.removeAgentFromGroup(group.id, 'agent-1')).toBe(true);

      // Should be removed from all threads
      expect(threadManager.isParticipant(group.defaultThreadId!, 'agent-1')).toBe(false);
      expect(threadManager.isParticipant(thread!.id, 'agent-1')).toBe(false);
    });

    it('should update agent role', () => {
      const group = coordinator.createGroup({
        name: 'Role Update Test',
        agents: [{ agentId: 'agent-1', role: 'contributor' }],
      });

      coordinator.updateAgentRole(group.id, 'agent-1', 'coordinator');

      expect(group.agents.get('agent-1')?.role).toBe('coordinator');
    });

    it('should set agent status', () => {
      const group = coordinator.createGroup({
        name: 'Status Test',
        agents: [{ agentId: 'agent-1' }],
      });

      coordinator.setAgentStatus(group.id, 'agent-1', 'away');

      expect(group.agents.get('agent-1')?.status).toBe('away');
    });

    it('should enforce maxAgents limit', () => {
      const group = coordinator.createGroup({
        name: 'Capacity Test',
        config: { maxAgents: 2 },
      });

      coordinator.addAgentToGroup(group.id, 'agent-1');
      coordinator.addAgentToGroup(group.id, 'agent-2');
      const third = coordinator.addAgentToGroup(group.id, 'agent-3');

      expect(third).toBe(false);
      expect(group.agents.size).toBe(2);
    });

    it('should get all groups an agent belongs to', () => {
      const group1 = coordinator.createGroup({
        name: 'Group 1',
        agents: [{ agentId: 'agent-1' }],
      });

      const group2 = coordinator.createGroup({
        name: 'Group 2',
        agents: [{ agentId: 'agent-1' }],
      });

      const agentGroups = coordinator.getAgentGroups('agent-1');

      expect(agentGroups).toHaveLength(2);
      expect(agentGroups.map((g: AgentGroup) => g.id)).toContain(group1.id);
      expect(agentGroups.map((g: AgentGroup) => g.id)).toContain(group2.id);
    });

    it('should check if agent is in group', () => {
      const group = coordinator.createGroup({
        name: 'Membership Test',
        agents: [{ agentId: 'agent-1' }],
      });

      expect(coordinator.isAgentInGroup(group.id, 'agent-1')).toBe(true);
      expect(coordinator.isAgentInGroup(group.id, 'agent-2')).toBe(false);
    });

    it('should emit agent.joined event', (done) => {
      const group = coordinator.createGroup({
        name: 'Join Event Test',
      });

      coordinator.on('agent.joined', (event: { type: string; groupId: string; agentId: string; role: string }) => {
        expect(event.type).toBe('agent.joined');
        expect(event.groupId).toBe(group.id);
        expect(event.agentId).toBe('agent-1');
        expect(event.role).toBe('coordinator');
        done();
      });

      coordinator.addAgentToGroup(group.id, 'agent-1', 'coordinator');
    });
  });

  // ============================================================================
  // TEST SUITE 3: Thread-Based Conversation Isolation
  // ============================================================================
  describe('3. Thread-Based Conversation Isolation', () => {
    it('should create thread in a group', () => {
      const group = coordinator.createGroup({
        name: 'Thread Test',
        agents: [{ agentId: 'agent-1' }],
      });

      const thread = coordinator.createGroupThread(group.id, 'Sub-task Thread', {
        topic: 'Discussion about specific sub-task',
        agentIds: ['agent-1'],
      });

      expect(thread).toBeDefined();
      expect(group.threads.has(thread!.id)).toBe(true);
      expect(thread?.groupId).toBe(group.id);
    });

    it('should isolate messages between threads', () => {
      const group = coordinator.createGroup({
        name: 'Isolation Test',
        agents: [
          { agentId: 'agent-1' },
          { agentId: 'agent-2' },
        ],
      });

      const thread1 = coordinator.createGroupThread(group.id, 'Thread 1', {
        agentIds: ['agent-1'],
      });

      const thread2 = coordinator.createGroupThread(group.id, 'Thread 2', {
        agentIds: ['agent-2'],
      });

      // Send message to thread 1
      threadManager.sendMessage(thread1!.id, 'agent-1', 'Message in thread 1');

      // Send message to thread 2
      threadManager.sendMessage(thread2!.id, 'agent-2', 'Message in thread 2');

      const history1 = threadManager.getHistory({ threadId: thread1!.id });
      const history2 = threadManager.getHistory({ threadId: thread2!.id });

      // Verify isolation
      expect(history1.map((m: ThreadMessage) => m.content)).toContain('Message in thread 1');
      expect(history1.map((m: ThreadMessage) => m.content)).not.toContain('Message in thread 2');

      expect(history2.map((m: ThreadMessage) => m.content)).toContain('Message in thread 2');
      expect(history2.map((m: ThreadMessage) => m.content)).not.toContain('Message in thread 1');
    });

    it('should assign agents to specific threads', () => {
      const group = coordinator.createGroup({
        name: 'Assignment Test',
        agents: [
          { agentId: 'agent-1' },
          { agentId: 'agent-2' },
        ],
      });

      const thread = coordinator.createGroupThread(group.id, 'Specialized Thread');

      // Assign specific agent
      coordinator.assignAgentToThread(group.id, 'agent-1', thread!.id);

      expect(threadManager.isParticipant(thread!.id, 'agent-1')).toBe(true);
      expect(threadManager.isParticipant(thread!.id, 'agent-2')).toBe(false);
    });

    it('should remove agents from threads', () => {
      const group = coordinator.createGroup({
        name: 'Removal Test',
        agents: [{ agentId: 'agent-1' }],
      });

      const thread = coordinator.createGroupThread(group.id, 'Temporary Thread', {
        agentIds: ['agent-1'],
      });

      coordinator.removeAgentFromThread(group.id, 'agent-1', thread!.id);

      expect(threadManager.isParticipant(thread!.id, 'agent-1')).toBe(false);
    });

    it('should get threads assigned to an agent', () => {
      const group = coordinator.createGroup({
        name: 'Agent Threads Test',
        agents: [{ agentId: 'agent-1' }],
      });

      coordinator.createGroupThread(group.id, 'Thread 1', { agentIds: ['agent-1'] });
      coordinator.createGroupThread(group.id, 'Thread 2', { agentIds: ['agent-1'] });

      const agentThreads = coordinator.getAgentThreads(group.id, 'agent-1');

      // Should include default thread + 2 created threads
      expect(agentThreads.length).toBe(3);
    });

    it('should create nested threads', () => {
      const group = coordinator.createGroup({
        name: 'Nested Thread Test',
      });

      const parentThread = coordinator.createGroupThread(group.id, 'Parent');
      const childThread = coordinator.createGroupThread(group.id, 'Child', {
        parentThreadId: parentThread!.id,
      });

      const parent = threadManager.getThread(parentThread!.id);
      expect(parent?.childThreadIds.has(childThread!.id)).toBe(true);

      const child = threadManager.getThread(childThread!.id);
      expect(child?.parentThreadId).toBe(parentThread!.id);
    });

    it('should preserve history when archiving thread', () => {
      const group = coordinator.createGroup({
        name: 'History Test',
        agents: [{ agentId: 'agent-1' }],
      });

      const thread = coordinator.createGroupThread(group.id, 'History Thread', {
        agentIds: ['agent-1'],
      });

      // Add some messages
      threadManager.sendMessage(thread!.id, 'agent-1', 'Message 1');
      threadManager.sendMessage(thread!.id, 'agent-1', 'Message 2');

      // Archive the thread
      threadManager.archiveThread(thread!.id);

      // History should still be accessible
      const history = threadManager.getHistory({ threadId: thread!.id });
      expect(history.length).toBeGreaterThanOrEqual(2);
    });

    it('should emit agent.assigned event', (done) => {
      const group = coordinator.createGroup({
        name: 'Assign Event Test',
        agents: [{ agentId: 'agent-1' }],
      });

      const thread = coordinator.createGroupThread(group.id, 'Test Thread');

      coordinator.on('agent.assigned', (event: { type: string; agentId: string; threadId: string }) => {
        expect(event.type).toBe('agent.assigned');
        expect(event.agentId).toBe('agent-1');
        expect(event.threadId).toBe(thread!.id);
        done();
      });

      coordinator.assignAgentToThread(group.id, 'agent-1', thread!.id);
    });
  });

  // ============================================================================
  // TEST SUITE 4: @Mention Routing and Coordination
  // ============================================================================
  describe('4. @Mention Routing and Coordination', () => {
    it('should parse @mentions from message content', () => {
      const content = 'Hey @agent-1 and @agent-2, please check this out';
      const mentions = threadManager.parseMentions(content);

      expect(mentions).toContain('agent-1');
      expect(mentions).toContain('agent-2');
      expect(mentions).toHaveLength(2);
    });

    it('should parse quoted mentions with spaces', () => {
      const content = '@"Agent One" please help @agent-2';
      const mentions = threadManager.parseMentions(content);

      expect(mentions).toContain('Agent One');
      expect(mentions).toContain('agent-2');
    });

    it('should route mentions to target agents', () => {
      const group = coordinator.createGroup({
        name: 'Mention Test',
        agents: [
          { agentId: 'agent-1' },
          { agentId: 'agent-2' },
        ],
      });

      const results = coordinator.routeMentions(
        group.id,
        group.defaultThreadId!,
        'agent-1',
        'Hey @agent-2, can you help?'
      );

      expect(results).toHaveLength(1);
      expect(results[0].mention).toBe('agent-2');
      expect(results[0].targetAgentId).toBe('agent-2');
      expect(results[0].routed).toBe(true);
    });

    it('should handle mentions for non-existent agents', () => {
      const group = coordinator.createGroup({
        name: 'Bad Mention Test',
        agents: [{ agentId: 'agent-1' }],
      });

      const results = coordinator.routeMentions(
        group.id,
        group.defaultThreadId!,
        'agent-1',
        'Hey @nonexistent, are you there?'
      );

      expect(results[0].routed).toBe(false);
      expect(results[0].error).toContain('not found');
    });

    it('should send message with automatic mention routing', () => {
      const group = coordinator.createGroup({
        name: 'Auto-route Test',
        agents: [
          { agentId: 'agent-1' },
          { agentId: 'agent-2' },
        ],
      });

      const { message, routingResults } = coordinator.sendMessageWithRouting(
        group.id,
        group.defaultThreadId!,
        'agent-1',
        '@agent-2 please review this'
      );

      expect(message).toBeDefined();
      expect(routingResults).toHaveLength(1);
      expect(routingResults[0].targetAgentId).toBe('agent-2');
    });

    it('should add mentioned agent to thread if not present', () => {
      const group = coordinator.createGroup({
        name: 'Auto-add Test',
        agents: [
          { agentId: 'agent-1' },
          { agentId: 'agent-2' },
        ],
      });

      // Create thread with only agent-1
      const thread = coordinator.createGroupThread(group.id, 'Private', {
        agentIds: ['agent-1'],
      });

      expect(threadManager.isParticipant(thread!.id, 'agent-2')).toBe(false);

      // Mention agent-2 in the thread
      coordinator.routeMentions(group.id, thread!.id, 'agent-1', '@agent-2 check this');

      // agent-2 should now be in the thread
      expect(threadManager.isParticipant(thread!.id, 'agent-2')).toBe(true);
    });

    it('should emit mention.routed event', (done) => {
      const group = coordinator.createGroup({
        name: 'Mention Event Test',
        agents: [
          { agentId: 'agent-1' },
          { agentId: 'agent-2' },
        ],
      });

      coordinator.on('mention.routed', (event: { type: string; fromAgentId: string; toAgentId: string }) => {
        expect(event.type).toBe('mention.routed');
        expect(event.fromAgentId).toBe('agent-1');
        expect(event.toAgentId).toBe('agent-2');
        done();
      });

      coordinator.routeMentions(
        group.id,
        group.defaultThreadId!,
        'agent-1',
        '@agent-2 hello'
      );
    });

    it('should support case-insensitive mention matching', () => {
      const group = coordinator.createGroup({
        name: 'Case Test',
        agents: [
          { agentId: 'Agent-One' },
          { agentId: 'agent-2' },
        ],
      });

      const results = coordinator.routeMentions(
        group.id,
        group.defaultThreadId!,
        'agent-2',
        '@agent-one and @AGENT-2'
      );

      expect(results[0].targetAgentId).toBe('Agent-One');
      expect(results[1].targetAgentId).toBe('agent-2');
    });
  });

  // ============================================================================
  // TEST SUITE 5: Task Coordination
  // ============================================================================
  describe('5. Task Coordination with Dedicated Threads', () => {
    it('should create a task with dedicated thread', () => {
      const group = coordinator.createGroup({
        name: 'Task Test',
        agents: [{ agentId: 'agent-1' }],
      });

      const task = coordinator.createTask(group.id, 'Implement feature X', {
        assignTo: ['agent-1'],
      });

      expect(task).toBeDefined();
      expect(task?.description).toBe('Implement feature X');
      expect(task?.assignedAgents).toContain('agent-1');
      expect(task?.status).toBe('pending');
      expect(task?.threadId).toBeDefined();

      // Thread should exist and have the agent
      const thread = threadManager.getThread(task!.threadId);
      expect(thread).toBeDefined();
      expect(thread?.participants.has('agent-1')).toBe(true);
    });

    it('should update task status', () => {
      const group = coordinator.createGroup({
        name: 'Status Update Test',
        agents: [{ agentId: 'agent-1' }],
      });

      const task = coordinator.createTask(group.id, 'Test task', {
        assignTo: ['agent-1'],
      });

      coordinator.updateTaskStatus(task!.id, 'in_progress');
      expect(coordinator.getTask(task!.id)?.status).toBe('in_progress');

      coordinator.updateTaskStatus(task!.id, 'completed');
      expect(coordinator.getTask(task!.id)?.status).toBe('completed');
      expect(coordinator.getTask(task!.id)?.completedAt).toBeDefined();
    });

    it('should get all tasks for a group', () => {
      const group = coordinator.createGroup({
        name: 'Task List Test',
        agents: [{ agentId: 'agent-1' }],
      });

      coordinator.createTask(group.id, 'Task 1', { assignTo: ['agent-1'] });
      coordinator.createTask(group.id, 'Task 2', { assignTo: ['agent-1'] });
      coordinator.createTask(group.id, 'Task 3', { assignTo: ['agent-1'] });

      const tasks = coordinator.getGroupTasks(group.id);
      expect(tasks).toHaveLength(3);
    });

    it('should get tasks assigned to specific agent', () => {
      const group = coordinator.createGroup({
        name: 'Agent Task Test',
        agents: [
          { agentId: 'agent-1' },
          { agentId: 'agent-2' },
        ],
      });

      coordinator.createTask(group.id, 'Task for 1', { assignTo: ['agent-1'] });
      coordinator.createTask(group.id, 'Task for 2', { assignTo: ['agent-2'] });
      coordinator.createTask(group.id, 'Task for both', { assignTo: ['agent-1', 'agent-2'] });

      const agent1Tasks = coordinator.getAgentTasks('agent-1');
      expect(agent1Tasks).toHaveLength(2);

      const agent2Tasks = coordinator.getAgentTasks('agent-2');
      expect(agent2Tasks).toHaveLength(2);
    });

    it('should emit task events', (done) => {
      const group = coordinator.createGroup({
        name: 'Task Event Test',
        agents: [{ agentId: 'agent-1' }],
      });

      let eventCount = 0;

      coordinator.on('task.created', () => {
        eventCount++;
      });

      coordinator.on('task.assigned', (event: { type: string; agentId: string }) => {
        expect(event.agentId).toBe('agent-1');
        eventCount++;
        if (eventCount >= 2) done();
      });

      coordinator.createTask(group.id, 'Event task', { assignTo: ['agent-1'] });
    });
  });

  // ============================================================================
  // TEST SUITE 6: Multi-Agent Collaboration Scenarios
  // ============================================================================
  describe('6. Multi-Agent Collaboration Scenarios', () => {
    it('should support 5+ agents in a single group', () => {
      const group = coordinator.createGroup({
        name: 'Large Group Test',
        agents: [
          { agentId: 'agent-1', role: 'leader' },
          { agentId: 'agent-2', role: 'coordinator' },
          { agentId: 'agent-3', role: 'contributor' },
          { agentId: 'agent-4', role: 'contributor' },
          { agentId: 'agent-5', role: 'contributor' },
          { agentId: 'agent-6', role: 'observer' },
        ],
      });

      expect(group.agents.size).toBe(6);

      // All agents should be in default thread
      const defaultThread = threadManager.getThread(group.defaultThreadId!);
      for (let i = 1; i <= 6; i++) {
        expect(defaultThread?.participants.has(`agent-${i}`)).toBe(true);
      }
    });

    it('should handle cross-thread communication via mentions', () => {
      const group = coordinator.createGroup({
        name: 'Cross-thread Test',
        agents: [
          { agentId: 'agent-1' },
          { agentId: 'agent-2' },
        ],
      });

      const thread1 = coordinator.createGroupThread(group.id, 'Thread 1', {
        agentIds: ['agent-1'],
      });

      const thread2 = coordinator.createGroupThread(group.id, 'Thread 2', {
        agentIds: ['agent-2'],
      });

      // agent-1 mentions agent-2 in thread 1
      coordinator.sendMessageWithRouting(
        group.id,
        thread1!.id,
        'agent-1',
        '@agent-2 can you check thread 2?'
      );

      // agent-2 should be notified
      const thread2History = threadManager.getHistory({ threadId: thread2!.id });
      const notification = thread2History.find((m: ThreadMessage) =>
        m.content.includes('mentioned') || m.content.includes('agent-2')
      );

      // If agent is in mentionsOnly mode, they get notified in their assigned threads
      // Otherwise they're auto-added to the thread where mentioned
      expect(threadManager.isParticipant(thread1!.id, 'agent-2') || notification).toBeTruthy();
    });

    it('should support broadcast to all threads', () => {
      const group = coordinator.createGroup({
        name: 'Broadcast Test',
        agents: [{ agentId: 'agent-1' }],
      });

      // Create threads with agent-1 as participant
      coordinator.createGroupThread(group.id, 'Thread 1', { agentIds: ['agent-1'] });
      coordinator.createGroupThread(group.id, 'Thread 2', { agentIds: ['agent-1'] });

      const results = coordinator.broadcastToGroup(
        group.id,
        'agent-1',
        'Important announcement!'
      );

      // Default thread + 2 created threads = 3
      expect(results.length).toBe(3);

      // Check that messages were sent successfully
      const successfulMessages = results.filter(r => r.message !== null);
      expect(successfulMessages.length).toBeGreaterThan(0);

      // All successful should have the message somewhere in history
      for (const result of successfulMessages) {
        const history = threadManager.getHistory({
          threadId: result.threadId,
        });
        // Find the broadcast message in history
        const broadcastMessage = history.find((m: ThreadMessage) => m.content === 'Important announcement!');
        expect(broadcastMessage).toBeDefined();
        expect(broadcastMessage?.content).toBe('Important announcement!');
      }
    });

    it('should calculate group statistics', () => {
      const group = coordinator.createGroup({
        name: 'Stats Test',
        agents: [
          { agentId: 'agent-1' },
          { agentId: 'agent-2' },
        ],
      });

      // Create threads and add messages
      const thread = coordinator.createGroupThread(group.id, 'Active Thread', {
        agentIds: ['agent-1', 'agent-2'],
      });

      threadManager.sendMessage(thread!.id, 'agent-1', 'Hello');
      threadManager.sendMessage(thread!.id, 'agent-2', 'Hi there');

      const stats = coordinator.getGroupStats(group.id);

      expect(stats).toBeDefined();
      expect(stats?.agentCount).toBe(2);
      expect(stats?.threadCount).toBe(2); // default + created
      expect(stats?.totalMessages).toBeGreaterThanOrEqual(2);
      expect(stats?.activeAgents).toBe(2);
    });

    it('should search groups by name or topic', () => {
      coordinator.createGroup({
        name: 'Alpha Team',
        topic: 'Frontend development',
      });

      coordinator.createGroup({
        name: 'Beta Team',
        topic: 'Backend development',
      });

      coordinator.createGroup({
        name: 'Gamma Team',
        topic: 'DevOps',
      });

      const alphaResults = coordinator.searchGroups('Alpha');
      expect(alphaResults).toHaveLength(1);
      expect(alphaResults[0].name).toBe('Alpha Team');

      const devResults = coordinator.searchGroups('development');
      expect(devResults).toHaveLength(2);
    });

    it('should handle complex multi-agent workflow', () => {
      // Create a group with multiple agents
      const group = coordinator.createGroup({
        name: 'Project Team',
        topic: 'Product development',
        agents: [
          { agentId: 'pm-1', role: 'leader' },
          { agentId: 'dev-1', role: 'contributor' },
          { agentId: 'dev-2', role: 'contributor' },
          { agentId: 'qa-1', role: 'contributor' },
          { agentId: 'designer-1', role: 'coordinator' },
        ],
      });

      // PM creates tasks
      const backendTask = coordinator.createTask(group.id, 'Build API', {
        assignTo: ['dev-1', 'dev-2'],
        threadName: 'Backend Development',
      });

      const designTask = coordinator.createTask(group.id, 'Create mockups', {
        assignTo: ['designer-1'],
        threadName: 'Design Work',
      });

      // Dev communicates in backend thread
      coordinator.sendMessageWithRouting(
        group.id,
        backendTask!.threadId,
        'dev-1',
        '@dev-2 I will handle the auth endpoints'
      );

      // QA joins to review
      coordinator.assignAgentToThread(group.id, 'qa-1', backendTask!.threadId);

      // Update task status
      coordinator.updateTaskStatus(backendTask!.id, 'in_progress');

      // Verify workflow state
      expect(coordinator.getGroupTasks(group.id)).toHaveLength(2);
      expect(coordinator.getAgentTasks('dev-1')).toHaveLength(1);
      expect(threadManager.getHistory({ threadId: backendTask!.threadId }).length).toBeGreaterThan(0);
      expect(coordinator.getTask(backendTask!.id)?.status).toBe('in_progress');
    });

    it('should handle agent leaving mid-conversation', () => {
      const group = coordinator.createGroup({
        name: 'Leave Mid-way Test',
        agents: [
          { agentId: 'agent-1' },
          { agentId: 'agent-2' },
        ],
      });

      // Some conversation happens
      threadManager.sendMessage(
        group.defaultThreadId!,
        'agent-1',
        'Hey everyone!'
      );

      threadManager.sendMessage(
        group.defaultThreadId!,
        'agent-2',
        'Hi @agent-1!'
      );

      // Agent 2 leaves
      coordinator.removeAgentFromGroup(group.id, 'agent-2');

      // History should be preserved
      const history = threadManager.getHistory({
        threadId: group.defaultThreadId!,
      });

      expect(history.some((m: ThreadMessage) => m.agentId === 'agent-2')).toBe(true);
      expect(coordinator.isAgentInGroup(group.id, 'agent-2')).toBe(false);
    });
  });

  // ============================================================================
  // TEST SUITE 7: Error Handling and Edge Cases
  // ============================================================================
  describe('7. Error Handling and Edge Cases', () => {
    it('should handle operations on non-existent group', () => {
      expect(coordinator.getGroup('non-existent')).toBeUndefined();
      expect(coordinator.archiveGroup('non-existent')).toBe(false);
      expect(coordinator.addAgentToGroup('non-existent', 'agent-1')).toBe(false);
    });

    it('should handle duplicate agent addition gracefully', () => {
      const group = coordinator.createGroup({
        name: 'Duplicate Test',
        agents: [{ agentId: 'agent-1' }],
      });

      // Adding same agent again should return true (already in group)
      expect(coordinator.addAgentToGroup(group.id, 'agent-1')).toBe(true);
      expect(group.agents.size).toBe(1);
    });

    it('should prevent messages to archived threads', () => {
      const group = coordinator.createGroup({
        name: 'Archived Thread Test',
        agents: [{ agentId: 'agent-1' }],
      });

      threadManager.archiveThread(group.defaultThreadId!);

      const message = threadManager.sendMessage(
        group.defaultThreadId!,
        'agent-1',
        'This should not go through'
      );

      expect(message).toBeNull();
    });

    it('should handle empty messages', () => {
      const group = coordinator.createGroup({
        name: 'Empty Message Test',
        agents: [{ agentId: 'agent-1' }],
      });

      const message = threadManager.sendMessage(
        group.defaultThreadId!,
        'agent-1',
        ''
      );

      expect(message).toBeDefined();
      expect(message?.content).toBe('');
    });

    it('should handle rapid thread creation', () => {
      const group = coordinator.createGroup({
        name: 'Rapid Create Test',
      });

      const threads: Thread[] = [];
      for (let i = 0; i < 10; i++) {
        const thread = coordinator.createGroupThread(group.id, `Thread ${i}`);
        threads.push(thread!);
      }

      expect(group.threads.size).toBe(11); // 10 + default

      // All threads should have unique IDs
      const ids = threads.map((t) => t.id);
      expect(new Set(ids).size).toBe(10);
    });

    it('should handle self-mentions', () => {
      const group = coordinator.createGroup({
        name: 'Self-mention Test',
        agents: [{ agentId: 'agent-1' }],
      });

      const results = coordinator.routeMentions(
        group.id,
        group.defaultThreadId!,
        'agent-1',
        '@agent-1 reminder to myself'
      );

      expect(results[0].routed).toBe(true);
      expect(results[0].targetAgentId).toBe('agent-1');
    });
  });
});
