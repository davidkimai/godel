/**
 * ClawHub CLI Command
 * 
 * Commands:
 * - dash clawhub search [query] [--limit N] [--sort type]
 * - dash clawhub install [skill] [--version V] [--force]
 * - dash clawhub list [--show-inactive]
 * - dash clawhub uninstall [skill]
 * - dash clawhub info [skill]
 * 
 * Per OPENCLAW_INTEGRATION_SPEC.md section F4.1
 */

import { Command } from 'commander';
import { getGlobalClawHubClient, ClawHubClient } from '../../integrations/openclaw/ClawHubClient';
import { getGlobalSkillInstaller, SkillInstaller } from '../../integrations/openclaw/SkillInstaller';
import { SkillSearchParams, SkillMetadata, InstalledSkill } from '../../integrations/openclaw/ClawHubTypes';
import { logger } from '../../utils/logger';
import chalk from 'chalk';

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
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function formatVersion(version: string, isLatest: boolean): string {
  if (isLatest) {
    return chalk.green(`${version} (latest)`);
  }
  return chalk.gray(version);
}

function formatSkillLine(skill: SkillMetadata, isInstalled = false, installedVersion?: string): string {
  const name = chalk.cyan.bold(skill.name || skill.slug);
  const slug = chalk.gray(skill.slug);
  const stars = formatStars(skill.stars);
  const downloads = formatDownloads(skill.downloads);
  const version = isInstalled 
    ? chalk.yellow(`[${installedVersion}]`)
    : '';
  
  return `${isInstalled ? chalk.green('✓') : ' '} ${name} ${slug} ${version} ${stars} ${downloads}`;
}

// ============================================================================
// Command Registration
// ============================================================================

