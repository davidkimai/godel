/**
 * Skills CLI Command
 * 
 * Unified skill management commands:
 * - dash skills list [--source <source>] [--json]
 * - dash skills search <query> [--limit N] [--sort type] [--source <source>]
 * - dash skills install <skill> [--version V] [--force] [--source <source>]
 * - dash skills remove <skill>
 * - dash skills update [skill] [--all]
 * - dash skills info <skill>
 * - dash skills sources
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { 
  getGlobalSkillRegistry, 
  UnifiedSkillRegistry 
} from '../../skills/registry';
import { 
  UnifiedSearchParams, 
  UnifiedSkillMetadata,
  UnifiedInstalledSkill,
  SkillSource,
  AmbiguousSkillError,
  SkillNotFoundError,
  SourceNotAvailableError,
} from '../../skills/types';
import { logger } from '../../utils/logger';

// ============================================================================
// Helper Functions
// ============================================================================

function formatStars(stars: number): string {
  if (stars >= 1000) {
    return `${(stars / 1000).toFixed(1)}k ⭐`;
  }
  return `${stars} ⭐`;
}

function formatDownloads(downloads: number): string {
  if (downloads >= 1000) {
    return `${(downloads / 1000).toFixed(1)}k ↓`;
  }
  return `${downloads} ↓`;
}

function truncate(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) return text || '';
  return text.substring(0, maxLength - 3) + '...';
}

function formatSourceBadge(source: SkillSource): string {
  switch (source) {
    case 'clawhub':
      return chalk.hex('#FF6B6B')('[ClawHub]');
    case 'vercel':
      return chalk.hex('#00D8FF')('[Vercel]');
    default:
      return chalk.gray(`[${source}]`);
  }
}

function formatSkillLine(skill: UnifiedSkillMetadata, isInstalled = false, installedVersion?: string): string {
  const name = chalk.cyan.bold(skill.name || skill.slug);
  const slug = chalk.gray(skill.slug);
  const source = formatSourceBadge(skill.source);
  const version = isInstalled 
    ? chalk.yellow(`[${installedVersion}]`)
    : '';
  
  return `${isInstalled ? chalk.green('✓') : ' '} ${source} ${name} ${slug} ${version}`;
}

function formatActivationState(state: string): string {
  switch (state) {
    case 'active':
      return chalk.green('● active');
    case 'inactive':
      return chalk.gray('○ inactive');
    case 'activating':
      return chalk.yellow('◐ activating...');
    case 'deactivating':
      return chalk.yellow('◑ deactivating...');
    case 'error':
      return chalk.red('✗ error');
    default:
      return chalk.gray(`? ${state}`);
  }
}

// ============================================================================
// Command Registration
// ============================================================================

export function registerSkillsCommand(program: Command): void {
  const skills = program
    .command('skills')
    .description('Manage skills from ClawHub and Vercel sources');

  // ============================================================================
  // skills list
  // ============================================================================
  skills
    .command('list')
    .description('List installed skills from all sources')
    .option('-s, --source <source>', 'Filter by source (clawhub, vercel)')
    .option('-a, --all', 'Show all skills including inactive', false)
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const registry = getGlobalSkillRegistry();
        const installed = await registry.listInstalled();

        // Filter by source if specified
        let displaySkills = installed;
        if (options.source) {
          displaySkills = installed.filter(s => s.source === options.source);
        }

        // Filter inactive if not showing all
        if (!options.all) {
          displaySkills = displaySkills.filter(s => 
            s.activationState === 'active' || s.activationState === 'inactive'
          );
        }

        if (displaySkills.length === 0) {
          console.log(chalk.yellow('No skills installed.'));
          console.log(chalk.gray('\nInstall skills with:'));
          console.log(chalk.gray('  dash skills install <skill>'));
          console.log(chalk.gray('\nSearch for skills with:'));
          console.log(chalk.gray('  dash skills search <query>'));
          console.log(chalk.gray('\nAvailable sources:'));
          const sources = registry.getSources();
          for (const source of sources) {
            console.log(chalk.gray(`  - ${source.name}: ${source.url}`));
          }
          return;
        }

        if (options.json) {
          console.log(JSON.stringify(displaySkills, null, 2));
          return;
        }

        console.log(chalk.bold(`Installed Skills (${displaySkills.length}):\n`));

        // Group by source
        const bySource: Record<SkillSource, UnifiedInstalledSkill[]> = {
          clawhub: displaySkills.filter(s => s.source === 'clawhub'),
          vercel: displaySkills.filter(s => s.source === 'vercel'),
        };

        for (const [source, sourceSkills] of Object.entries(bySource)) {
          if (sourceSkills.length === 0) continue;
          
          console.log(formatSourceBadge(source as SkillSource));
          console.log();

          // Group by state
          const active = sourceSkills.filter(s => s.activationState === 'active');
          const inactive = sourceSkills.filter(s => s.activationState === 'inactive');

          if (active.length > 0) {
            for (const skill of active) {
              console.log(`  ${chalk.green('✓')} ${chalk.cyan(skill.name || skill.slug)} ${chalk.gray('@' + skill.version)} ${formatActivationState(skill.activationState)}`);
              console.log(chalk.gray(`    ${truncate(skill.description, 60)}`));
            }
          }

          if (inactive.length > 0) {
            for (const skill of inactive) {
              console.log(`  ${chalk.gray('○')} ${chalk.cyan(skill.name || skill.slug)} ${chalk.gray('@' + skill.version)} ${formatActivationState(skill.activationState)}`);
            }
          }
          
          console.log();
        }

        console.log(chalk.gray(`Skills directory: ${registry.getSkillsDirectory()}`));
      } catch (error) {
        console.error(chalk.red('❌ Failed to list skills'));
        console.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // ============================================================================
  // skills search
  // ============================================================================
  skills
    .command('search <query>')
    .description('Search for skills across all sources')
    .option('-l, --limit <limit>', 'Maximum results to show', '20')
    .option('--sort <sort>', 'Sort by: relevance, downloads, stars, recent', 'relevance')
    .option('-s, --source <source>', 'Search specific source (clawhub, vercel)')
    .option('--json', 'Output as JSON')
    .action(async (query: string, options) => {
      try {
        console.log(chalk.blue('🔍 Searching across skill sources...\n'));

        const registry = getGlobalSkillRegistry();

        const searchParams: UnifiedSearchParams = {
          query: query || '',
          limit: parseInt(options.limit, 10),
          sort: options.sort as UnifiedSearchParams['sort'],
          sources: options.source ? [options.source as SkillSource] : undefined,
        };

        const startTime = Date.now();
        const result = await registry.search(searchParams);
        const totalTime = Date.now() - startTime;

        if (result.skills.length === 0) {
          console.log(chalk.yellow('No skills found matching your query.'));
          console.log(chalk.gray('\nTips:'));
          console.log(chalk.gray('  - Try a broader search term'));
          console.log(chalk.gray('  - Check for typos'));
          console.log(chalk.gray('  - Browse available sources:'));
          console.log(chalk.gray('    - https://clawhub.ai (ClawHub)'));
          console.log(chalk.gray('    - https://skills.sh (Vercel)'));
          return;
        }

        // Get list of installed skills for comparison
        const installed = await registry.listInstalled();
        const installedMap = new Map(installed.map(s => [s.id, s.version]));

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        // Show summary by source
        console.log(chalk.bold(`Results from ${Object.values(result.bySource).filter(s => s.total > 0).length} source(s):`));
        for (const [source, data] of Object.entries(result.bySource)) {
          if (data.total > 0) {
            console.log(`  ${formatSourceBadge(source as SkillSource)}: ${data.total} skills`);
          }
        }
        console.log();

        // Show results
        console.log(chalk.bold(`Found ${result.total} skills (showing ${result.skills.length}):\n`));

        for (const skill of result.skills) {
          const isInstalled = installedMap.has(skill.id);
          const installedVersion = installedMap.get(skill.id);
          const line = formatSkillLine(skill, isInstalled, installedVersion);
          console.log(line);
          console.log(chalk.gray(`   ${formatStars(skill.stars)} ${formatDownloads(skill.downloads)}`));
          console.log(chalk.gray(`   ${truncate(skill.description, 70)}`));
          console.log();
        }

        console.log(chalk.gray(`Query time: ${totalTime}ms | Sources: ${Object.keys(result.bySource).join(', ')}`));
        
        if (result.total > result.skills.length) {
          console.log(chalk.gray(`Use --limit ${Math.min(result.total, result.skills.length + 20)} to see more results`));
        }
      } catch (error) {
        console.error(chalk.red('❌ Search failed'));
        console.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // ============================================================================
  // skills install
  // ============================================================================
  skills
    .command('install <skill>')
    .description('Install a skill from any source')
    .option('-v, --version <version>', 'Specific version to install')
    .option('-f, --force', 'Force reinstall if already installed', false)
    .option('-s, --source <source>', 'Install from specific source (clawhub, vercel)')
    .option('--no-deps', 'Skip installing dependencies')
    .action(async (skillId: string, options) => {
      try {
        // Add source prefix if specified
        const fullSkillId = options.source 
          ? `${options.source}:${skillId}`
          : skillId;

        console.log(chalk.blue(`📦 Installing ${fullSkillId}...\n`));

        const registry = getGlobalSkillRegistry();

        // Check if already installed
        const existing = await registry.isInstalled(fullSkillId);
        if (existing.installed && !options.force) {
          console.log(chalk.yellow(`⚠️  ${skillId}@${existing.version} is already installed from ${existing.source}.`));
          console.log(chalk.gray('   Use --force to reinstall.'));
          return;
        }

        // Fetch skill metadata first
        console.log(chalk.gray('Fetching skill metadata...'));
        const metadata = await registry.fetchSkill(fullSkillId);
        console.log(chalk.green(`✓ Found ${metadata.name || skillId} v${metadata.version} from ${formatSourceBadge(metadata.source)}`));
        console.log(chalk.gray(`  ${metadata.description}`));
        console.log();

        // Install
        const startTime = Date.now();
        const result = await registry.install(fullSkillId, {
          version: options.version,
          force: options.force,
          installDependencies: !options.noDeps,
        });

        const duration = Date.now() - startTime;

        if (result.success) {
          console.log(chalk.green(`\n✓ Successfully installed ${skillId}@${result.version}`));
          console.log(chalk.gray(`  Source: ${formatSourceBadge(result.source)}`));
          console.log(chalk.gray(`  Path: ${result.installPath}`));
          console.log(chalk.gray(`  Time: ${duration}ms`));

          if (result.installedDependencies?.length) {
            console.log(chalk.gray(`  Dependencies: ${result.installedDependencies.length} installed`));
          }

          if (result.warnings?.length) {
            console.log(chalk.yellow('\nWarnings:'));
            for (const warning of result.warnings) {
              console.log(chalk.yellow(`  ⚠️  ${warning}`));
            }
          }
        } else {
          console.error(chalk.red('\n❌ Installation failed'));
          if (result.errors?.length) {
            for (const error of result.errors) {
              console.error(chalk.red(`   ${error}`));
            }
          }
          process.exit(1);
        }
      } catch (error) {
        if (error instanceof AmbiguousSkillError) {
          console.error(chalk.yellow('⚠️  Multiple sources have this skill:'));
          console.error(chalk.gray(`   ${error.sources.map(s => `${s}:${skillId}`).join(', ')}`));
          console.error(chalk.gray('\n   Specify source with:'));
          console.error(chalk.gray(`   dash skills install clawhub:${skillId}`));
          console.error(chalk.gray(`   dash skills install vercel:${skillId}`));
        } else if (error instanceof SkillNotFoundError) {
          console.error(chalk.red(`❌ Skill not found: ${skillId}`));
          console.error(chalk.gray('\n   Try searching first:'));
          console.error(chalk.gray(`   dash skills search ${skillId}`));
        } else if (error instanceof SourceNotAvailableError) {
          console.error(chalk.red(`❌ Source not available: ${error.source}`));
        } else {
          console.error(chalk.red('❌ Installation failed'));
          console.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
        }
        process.exit(1);
      }
    });

  // ============================================================================
  // skills remove
  // ============================================================================
  skills
    .command('remove <skill>')
    .description('Remove/uninstall a skill')
    .option('-y, --yes', 'Skip confirmation', false)
    .action(async (skillId: string, options) => {
      try {
        const registry = getGlobalSkillRegistry();

        // Check if installed
        const existing = await registry.isInstalled(skillId);
        if (!existing.installed) {
          console.log(chalk.yellow(`⚠️  ${skillId} is not installed.`));
          return;
        }

        // Confirm unless --yes
        if (!options.yes) {
          console.log(chalk.yellow(`\n⚠️  This will remove ${skillId}@${existing.version} from ${existing.source}`));
          console.log(chalk.gray('Use --yes to skip this confirmation\n'));
          console.log(chalk.gray('Re-run with --yes to confirm:'));
          console.log(chalk.gray(`  dash skills remove ${skillId} --yes`));
          return;
        }

        console.log(chalk.blue(`\n🗑️  Removing ${skillId}...`));

        await registry.uninstall(skillId);

        console.log(chalk.green(`✓ ${skillId} has been removed`));
      } catch (error) {
        console.error(chalk.red('❌ Remove failed'));
        console.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // ============================================================================
  // skills update
  // ============================================================================
  skills
    .command('update [skill]')
    .description('Update installed skills')
    .option('--all', 'Update all skills', false)
    .action(async (skillId: string | undefined, options) => {
      try {
        const registry = getGlobalSkillRegistry();

        if (!skillId && !options.all) {
          console.log(chalk.yellow('Please specify a skill or use --all to update all skills'));
          console.log(chalk.gray('  dash skills update <skill>'));
          console.log(chalk.gray('  dash skills update --all'));
          return;
        }

        if (options.all) {
          console.log(chalk.blue('🔄 Checking for updates...\n'));
          
          const installed = await registry.listInstalled();
          let updateCount = 0;
          let errorCount = 0;

          for (const skill of installed) {
            try {
              console.log(chalk.gray(`Checking ${skill.name || skill.slug}...`));
              const metadata = await registry.fetchSkill(skill.id);
              
              if (metadata.version !== skill.version) {
                console.log(chalk.yellow(`${skill.name || skill.slug}: ${skill.version} → ${metadata.version}`));
                
                const result = await registry.update(skill.id);
                if (result.success) {
                  console.log(chalk.green(`  ✓ Updated to ${metadata.version}`));
                  updateCount++;
                } else {
                  console.log(chalk.red(`  ✗ Update failed`));
                  errorCount++;
                }
              }
            } catch (error) {
              console.log(chalk.red(`  ✗ Failed to check ${skill.slug}: ${error instanceof Error ? error.message : String(error)}`));
              errorCount++;
            }
          }

          if (updateCount === 0 && errorCount === 0) {
            console.log(chalk.green('All skills are up to date!'));
          } else {
            console.log();
            if (updateCount > 0) {
              console.log(chalk.green(`Updated ${updateCount} skill(s)`));
            }
            if (errorCount > 0) {
              console.log(chalk.red(`Failed to update ${errorCount} skill(s)`));
            }
          }
        } else if (skillId) {
          console.log(chalk.blue(`🔄 Checking ${skillId} for updates...\n`));
          
          const existing = await registry.isInstalled(skillId);
          if (!existing.installed) {
            console.log(chalk.yellow(`${skillId} is not installed`));
            return;
          }

          const metadata = await registry.fetchSkill(skillId);
          
          if (metadata.version === existing.version) {
            console.log(chalk.green(`${skillId} is already at the latest version (${existing.version})`));
          } else {
            console.log(chalk.yellow(`${skillId}: ${existing.version} → ${metadata.version}`));
            const result = await registry.update(skillId);
            if (result.success) {
              console.log(chalk.green(`✓ Updated to ${metadata.version}`));
            } else {
              console.log(chalk.red(`✗ Update failed`));
              process.exit(1);
            }
          }
        }
      } catch (error) {
        console.error(chalk.red('❌ Update failed'));
        console.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // ============================================================================
  // skills info
  // ============================================================================
  skills
    .command('info <skill>')
    .description('Show detailed information about a skill')
    .option('--readme', 'Show full README content')
    .action(async (skillId: string, options) => {
      try {
        const registry = getGlobalSkillRegistry();

        console.log(chalk.blue(`🔍 Fetching information for ${skillId}...\n`));

        // Fetch metadata
        const metadata = await registry.fetchSkill(skillId);

        // Check installation status
        const installed = await registry.isInstalled(skillId);

        // Display info
        console.log(chalk.bold.cyan(metadata.name || metadata.slug));
        console.log(chalk.gray(metadata.slug));
        console.log(formatSourceBadge(metadata.source));
        console.log();

        console.log(chalk.white(metadata.description));
        console.log();

        console.log(chalk.bold('Stats:'));
        console.log(`  ${formatStars(metadata.stars)}`);
        console.log(`  ${formatDownloads(metadata.downloads)}`);
        console.log(`  Version: ${metadata.version}`);
        if (metadata.versions && metadata.versions.length > 1) {
          console.log(`  All versions: ${metadata.versions.join(', ')}`);
        }
        console.log();

        console.log(chalk.bold('Author:'));
        console.log(`  ${metadata.author.username}`);
        console.log();

        if (metadata.tags.length > 0) {
          console.log(chalk.bold('Tags:'));
          console.log(`  ${metadata.tags.map(t => chalk.blue(`#${t}`)).join(' ')}`);
          console.log();
        }

        // Installation status
        console.log(chalk.bold('Installation:'));
        if (installed.installed) {
          console.log(chalk.green(`  ✓ Installed (v${installed.version})`));
          console.log(`  Source: ${formatSourceBadge(installed.source!)}`);
        } else {
          console.log(chalk.gray('  Not installed'));
          console.log(chalk.gray(`  Install: dash skills install ${skillId}`));
        }
        console.log();

        // Show README if requested
        if (options.readme && metadata.readme) {
          console.log(chalk.bold('README:'));
          console.log(chalk.gray('─'.repeat(60)));
          console.log(metadata.readme);
          console.log(chalk.gray('─'.repeat(60)));
        } else if (metadata.readme) {
          console.log(chalk.gray('Use --readme to view full documentation'));
        }
      } catch (error) {
        if (error instanceof SkillNotFoundError) {
          console.error(chalk.red(`❌ Skill not found: ${skillId}`));
          console.error(chalk.gray('\nTry searching for it:'));
          console.error(chalk.gray(`  dash skills search ${skillId}`));
        } else {
          console.error(chalk.red('❌ Failed to fetch skill info'));
          console.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
        }
        process.exit(1);
      }
    });

  // ============================================================================
  // skills sources
  // ============================================================================
  skills
    .command('sources')
    .description('List available skill sources')
    .action(async () => {
      try {
        const registry = getGlobalSkillRegistry();
        const sources = registry.getSources();

        console.log(chalk.bold('Available Skill Sources:\n'));

        for (const source of sources) {
          const status = source.enabled 
            ? chalk.green('● enabled')
            : chalk.gray('○ disabled');
          
          console.log(`${formatSourceBadge(source.id)} ${status}`);
          console.log(chalk.gray(`  ${source.description}`));
          console.log(chalk.gray(`  URL: ${source.url}`));
          console.log();
        }

        console.log(chalk.gray('Use --source <source> to search or install from a specific source.'));
      } catch (error) {
        console.error(chalk.red('❌ Failed to list sources'));
        console.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });
}

export default registerSkillsCommand;
