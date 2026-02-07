/**
 * Team Orchestration Example
 * 
 * Demonstrates creating teams with different strategies and compositions.
 */

import { GodelClient } from '@jtan15010/godel';

async function main() {
  const client = new GodelClient({
    baseUrl: process.env.GODEL_URL || 'http://localhost:7373',
    apiKey: process.env.GODEL_API_KEY
  });

  console.log('🚀 Team Orchestration Example\n');

  try {
    // 1. Create a parallel team
    console.log('1. Creating parallel team...');
    const parallelTeam = await client.teams.create({
      name: 'parallel-example',
      strategy: 'parallel',
      composition: {
        coordinator: { role: 'coordinator', model: 'claude-opus-4' },
        workers: [
          { role: 'worker', count: 3, model: 'claude-sonnet-4-5' }
        ],
        reviewers: [
          { role: 'reviewer', count: 1, model: 'claude-sonnet-4-5' }
        ]
      },
      task: {
        description: 'Implement OAuth2 authentication',
        budget: { maxTokens: 100000, maxCost: 5.00 }
      }
    });
    console.log(`   ✓ Created: ${parallelTeam.id}`);
    console.log(`   Agents: ${parallelTeam.agents.length}`);

    // 2. Create a map-reduce team
    console.log('2. Creating map-reduce team...');
    const mapReduceTeam = await client.teams.create({
      name: 'mapreduce-example',
      strategy: 'map-reduce',
      composition: {
        coordinator: { role: 'coordinator', model: 'claude-opus-4' },
        workers: [
          { role: 'worker', count: 5, model: 'claude-sonnet-4-5' }
        ]
      },
      task: {
        description: 'Analyze codebase for security issues',
        budget: { maxTokens: 200000 }
      }
    });
    console.log(`   ✓ Created: ${mapReduceTeam.id}`);

    // 3. Create a pipeline team
    console.log('3. Creating pipeline team...');
    const pipelineTeam = await client.teams.create({
      name: 'pipeline-example',
      strategy: 'pipeline',
      composition: {
        coordinator: { role: 'coordinator', model: 'claude-opus-4' },
        workers: [
          { role: 'worker', stage: 'analyze', model: 'claude-sonnet-4-5' },
          { role: 'reviewer', stage: 'review', model: 'claude-opus-4' },
          { role: 'refinery', stage: 'refine', model: 'claude-sonnet-4-5' }
        ]
      },
      task: {
        description: 'Refactor authentication module',
        budget: { maxCost: 10.00 }
      }
    });
    console.log(`   ✓ Created: ${pipelineTeam.id}`);

    // 4. List all teams
    console.log('4. Listing teams...');
    const teams = await client.teams.list();
    for (const team of teams) {
      console.log(`   - ${team.id}: ${team.name} (${team.strategy})`);
    }

    // 5. Get team details
    console.log('5. Getting team details...');
    const details = await client.teams.get(parallelTeam.id);
    console.log(`   Status: ${details.status}`);
    console.log(`   Agents: ${details.agents?.length || 0}`);
    console.log(`   Tasks: ${details.metrics?.tasksCompleted || 0} completed`);

    // 6. Scale the team
    console.log('6. Scaling parallel team...');
    await client.teams.scale(parallelTeam.id, { workers: 5 });
    console.log('   ✓ Scaled to 5 workers');

    // 7. Monitor team events
    console.log('7. Monitoring team events (5 seconds)...');
    const eventStream = client.events.stream({ teamId: parallelTeam.id });
    
    eventStream.on('event', (event: any) => {
      console.log(`   [${event.type}] ${event.message}`);
    });

    await new Promise(r => setTimeout(r, 5000));
    eventStream.stop();

    // 8. Clean up
    console.log('8. Cleaning up teams...');
    await client.teams.destroy(parallelTeam.id);
    await client.teams.destroy(mapReduceTeam.id);
    await client.teams.destroy(pipelineTeam.id);
    console.log('   ✓ Teams destroyed');

    console.log('\n✅ Example completed successfully!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
