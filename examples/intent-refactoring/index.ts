/**
 * Intent-Based Refactoring Example
 * 
 * Demonstrates using natural language intents instead of manual orchestration.
 */

import { GodelClient } from '@jtan15010/godel';

async function main() {
  const client = new GodelClient({
    baseUrl: process.env.GODEL_URL || 'http://localhost:7373',
    apiKey: process.env.GODEL_API_KEY
  });

  console.log('🚀 Intent-Based Refactoring Example\n');

  try {
    // 1. Simple intent execution
    console.log('1. Executing simple intent...');
    const simpleResult = await client.intent.execute({
      description: 'Add comprehensive error handling to the API layer',
      constraints: {
        strategy: 'parallel',
        maxAgents: 3,
        timeout: 15
      }
    });
    console.log(`   ✓ Execution ID: ${simpleResult.id}`);
    console.log(`   Status: ${simpleResult.status}`);

    // 2. Intent with specific constraints
    console.log('2. Executing constrained intent...');
    const constrainedResult = await client.intent.execute({
      description: 'Refactor database queries to use connection pooling',
      constraints: {
        strategy: 'careful',
        maxAgents: 5,
        timeout: 30,
        budget: { maxCost: 15.00, maxTokens: 500000 }
      },
      context: {
        relevantFiles: ['src/db/connection.ts', 'src/db/queries.ts']
      }
    });
    console.log(`   ✓ Execution ID: ${constrainedResult.id}`);

    // 3. Multi-step intent with stages
    console.log('3. Executing multi-stage intent...');
    const stagedResult = await client.intent.execute({
      description: `
        Implement a complete caching layer:
        1. Design cache key structure
        2. Implement Redis client wrapper
        3. Add cache to hot database queries
        4. Set up cache invalidation
        5. Add metrics and monitoring
      `,
      constraints: {
        strategy: 'careful',
        stages: [
          { name: 'design', maxAgents: 1, estimatedDuration: 10 },
          { name: 'implement', maxAgents: 3, estimatedDuration: 30 },
          { name: 'integrate', maxAgents: 2, estimatedDuration: 20 },
          { name: 'validate', maxAgents: 1, estimatedDuration: 15 }
        ],
        autoRetry: true,
        maxRetries: 2
      }
    });
    console.log(`   ✓ Execution ID: ${stagedResult.id}`);
    console.log(`   Stages: ${stagedResult.stages?.length || 0}`);

    // 4. Monitor intent execution
    console.log('4. Monitoring intent execution...');
    const execution = await client.intent.get(simpleResult.id);
    
    console.log(`   Current Stage: ${execution.currentStage}`);
    console.log(`   Progress: ${execution.progress}%`);
    console.log(`   Agents Used: ${execution.agentsUsed}`);

    // Subscribe to updates
    console.log('   Listening for updates (5 seconds)...');
    const updates = client.intent.subscribe(simpleResult.id);
    
    updates.on('progress', (update: any) => {
      console.log(`   [${update.status}] ${update.message}`);
    });

    updates.on('complete', (result: any) => {
      console.log(`   ✅ Completed: ${result.summary}`);
    });

    await new Promise(r => setTimeout(r, 5000));
    updates.stop();

    // 5. Get execution results
    console.log('5. Getting execution results...');
    const results = await client.intent.results(simpleResult.id);
    console.log(`   Tasks Completed: ${results.tasksCompleted}`);
    console.log(`   Files Modified: ${results.filesModified?.length || 0}`);
    console.log(`   Total Cost: $${results.cost?.total || 0}`);

    // 6. List recent intents
    console.log('6. Listing recent intents...');
    const intents = await client.intent.list({ limit: 5 });
    for (const intent of intents) {
      console.log(`   - ${intent.id}: ${intent.description.substring(0, 50)}...`);
    }

    // 7. Cancel an intent if still running
    console.log('7. Checking for cancellation...');
    const runningIntents = await client.intent.list({ status: 'running' });
    for (const intent of runningIntents.slice(0, 1)) {
      console.log(`   Cancelling ${intent.id}...`);
      await client.intent.cancel(intent.id);
      console.log('   ✓ Cancelled');
    }

    console.log('\n✅ Example completed successfully!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
