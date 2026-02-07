/**
 * Advanced Patterns Example
 * 
 * Demonstrates complex patterns for enterprise use cases.
 */

import { GodelClient } from '@jtan15010/godel';

async function main() {
  const client = new GodelClient({
    baseUrl: process.env.GODEL_URL || 'http://localhost:7373',
    apiKey: process.env.GODEL_API_KEY
  });

  console.log('🚀 Advanced Patterns Example\n');

  try {
    // 1. Convoy Pattern
    console.log('1. Creating convoy pattern...');
    const convoy = await client.convoys.create({
      name: 'feature-convoy',
      pattern: 'convoy',
      agents: [
        { role: 'architect', task: 'Design API structure' },
        { role: 'backend', task: 'Implement endpoints', dependsOn: ['architect'] },
        { role: 'frontend', task: 'Build UI', dependsOn: ['architect'] },
        { role: 'tester', task: 'Write tests', dependsOn: ['backend', 'frontend'] }
      ]
    });
    console.log(`   ✓ Convoy created: ${convoy.id}`);
    console.log(`   Agents: ${convoy.agents.length}`);
    console.log(`   Dependencies: ${convoy.dependencies.length}`);

    // 2. Reflex Pattern
    console.log('2. Creating reflex agent...');
    const reflex = await client.agents.spawn({
      role: 'worker',
      model: 'claude-sonnet-4-5',
      reflex: {
        enabled: true,
        memory: 'persistent',
        feedbackLoop: true,
        adaptationRate: 0.1
      }
    });
    console.log(`   ✓ Reflex agent: ${reflex.id}`);

    // Provide feedback
    await client.agents.feedback(reflex.id, {
      taskId: 'task-001',
      rating: 4.5,
      comments: 'Good implementation, consider error handling'
    });
    console.log('   ✓ Feedback provided');

    // 3. Swarm Pattern
    console.log('3. Creating elastic swarm...');
    const swarm = await client.swarms.create({
      name: 'processing-swarm',
      minAgents: 2,
      maxAgents: 10,
      scalePolicy: {
        metric: 'queue_depth',
        target: 10,
        scaleUpThreshold: 0.8,
        scaleDownThreshold: 0.3,
        cooldown: 60
      }
    });
    console.log(`   ✓ Swarm created: ${swarm.id}`);
    console.log(`   Size range: ${swarm.minAgents} - ${swarm.maxAgents}`);

    // Submit tasks to swarm
    for (let i = 0; i < 5; i++) {
      await swarm.submit({
        title: `Process batch ${i}`,
        priority: 'normal'
      });
    }
    console.log('   ✓ 5 tasks submitted to swarm');

    // 4. Circuit Breaker Pattern
    console.log('4. Creating agent with circuit breaker...');
    const cbAgent = await client.agents.spawn({
      role: 'worker',
      model: 'claude-sonnet-4-5',
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        timeout: 30,
        halfOpenRequests: 3
      }
    });
    console.log(`   ✓ Circuit breaker agent: ${cbAgent.id}`);

    // Check circuit state
    const cbState = await client.agents.getCircuitState(cbAgent.id);
    console.log(`   Circuit state: ${cbState.state}`);

    // 5. Saga Pattern
    console.log('5. Creating saga for distributed transaction...');
    const saga = await client.sagas.create({
      name: 'user-onboarding',
      steps: [
        {
          name: 'create-user',
          action: 'createUserAction',
          compensate: 'deleteUserAction'
        },
        {
          name: 'send-email',
          action: 'sendEmailAction',
          compensate: 'markEmailFailedAction'
        },
        {
          name: 'setup-profile',
          action: 'setupProfileAction',
          compensate: 'cleanupProfileAction'
        }
      ]
    });
    console.log(`   ✓ Saga created: ${saga.id}`);
    console.log(`   Steps: ${saga.steps.length}`);

    // Execute saga
    try {
      await saga.execute({ userId: 'user-123' });
      console.log('   ✓ Saga executed successfully');
    } catch (error) {
      console.log('   ⚠️  Saga failed, compensating...');
      await saga.compensate();
      console.log('   ✓ Compensation complete');
    }

    // 6. Bulkhead Pattern
    console.log('6. Creating bulkhead isolation...');
    const bulkhead = await client.bulkheads.create({
      name: 'service-isolation',
      partitions: [
        { name: 'auth', maxAgents: 5, maxTasks: 20 },
        { name: 'billing', maxAgents: 5, maxTasks: 20 },
        { name: 'analytics', maxAgents: 3, maxTasks: 10 }
      ]
    });
    console.log(`   ✓ Bulkhead created: ${bulkhead.id}`);
    console.log(`   Partitions: ${bulkhead.partitions.length}`);

    // 7. Backpressure Pattern
    console.log('7. Creating queue with backpressure...');
    const queue = await client.queues.create({
      name: 'high-volume-queue',
      backpressure: {
        strategy: 'shed-load',
        maxSize: 10000,
        highWatermark: 0.8,
        lowWatermark: 0.3
      }
    });
    console.log(`   ✓ Queue created: ${queue.id}`);
    console.log(`   Strategy: ${queue.backpressure.strategy}`);

    // 8. Event Sourcing
    console.log('8. Creating event-sourced agent...');
    const eventSourcedAgent = await client.agents.spawn({
      role: 'worker',
      eventSourcing: {
        enabled: true,
        snapshotInterval: 100
      }
    });
    console.log(`   ✓ Event-sourced agent: ${eventSourcedAgent.id}`);

    // Get events
    const events = await client.events.getForAgent(eventSourcedAgent.id, { limit: 10 });
    console.log(`   Events captured: ${events.length}`);

    // 9. Complex Workflow
    console.log('9. Creating complex multi-pattern workflow...');
    const complexWorkflow = await client.workflows.create({
      name: 'enterprise-feature',
      patterns: {
        coordination: 'convoy',
        transaction: 'saga',
        resilience: 'circuit-breaker',
        isolation: 'bulkhead'
      },
      stages: [
        { name: 'design', pattern: 'convoy', agents: 2 },
        { name: 'implement', pattern: 'swarm', minAgents: 3, maxAgents: 10 },
        { name: 'verify', pattern: 'saga', agents: 2 }
      ]
    });
    console.log(`   ✓ Complex workflow: ${complexWorkflow.id}`);
    console.log(`   Stages: ${complexWorkflow.stages.length}`);

    // 10. Monitor pattern metrics
    console.log('10. Getting pattern metrics...');
    const patternMetrics = await client.patterns.metrics();
    console.log(`   Active convoys: ${patternMetrics.convoys?.active || 0}`);
    console.log(`   Active swarms: ${patternMetrics.swarms?.active || 0}`);
    console.log(`   Open circuits: ${patternMetrics.circuitBreakers?.open || 0}`);
    console.log(`   Running sagas: ${patternMetrics.sagas?.running || 0}`);

    // Clean up
    console.log('11. Cleaning up pattern resources...');
    await client.convoys.destroy(convoy.id);
    await client.agents.terminate(reflex.id);
    await client.agents.terminate(cbAgent.id);
    await client.swarms.destroy(swarm.id);
    await client.bulkheads.destroy(bulkhead.id);
    await client.queues.destroy(queue.id);
    console.log('   ✓ Resources cleaned up');

    console.log('\n✅ Example completed successfully!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
