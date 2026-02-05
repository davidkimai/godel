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

import { logger } from '../../utils/logger';
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
          logger.info(chalk.yellow('No skills installed.'));
          logger.info(chalk.gray('\nInstall skills with:'));
          logger.info(chalk.gray('  dash skills install <skill>'));
          logger.info(chalk.gray('\nSearch for skills with:'));
          logger.info(chalk.gray('  dash skills search <query>'));
          logger.info(chalk.gray('\nAvailable sources:'));
          const sources = registry.getSources();
          for (const source of sources) {
            logger.info(chalk.gray(`  - ${source.name}: ${source.url}`));
          }
          return;
        }

        if (options.json) {
          logger.info(JSON.stringify(displaySkills, null, 2));
          return;
        }

        logger.info(chalk.bold(`Installed Skills (${displaySkills.length}):\n`));

        // Group by source
        const bySource: Record<SkillSource, UnifiedInstalledSkill[]> = {
          clawhub: displaySkills.filter(s => s.source === 'clawhub'),
          vercel: displaySkills.filter(s => s.source === 'vercel'),
        };

        for (const [source, sourceSkills] of Object.entries(bySource)) {
          if (sourceSkills.length === 0) continue;
          
          logger.info(formatSourceBadge(source as SkillSource));
          logger.info('');

          // Group by state
          const active = sourceSkills.filter(s => s.activationState === 'active');
          const inactive = sourceSkills.filter(s => s.activationState === 'inactive');

          if (active.length > 0) {
            for (const skill of active) {
              logger.info(`  ${chalk.green('✓')} ${chalk.cyan(skill.name || skill.slug)} ${chalk.gray('@' + skill.version)} ${formatActivationState(skill.activationState)}`);
              logger.info(chalk.gray(`    ${truncate(skill.description, 60)}`));
            }
          }

          if (inactive.length > 0) {
            for (const skill of inactive) {
              logger.info(`  ${chalk.gray('○')} ${chalk.cyan(skill.name || skill.slug)} ${chalk.gray('@' + skill.version)} ${formatActivationState(skill.activationState)}`);
            }
          }
          
          logger.info('');
        }

        logger.info(chalk.gray(`Skills directory: ${registry.getSkillsDirectory()}`));
      } catch (error) {
        logger.error(chalk.red('❌ Failed to list skills'));
        logger.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
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
        logger.info(chalk.blue('🔍 Searching across skill sources...\n'));

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
          logger.info(chalk.yellow('No skills found matching your query.'));
          logger.info(chalk.gray('\nTips:'));
          logger.info(chalk.gray('  - Try a broader search term'));
          logger.info(chalk.gray('  - Check for typos'));
          logger.info(chalk.gray('  - Browse available sources:'));
          logger.info(chalk.gray('    - https://clawhub.ai (ClawHub)'));
          logger.info(chalk.gray('    - https://skills.sh (Vercel)'));
          return;
        }

        // Get list of installed skills for comparison
        const installed = await registry.listInstalled();
        const installedMap = new Map(installed.map(s => [s.id, s.version]));

        if (options.json) {
          logger.info(JSON.stringify(result, null, 2));
          return;
        }

        // Show summary by source
        logger.info(chalk.bold(`Results from ${Object.values(result.bySource).filter(s => s.total > 0).length} source(s):`));
        for (const [source, data] of Object.entries(result.bySource)) {
          if (data.total > 0) {
            logger.info(`  ${formatSourceBadge(source as SkillSource)}: ${data.total} skills`);
          }
        }
        logger.info('');

        // Show results
        logger.info(chalk.bold(`Found ${result.total} skills (showing ${result.skills.length}):\n`));

        for (const skill of result.skills) {
          const isInstalled = installedMap.has(skill.id);
          const installedVersion = installedMap.get(skill.id);
          const line = formatSkillLine(skill, isInstalled, installedVersion);
          logger.info(line);
          logger.info(chalk.gray(`   ${formatStars(skill.stars)} ${formatDownloads(skill.downloads)}`));
          logger.info(chalk.gray(`   ${truncate(skill.description, 70)}`));
          logger.info('');
        }

        logger.info(chalk.gray(`Query time: ${totalTime}ms | Sources: ${Object.keys(result.bySource).join(', ')}`));
        
        if (result.total > result.skills.length) {
          logger.info(chalk.gray(`Use --limit ${Math.min(result.total, result.skills.length + 20)} to see more results`));
        }
      } catch (error) {
        logger.error(chalk.red('❌ Search failed'));
        logger.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
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

        logger.info(chalk.blue(`📦 Installing ${fullSkillId}...\n`));

        const registry = getGlobalSkillRegistry();

        // Check if already installed
        const existing = await registry.isInstalled(fullSkillId);
        if (existing.installed && !options.force) {
          logger.info(chalk.yellow(`⚠️  ${skillId}@${existing.version} is already installed from ${existing.source}.`));
          logger.info(chalk.gray('   Use --force to reinstall.'));
          return;
        }

        // Fetch skill metadata first
        logger.info(chalk.gray('Fetching skill metadata...'));
        const metadata = await registry.fetchSkill(fullSkillId);
        logger.info(chalk.green(`✓ Found ${metadata.name || skillId} v${metadata.version} from ${formatSourceBadge(metadata.source)}`));
        logger.info(chalk.gray(`  ${metadata.description}`));
        logger.info('');

        // Install
        const startTime = Date.now();
        const result = await registry.install(fullSkillId, {
          version: options.version,
          force: options.force,
          installDependencies: !options.noDeps,
        });

        const duration = Date.now() - startTime;

        if (result.success) {
          logger.info(chalk.green(`\n✓ Successfully installed ${skillId}@${result.version}`));
          logger.info(chalk.gray(`  Source: ${formatSourceBadge(result.source)}`));
          logger.info(chalk.gray(`  Path: ${result.installPath}`));
          logger.info(chalk.gray(`  Time: ${duration}ms`));

          if (result.installedDependencies?.length) {
            logger.info(chalk.gray(`  Dependencies: ${result.installedDependencies.length} installed`));
          }

          if (result.warnings?.length) {
            logger.info(chalk.yellow('\nWarnings:'));
            for (const warning of result.warnings) {
              logger.info(chalk.yellow(`  ⚠️  ${warning}`));
            }
          }
        } else {
          logger.error(chalk.red('\n❌ Installation failed'));
          if (result.errors?.length) {
            for (const error of result.errors) {
              logger.error(chalk.red(`   ${error}`));
            }
          }
          process.exit(1);
        }
      } catch (error) {
        if (error instanceof AmbiguousSkillError) {
          logger.error(chalk.yellow('⚠️  Multiple sources have this skill:'));
          logger.error(chalk.gray(`   ${error.sources.map(s => `${s}:${skillId}`).join(', ')}`));
          logger.error(chalk.gray('\n   Specify source with:'));
          logger.error(chalk.gray(`   dash skills install clawhub:${skillId}`));
          logger.error(chalk.gray(`   dash skills install vercel:${skillId}`));
        } else if (error instanceof SkillNotFoundError) {
          logger.error(chalk.red(`❌ Skill not found: ${skillId}`));
          logger.error(chalk.gray('\n   Try searching first:'));
          logger.error(chalk.gray(`   dash skills search ${skillId}`));
        } else if (error instanceof SourceNotAvailableError) {
          logger.error(chalk.red(`❌ Source not available: ${error.source}`));
        } else {
          logger.error(chalk.red('❌ Installation failed'));
          logger.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
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
          logger.info(chalk.yellow(`⚠️  ${skillId} is not installed.`));
          return;
        }

        // Confirm unless --yes
        if (!options.yes) {
          logger.info(chalk.yellow(`\n⚠️  This will remove ${skillId}@${existing.version} from ${existing.source}`));
          logger.info(chalk.gray('Use --yes to skip this confirmation\n'));
          logger.info(chalk.gray('Re-run with --yes to confirm:'));
          logger.info(chalk.gray(`  dash skills remove ${skillId} --yes`));
          return;
        }

        logger.info(chalk.blue(`\n🗑️  Removing ${skillId}...`));

        await registry.uninstall(skillId);

        logger.info(chalk.green(`✓ ${skillId} has been removed`));
      } catch (error) {
        logger.error(chalk.red('❌ Remove failed'));
        logger.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
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
          logger.info(chalk.yellow('Please specify a skill or use --all to update all skills'));
          logger.info(chalk.gray('  dash skills update <skill>'));
          logger.info(chalk.gray('  dash skills update --all'));
          return;
        }

        if (options.all) {
          logger.info(chalk.blue('🔄 Checking for updates...\n'));
          
          const installed = await registry.listInstalled();
          let updateCount = 0;
          let errorCount = 0;

          for (const skill of installed) {
            try {
              logger.info(chalk.gray(`Checking ${skill.name || skill.slug}...`));
              const metadata = await registry.fetchSkill(skill.id);
              
              if (metadata.version !== skill.version) {
                logger.info(chalk.yellow(`${skill.name || skill.slug}: ${skill.version} → ${metadata.version}`));
                
                const result = await registry.update(skill.id);
                if (result.success) {
                  logger.info(chalk.green(`  ✓ Updated to ${metadata.version}`));
                  updateCount++;
                } else {
                  logger.info(chalk.red(`  ✗ Update failed`));
                  errorCount++;
                }
              }
            } catch (error) {
              logger.info(chalk.red(`  ✗ Failed to check ${skill.slug}: ${error instanceof Error ? error.message : String(error)}`));
              errorCount++;
            }
          }

          if (updateCount === 0 && errorCount === 0) {
            logger.info(chalk.green('All skills are up to date!'));
          } else {
            logger.info('');
            if (updateCount > 0) {
              logger.info(chalk.green(`Updated ${updateCount} skill(s)`));
            }
            if (errorCount > 0) {
              logger.info(chalk.red(`Failed to update ${errorCount} skill(s)`));
            }
          }
        } else if (skillId) {
          logger.info(chalk.blue(`🔄 Checking ${skillId} for updates...\n`));
          
          const existing = await registry.isInstalled(skillId);
          if (!existing.installed) {
            logger.info(chalk.yellow(`${skillId} is not installed`));
            return;
          }

          const metadata = await registry.fetchSkill(skillId);
          
          if (metadata.version === existing.version) {
            logger.info(chalk.green(`${skillId} is already at the latest version (${existing.version})`));
          } else {
            logger.info(chalk.yellow(`${skillId}: ${existing.version} → ${metadata.version}`));
            const result = await registry.update(skillId);
            if (result.success) {
              logger.info(chalk.green(`✓ Updated to ${metadata.version}`));
            } else {
              logger.info(chalk.red(`✗ Update failed`));
              process.exit(1);
            }
          }
        }
      } catch (error) {
        logger.error(chalk.red('❌ Update failed'));
        logger.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
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

        logger.info(chalk.blue(`🔍 Fetching information for ${skillId}...\n`));

        // Fetch metadata
        const metadata = await registry.fetchSkill(skillId);

        // Check installation status
        const installed = await registry.isInstalled(skillId);

        // Display info
        logger.info(chalk.bold.cyan(metadata.name || metadata.slug));
        logger.info(chalk.gray(metadata.slug));
        logger.info(formatSourceBadge(metadata.source));
        logger.info('');

        logger.info(chalk.white(metadata.description));
        logger.info('');

        logger.info(chalk.bold('Stats:'));
        logger.info(`  ${formatStars(metadata.stars)}`);
        logger.info(`  ${formatDownloads(metadata.downloads)}`);
        logger.info(`  Version: ${metadata.version}`);
        if (metadata.versions && metadata.versions.length > 1) {
          logger.info(`  All versions: ${metadata.versions.join(', ')}`);
        }
        logger.info('');

        logger.info(chalk.bold('Author:'));
        logger.info(`  ${metadata.author.username}`);
        logger.info('');

        if (metadata.tags.length > 0) {
          logger.info(chalk.bold('Tags:'));
          logger.info(`  ${metadata.tags.map(t => chalk.blue(`#${t}`)).join(' ')}`);
          logger.info('');
        }

        // Installation status
        logger.info(chalk.bold('Installation:'));
        if (installed.installed) {
          logger.info(chalk.green(`  ✓ Installed (v${installed.version})`));
          logger.info(`  Source: ${formatSourceBadge(installed.source!)}`);
        } else {
          logger.info(chalk.gray('  Not installed'));
          logger.info(chalk.gray(`  Install: dash skills install ${skillId}`));
        }
        logger.info('');

        // Show README if requested
        if (options.readme && metadata.readme) {
          logger.info(chalk.bold('README:'));
          logger.info(chalk.gray('─'.repeat(60)));
          logger.info(metadata.readme);
          logger.info(chalk.gray('─'.repeat(60)));
        } else if (metadata.readme) {
          logger.info(chalk.gray('Use --readme to view full documentation'));
        }
      } catch (error) {
        if (error instanceof SkillNotFoundError) {
          logger.error(chalk.red(`❌ Skill not found: ${skillId}`));
          logger.error(chalk.gray('\nTry searching for it:'));
          logger.error(chalk.gray(`  dash skills search ${skillId}`));
        } else {
          logger.error(chalk.red('❌ Failed to fetch skill info'));
          logger.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
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

        logger.info(chalk.bold('Available Skill Sources:\n'));

        for (const source of sources) {
          const status = source.enabled 
            ? chalk.green('● enabled')
            : chalk.gray('○ disabled');
          
          logger.info(`${formatSourceBadge(source.id)} ${status}`);
          logger.info(chalk.gray(`  ${source.description}`));
          logger.info(chalk.gray(`  URL: ${source.url}`));
          logger.info('');
        }

        logger.info(chalk.gray('Use --source <source> to search or install from a specific source.'));
      } catch (error) {
        logger.error(chalk.red('❌ Failed to list sources'));
        logger.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });
}

export default registerSkillsCommand;
