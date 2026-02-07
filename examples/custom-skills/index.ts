/**
 * Custom Skills Example
 * 
 * Demonstrates creating and using custom skills.
 */

import { GodelClient, Skill, SkillContext, SkillResult } from '@jtan15010/godel';

// Define a custom skill
const codeAnalysisSkill: Skill = {
  name: 'code-analysis',
  version: '1.0.0',
  description: 'Analyzes code for complexity and issues',
  
  inputSchema: {
    type: 'object',
    properties: {
      target: { type: 'string' },
      metrics: { 
        type: 'array',
        items: { enum: ['complexity', 'duplication', 'coverage'] }
      }
    },
    required: ['target']
  },
  
  async execute(input: any, context: SkillContext): Promise<SkillResult> {
    const { target, metrics = ['complexity'] } = input;
    
    context.log(`Analyzing ${target}...`);
    
    const results: any = {};
    
    for (const metric of metrics) {
      context.log(`Calculating ${metric}...`);
      await new Promise(r => setTimeout(r, 500)); // Simulate work
      
      results[metric] = {
        score: Math.random() * 100,
        issues: Math.floor(Math.random() * 10)
      };
    }
    
    return {
      success: true,
      output: {
        target,
        metrics: results,
        summary: `Analyzed ${metrics.length} metrics`
      }
    };
  }
};

// Another skill for documentation
const documentationSkill: Skill = {
  name: 'doc-generator',
  version: '1.0.0',
  description: 'Generates documentation from code',
  
  inputSchema: {
    type: 'object',
    properties: {
      target: { type: 'string' },
      format: { enum: ['markdown', 'jsdoc', 'openapi'] }
    },
    required: ['target', 'format']
  },
  
  async execute(input: any, context: SkillContext): Promise<SkillResult> {
    const { target, format } = input;
    
    context.log(`Generating ${format} documentation for ${target}...`);
    await new Promise(r => setTimeout(r, 800));
    
    return {
      success: true,
      output: {
        format,
        filesGenerated: 3,
        outputPath: `docs/${target}.${format}`,
        summary: `Generated documentation in ${format} format`
      }
    };
  }
};

async function main() {
  const client = new GodelClient({
    baseUrl: process.env.GODEL_URL || 'http://localhost:7373',
    apiKey: process.env.GODEL_API_KEY
  });

  console.log('🚀 Custom Skills Example\n');

  try {
    // 1. Register custom skills
    console.log('1. Registering custom skills...');
    await client.skills.register({
      skill: codeAnalysisSkill,
      scope: 'global'
    });
    console.log('   ✓ Registered code-analysis skill');

    await client.skills.register({
      skill: documentationSkill,
      scope: 'global'
    });
    console.log('   ✓ Registered doc-generator skill');

    // 2. List available skills
    console.log('2. Listing available skills...');
    const skills = await client.skills.list();
    for (const skill of skills) {
      console.log(`   - ${skill.name} v${skill.version}: ${skill.description}`);
    }

    // 3. Invoke a skill directly
    console.log('3. Invoking code-analysis skill...');
    const analysisResult = await client.skills.invoke('code-analysis', {
      target: 'src/auth.ts',
      metrics: ['complexity', 'duplication']
    });
    
    console.log('   ✓ Analysis complete');
    console.log(`   Target: ${analysisResult.output.target}`);
    for (const [metric, data] of Object.entries(analysisResult.output.metrics)) {
      console.log(`   ${metric}: score=${(data as any).score.toFixed(1)}, issues=${(data as any).issues}`);
    }

    // 4. Invoke documentation skill
    console.log('4. Invoking doc-generator skill...');
    const docResult = await client.skills.invoke('doc-generator', {
      target: 'src/api',
      format: 'openapi'
    });
    
    console.log('   ✓ Documentation generated');
    console.log(`   Files: ${docResult.output.filesGenerated}`);
    console.log(`   Path: ${docResult.output.outputPath}`);

    // 5. Compose skills into a pipeline
    console.log('5. Creating skill pipeline...');
    const pipeline = await client.skills.compose({
      name: 'analyze-and-document',
      steps: [
        { 
          skill: 'code-analysis', 
          input: { metrics: ['complexity', 'coverage'] },
          outputAs: 'analysis'
        },
        { 
          skill: 'doc-generator', 
          input: { format: 'markdown' },
          condition: (prev: any) => prev.analysis.output.metrics.complexity.score < 50
        }
      ]
    });
    console.log('   ✓ Pipeline created');

    // 6. Run the pipeline
    console.log('6. Running skill pipeline...');
    const pipelineResult = await pipeline.run({ target: 'src/services' });
    console.log(`   ✓ Pipeline completed: ${pipelineResult.success ? 'success' : 'failed'}`);
    console.log(`   Steps executed: ${pipelineResult.stepsExecuted}`);

    // 7. Use skill in an intent
    console.log('7. Using skill via intent...');
    const intentResult = await client.intent.execute({
      description: 'Run code-analysis on src/database with complexity and duplication metrics'
    });
    console.log(`   ✓ Intent execution ID: ${intentResult.id}`);

    // 8. Get skill metadata
    console.log('8. Getting skill metadata...');
    const metadata = await client.skills.getMetadata('code-analysis');
    console.log(`   Name: ${metadata.name}`);
    console.log(`   Version: ${metadata.version}`);
    console.log(`   Input Schema: ${JSON.stringify(metadata.inputSchema)}`);

    // 9. Update a skill
    console.log('9. Updating skill version...');
    const updatedSkill = { ...codeAnalysisSkill, version: '1.1.0' };
    await client.skills.update('code-analysis', updatedSkill);
    console.log('   ✓ Updated to v1.1.0');

    // 10. Create skill with hooks
    console.log('10. Creating skill with hooks...');
    const deploymentSkill: Skill = {
      name: 'deployment',
      version: '1.0.0',
      
      async beforeExecute(input: any, context: SkillContext) {
        context.log('Pre-deployment checks...');
        // In real usage: run tests, check git status, etc.
      },
      
      async execute(input: any, context: SkillContext): Promise<SkillResult> {
        context.log(`Deploying to ${input.environment}...`);
        await new Promise(r => setTimeout(r, 1000));
        
        return {
          success: true,
          output: { deployed: true, environment: input.environment }
        };
      },
      
      async afterExecute(result: SkillResult, context: SkillContext) {
        context.log('Post-deployment cleanup...');
      }
    };
    
    await client.skills.register({ skill: deploymentSkill });
    
    const deployResult = await client.skills.invoke('deployment', {
      environment: 'staging'
    });
    console.log(`   ✓ Deployed to ${deployResult.output.environment}`);

    // 11. Unregister skills
    console.log('11. Cleaning up skills...');
    await client.skills.unregister('code-analysis');
    await client.skills.unregister('doc-generator');
    await client.skills.unregister('deployment');
    console.log('   ✓ All skills unregistered');

    console.log('\n✅ Example completed successfully!');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