export function registerClawhubCommand(program: Command): void {
  const clawhub = program
    .command('clawhub')
    .description('Manage skills from ClawHub registry');

  // ============================================================================
  // clawhub search
  // ============================================================================
  clawhub
    .command('search [query]')
    .description('Search for skills in ClawHub')
    .option('-l, --limit <limit>', 'Maximum results to show', '20')
    .option('--sort <sort>', 'Sort by: relevance, downloads, stars, recent', 'relevance')
    .option('--tag <tag>', 'Filter by tag (can be used multiple times)', [])
    .option('--author <author>', 'Filter by author')
    .action(async (query: string = '', options) => {
      try {
        logger.info(chalk.blue('🔍 Searching ClawHub...\n'));

        const client = getGlobalClawHubClient();

        const searchParams: SkillSearchParams = {
          query: query || '',
          limit: parseInt(options.limit, 10),
          sort: options.sort as SkillSearchParams['sort'],
          tags: options.tag?.length ? options.tag : undefined,
          author: options.author,
        };

        const startTime = Date.now();
        const result = await client.search(searchParams);
        const totalTime = Date.now() - startTime;

        if (result.skills.length === 0) {
          logger.info(chalk.yellow('No skills found matching your query.'));
          logger.info(chalk.gray('\nTips:'));
          logger.info(chalk.gray('  - Try a broader search term'));
          logger.info(chalk.gray('  - Check for typos'));
          logger.info(chalk.gray('  - Browse all skills at https://clawhub.ai'));
          return;
        }

        // Get list of installed skills for comparison
        const installed = await client.listInstalled();
        const installedMap = new Map(installed.map(s => [s.slug, s.version]));

        logger.info(chalk.bold(`Found ${result.total} skills${result.fromCache ? ' (cached)' : ''}:\n`));

        for (const skill of result.skills) {
          const isInstalled = installedMap.has(skill.slug);
          const installedVersion = installedMap.get(skill.slug);
          const line = formatSkillLine(skill, isInstalled, installedVersion);
          logger.info(line);
          logger.info(chalk.gray(`   ${truncate(skill.description, 70)}`));
          logger.info('');
        }

        logger.info(chalk.gray(`Query time: ${result.queryTimeMs || totalTime}ms | Showing ${result.skills.length}/${result.total} results`));
        
        if (result.total > result.skills.length) {
          logger.info(chalk.gray(`Use --limit ${Math.min(result.total, result.skills.length + 20)} to see more results`));
        }
      } catch (error) {
        console.error(chalk.red('❌ Search failed'));
        console.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // ============================================================================
  // clawhub install
  // ============================================================================
  clawhub
    .command('install <skill>')
    .description('Install a skill from ClawHub')
    .option('-v, --version <version>', 'Specific version to install')
    .option('-f, --force', 'Force reinstall if already installed', false)
    .option('--no-deps', 'Skip installing dependencies')
    .option('--target-dir <dir>', 'Custom installation directory')
    .action(async (skillSlug: string, options) => {
      try {
        logger.info(chalk.blue(`📦 Installing ${skillSlug}...\n`));

        const client = getGlobalClawHubClient();
        const installer = getGlobalSkillInstaller(client);

        // Check if already installed
        const existing = await client.isInstalled(skillSlug);
        if (existing.installed && !options.force) {
          logger.info(chalk.yellow(`⚠️  ${skillSlug}@${existing.version} is already installed.`));
          logger.info(chalk.gray('   Use --force to reinstall.'));
          return;
        }

        // Validate skill exists before installing
        logger.info(chalk.gray('Fetching skill metadata...'));
        const metadata = await client.fetchSkill(skillSlug);
        logger.info(chalk.green(`✓ Found ${metadata.name || skillSlug} v${metadata.version}`));
        logger.info(chalk.gray(`  ${metadata.description}`));
        logger.info('');

        // Install the skill
        const startTime = Date.now();
        const result = await client.install(skillSlug, {
          version: options.version,
          force: options.force,
          targetDir: options.targetDir,
          installDependencies: !options.noDeps,
        });

        const duration = Date.now() - startTime;

        if (result.success) {
          logger.info(chalk.green(`\n✓ Successfully installed ${skillSlug}@${result.version}`));
          logger.info(chalk.gray(`  Path: ${result.installPath}`));
          logger.info(chalk.gray(`  Time: ${duration}ms`));

          if (result.installedDependencies?.length) {
            logger.info(chalk.gray(`  Dependencies: ${result.installedDependencies.length} installed`));
            for (const dep of result.installedDependencies) {
              logger.info(chalk.gray(`    - ${dep}`));
            }
          }

          if (result.warnings?.length) {
            logger.info(chalk.yellow('\nWarnings:'));
            for (const warning of result.warnings) {
              logger.info(chalk.yellow(`  ⚠️  ${warning}`));
            }
          }

          // Try to activate the skill
          logger.info(chalk.gray('\nActivating skill...'));
          const activation = await installer.activate(skillSlug);
          
          if (activation.success) {
            logger.info(chalk.green(`✓ Skill activated and ready to use`));
            if (activation.tools?.length) {
              logger.info(chalk.gray(`  Provides tools: ${activation.tools.join(', ')}`));
            }
          } else {
            logger.info(chalk.yellow(`⚠️  Skill installed but activation failed:`));
            logger.info(chalk.yellow(`   ${activation.error}`));
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
        console.error(chalk.red('❌ Installation failed'));
        console.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
        
        if (error instanceof Error && error.message.includes('not found')) {
          console.error(chalk.gray('\n💡 The skill may not exist. Try searching first:'));
          console.error(chalk.gray(`   dash clawhub search ${skillSlug}`));
        }
        
        process.exit(1);
      }
    });

  // ============================================================================
  // clawhub list
  // ============================================================================
  clawhub
    .command('list')
    .description('List installed skills')
    .option('-a, --all', 'Show all skills including inactive', false)
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getGlobalClawHubClient();
        const installer = getGlobalSkillInstaller(client);

        const installed = await client.listInstalled();

        if (installed.length === 0) {
          logger.info(chalk.yellow('No skills installed.'));
          logger.info(chalk.gray('\nInstall skills with:'));
          logger.info(chalk.gray('  dash clawhub install <skill>'));
          logger.info(chalk.gray('\nSearch for skills with:'));
          logger.info(chalk.gray('  dash clawhub search <query>'));
          return;
        }

        if (options.json) {
          logger.info(JSON.stringify(installed, null, 2));
          return;
        }

        // Get activation states
        const skillsWithState = installed.map(skill => ({
          ...skill,
          state: installer.getActivationState(skill.slug),
        }));

        // Filter inactive if not showing all
        const displaySkills = options.all 
          ? skillsWithState 
          : skillsWithState.filter(s => s.state === 'active' || s.state === 'inactive');

        logger.info(chalk.bold(`Installed Skills (${displaySkills.length}):\n`));

        // Group by state
        const active = displaySkills.filter(s => s.state === 'active');
        const inactive = displaySkills.filter(s => s.state === 'inactive');
        const other = displaySkills.filter(s => !['active', 'inactive'].includes(s.state));

        if (active.length > 0) {
          logger.info(chalk.green('Active:'));
          for (const skill of active) {
            logger.info(`  ✓ ${chalk.cyan(skill.name || skill.slug)} ${chalk.gray('@' + skill.version)}`);
            logger.info(chalk.gray(`    ${truncate(skill.description, 60)}`));
          }
          logger.info('');
        }

        if (inactive.length > 0) {
          logger.info(chalk.gray(options.all ? 'Inactive:' : 'Inactive (use --all to show):'));
          if (options.all) {
            for (const skill of inactive) {
              logger.info(`  ○ ${chalk.cyan(skill.name || skill.slug)} ${chalk.gray('@' + skill.version)}`);
            }
          } else {
            logger.info(chalk.gray(`  ... and ${inactive.length} inactive skills`));
          }
          logger.info('');
        }

        if (other.length > 0 && options.all) {
          logger.info(chalk.yellow('Other states:'));
          for (const skill of other) {
            const stateIcon = skill.state === 'error' ? '✗' : '◌';
            logger.info(`  ${stateIcon} ${chalk.cyan(skill.name || skill.slug)} ${chalk.gray(`[${skill.state}]`)}`);
          }
        }

        logger.info(chalk.gray(`\nRegistry: ${client.getConfig().registryUrl}`));
        logger.info(chalk.gray(`Skills directory: ${client.getSkillsDirectory()}`));
      } catch (error) {
        console.error(chalk.red('❌ Failed to list skills'));
        console.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // ============================================================================
  // clawhub uninstall
  // ============================================================================
  clawhub
    .command('uninstall <skill>')
    .description('Uninstall a skill')
    .option('-y, --yes', 'Skip confirmation', false)
    .action(async (skillSlug: string, options) => {
      try {
        const client = getGlobalClawHubClient();
        const installer = getGlobalSkillInstaller(client);

        // Check if installed
        const existing = await client.isInstalled(skillSlug);
        if (!existing.installed) {
          logger.info(chalk.yellow(`⚠️  ${skillSlug} is not installed.`));
          return;
        }

        // Confirm unless --yes
        if (!options.yes) {
          logger.info(chalk.yellow(`\n⚠️  This will remove ${skillSlug}@${existing.version}`));
          logger.info(chalk.gray('Use --yes to skip this confirmation\n'));
          // In a real implementation, we'd use inquirer or similar
          // For now, just require --yes flag
          logger.info(chalk.gray('Re-run with --yes to confirm:'));
          logger.info(chalk.gray(`  dash clawhub uninstall ${skillSlug} --yes`));
          return;
        }

        logger.info(chalk.blue(`\n🗑️  Uninstalling ${skillSlug}...`));

        // Deactivate first
        if (installer.isActive(skillSlug)) {
          logger.info(chalk.gray('Deactivating skill...'));
          await installer.deactivate(skillSlug);
        }

        // Uninstall
        await client.uninstall(skillSlug);

        logger.info(chalk.green(`✓ ${skillSlug} has been uninstalled`));
      } catch (error) {
        console.error(chalk.red('❌ Uninstall failed'));
        console.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });

  // ============================================================================
  // clawhub info
  // ============================================================================
  clawhub
    .command('info <skill>')
    .description('Show detailed information about a skill')
    .option('--readme', 'Show full README content')
    .action(async (skillSlug: string, options) => {
      try {
        const client = getGlobalClawHubClient();
        const installer = getGlobalSkillInstaller(client);

        logger.info(chalk.blue(`🔍 Fetching information for ${skillSlug}...\n`));

        // Check if installed locally first
        const installed = await client.isInstalled(skillSlug);
        let localSkill: InstalledSkill | undefined;

        if (installed.installed) {
          const installedSkills = await client.listInstalled();
          localSkill = installedSkills.find(s => s.slug === skillSlug);
        }

        // Fetch from registry
        const metadata = await client.fetchSkill(skillSlug);

        // Display info
        logger.info(chalk.bold.cyan(metadata.name || metadata.slug));
        logger.info(chalk.gray(metadata.slug));
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
        if (installed.installed && localSkill) {
          logger.info(chalk.green(`  ✓ Installed (v${localSkill.version})`));
          logger.info(`  Path: ${localSkill.installPath}`);
          logger.info(`  State: ${installer.getActivationState(skillSlug)}`);
          
          if (localSkill.parsedSkill?.dependencies?.length) {
            logger.info(`  Dependencies: ${localSkill.parsedSkill.dependencies.length}`);
          }
        } else {
          logger.info(chalk.gray('  Not installed'));
          logger.info(chalk.gray(`  Install: dash clawhub install ${skillSlug}`));
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
        if (error instanceof Error && error.message.includes('not found')) {
          console.error(chalk.red(`❌ Skill not found: ${skillSlug}`));
          console.error(chalk.gray('\nTry searching for it:'));
          console.error(chalk.gray(`  dash clawhub search ${skillSlug}`));
        } else {
          console.error(chalk.red('❌ Failed to fetch skill info'));
          console.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
        }
        process.exit(1);
      }
    });

  // ============================================================================
  // clawhub update
  // ============================================================================
  clawhub
    .command('update [skill]')
    .description('Update installed skills')
    .option('--all', 'Update all skills', false)
    .action(async (skillSlug: string | undefined, options) => {
      try {
        const client = getGlobalClawHubClient();

        if (!skillSlug && !options.all) {
          logger.info(chalk.yellow('Please specify a skill or use --all to update all skills'));
          logger.info(chalk.gray('  dash clawhub update <skill>'));
          logger.info(chalk.gray('  dash clawhub update --all'));
          return;
        }

        if (options.all) {
          logger.info(chalk.blue('🔄 Checking for updates...\n'));
          
          const installed = await client.listInstalled();
          let updateCount = 0;

          for (const skill of installed) {
            try {
              const metadata = await client.fetchSkill(skill.slug);
              
              if (metadata.version !== skill.version) {
                logger.info(chalk.yellow(`${skill.name || skill.slug}: ${skill.version} → ${metadata.version}`));
                
                await client.install(skill.slug, { force: true });
                logger.info(chalk.green(`  ✓ Updated to ${metadata.version}`));
                updateCount++;
              }
            } catch (error) {
              logger.info(chalk.red(`  ✗ Failed to check ${skill.slug}: ${error instanceof Error ? error.message : String(error)}`));
            }
          }

          if (updateCount === 0) {
            logger.info(chalk.green('All skills are up to date!'));
          } else {
            logger.info(chalk.green(`\nUpdated ${updateCount} skill(s)`));
          }
        } else if (skillSlug) {
          logger.info(chalk.blue(`🔄 Checking ${skillSlug} for updates...\n`));
          
          const installed = await client.isInstalled(skillSlug);
          if (!installed.installed) {
            logger.info(chalk.yellow(`${skillSlug} is not installed`));
            return;
          }

          const metadata = await client.fetchSkill(skillSlug);
          
          if (metadata.version === installed.version) {
            logger.info(chalk.green(`${skillSlug} is already at the latest version (${installed.version})`));
          } else {
            logger.info(chalk.yellow(`${skillSlug}: ${installed.version} → ${metadata.version}`));
            await client.install(skillSlug, { force: true });
            logger.info(chalk.green(`✓ Updated to ${metadata.version}`));
          }
        }
      } catch (error) {
        console.error(chalk.red('❌ Update failed'));
        console.error(chalk.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
        process.exit(1);
      }
    });
}

export default registerClawhubCommand;
