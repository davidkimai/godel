"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSkillsCommand = registerSkillsCommand;
const chalk_1 = __importDefault(require("chalk"));
const registry_1 = require("../../skills/registry");
const types_1 = require("../../skills/types");
// ============================================================================
// Helper Functions
// ============================================================================
function formatStars(stars) {
    if (stars >= 1000) {
        return `${(stars / 1000).toFixed(1)}k ⭐`;
    }
    return `${stars} ⭐`;
}
function formatDownloads(downloads) {
    if (downloads >= 1000) {
        return `${(downloads / 1000).toFixed(1)}k ↓`;
    }
    return `${downloads} ↓`;
}
function truncate(text, maxLength) {
    if (!text || text.length <= maxLength)
        return text || '';
    return text.substring(0, maxLength - 3) + '...';
}
function formatSourceBadge(source) {
    switch (source) {
        case 'clawhub':
            return chalk_1.default.hex('#FF6B6B')('[ClawHub]');
        case 'vercel':
            return chalk_1.default.hex('#00D8FF')('[Vercel]');
        default:
            return chalk_1.default.gray(`[${source}]`);
    }
}
function formatSkillLine(skill, isInstalled = false, installedVersion) {
    const name = chalk_1.default.cyan.bold(skill.name || skill.slug);
    const slug = chalk_1.default.gray(skill.slug);
    const source = formatSourceBadge(skill.source);
    const version = isInstalled
        ? chalk_1.default.yellow(`[${installedVersion}]`)
        : '';
    return `${isInstalled ? chalk_1.default.green('✓') : ' '} ${source} ${name} ${slug} ${version}`;
}
function formatActivationState(state) {
    switch (state) {
        case 'active':
            return chalk_1.default.green('● active');
        case 'inactive':
            return chalk_1.default.gray('○ inactive');
        case 'activating':
            return chalk_1.default.yellow('◐ activating...');
        case 'deactivating':
            return chalk_1.default.yellow('◑ deactivating...');
        case 'error':
            return chalk_1.default.red('✗ error');
        default:
            return chalk_1.default.gray(`? ${state}`);
    }
}
// ============================================================================
// Command Registration
// ============================================================================
function registerSkillsCommand(program) {
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
            const registry = (0, registry_1.getGlobalSkillRegistry)();
            const installed = await registry.listInstalled();
            // Filter by source if specified
            let displaySkills = installed;
            if (options.source) {
                displaySkills = installed.filter(s => s.source === options.source);
            }
            // Filter inactive if not showing all
            if (!options.all) {
                displaySkills = displaySkills.filter(s => s.activationState === 'active' || s.activationState === 'inactive');
            }
            if (displaySkills.length === 0) {
                console.log(chalk_1.default.yellow('No skills installed.'));
                console.log(chalk_1.default.gray('\nInstall skills with:'));
                console.log(chalk_1.default.gray('  dash skills install <skill>'));
                console.log(chalk_1.default.gray('\nSearch for skills with:'));
                console.log(chalk_1.default.gray('  dash skills search <query>'));
                console.log(chalk_1.default.gray('\nAvailable sources:'));
                const sources = registry.getSources();
                for (const source of sources) {
                    console.log(chalk_1.default.gray(`  - ${source.name}: ${source.url}`));
                }
                return;
            }
            if (options.json) {
                console.log(JSON.stringify(displaySkills, null, 2));
                return;
            }
            console.log(chalk_1.default.bold(`Installed Skills (${displaySkills.length}):\n`));
            // Group by source
            const bySource = {
                clawhub: displaySkills.filter(s => s.source === 'clawhub'),
                vercel: displaySkills.filter(s => s.source === 'vercel'),
            };
            for (const [source, sourceSkills] of Object.entries(bySource)) {
                if (sourceSkills.length === 0)
                    continue;
                console.log(formatSourceBadge(source));
                console.log();
                // Group by state
                const active = sourceSkills.filter(s => s.activationState === 'active');
                const inactive = sourceSkills.filter(s => s.activationState === 'inactive');
                if (active.length > 0) {
                    for (const skill of active) {
                        console.log(`  ${chalk_1.default.green('✓')} ${chalk_1.default.cyan(skill.name || skill.slug)} ${chalk_1.default.gray('@' + skill.version)} ${formatActivationState(skill.activationState)}`);
                        console.log(chalk_1.default.gray(`    ${truncate(skill.description, 60)}`));
                    }
                }
                if (inactive.length > 0) {
                    for (const skill of inactive) {
                        console.log(`  ${chalk_1.default.gray('○')} ${chalk_1.default.cyan(skill.name || skill.slug)} ${chalk_1.default.gray('@' + skill.version)} ${formatActivationState(skill.activationState)}`);
                    }
                }
                console.log();
            }
            console.log(chalk_1.default.gray(`Skills directory: ${registry.getSkillsDirectory()}`));
        }
        catch (error) {
            console.error(chalk_1.default.red('❌ Failed to list skills'));
            console.error(chalk_1.default.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
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
        .action(async (query, options) => {
        try {
            console.log(chalk_1.default.blue('🔍 Searching across skill sources...\n'));
            const registry = (0, registry_1.getGlobalSkillRegistry)();
            const searchParams = {
                query: query || '',
                limit: parseInt(options.limit, 10),
                sort: options.sort,
                sources: options.source ? [options.source] : undefined,
            };
            const startTime = Date.now();
            const result = await registry.search(searchParams);
            const totalTime = Date.now() - startTime;
            if (result.skills.length === 0) {
                console.log(chalk_1.default.yellow('No skills found matching your query.'));
                console.log(chalk_1.default.gray('\nTips:'));
                console.log(chalk_1.default.gray('  - Try a broader search term'));
                console.log(chalk_1.default.gray('  - Check for typos'));
                console.log(chalk_1.default.gray('  - Browse available sources:'));
                console.log(chalk_1.default.gray('    - https://clawhub.ai (ClawHub)'));
                console.log(chalk_1.default.gray('    - https://skills.sh (Vercel)'));
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
            console.log(chalk_1.default.bold(`Results from ${Object.values(result.bySource).filter(s => s.total > 0).length} source(s):`));
            for (const [source, data] of Object.entries(result.bySource)) {
                if (data.total > 0) {
                    console.log(`  ${formatSourceBadge(source)}: ${data.total} skills`);
                }
            }
            console.log();
            // Show results
            console.log(chalk_1.default.bold(`Found ${result.total} skills (showing ${result.skills.length}):\n`));
            for (const skill of result.skills) {
                const isInstalled = installedMap.has(skill.id);
                const installedVersion = installedMap.get(skill.id);
                const line = formatSkillLine(skill, isInstalled, installedVersion);
                console.log(line);
                console.log(chalk_1.default.gray(`   ${formatStars(skill.stars)} ${formatDownloads(skill.downloads)}`));
                console.log(chalk_1.default.gray(`   ${truncate(skill.description, 70)}`));
                console.log();
            }
            console.log(chalk_1.default.gray(`Query time: ${totalTime}ms | Sources: ${Object.keys(result.bySource).join(', ')}`));
            if (result.total > result.skills.length) {
                console.log(chalk_1.default.gray(`Use --limit ${Math.min(result.total, result.skills.length + 20)} to see more results`));
            }
        }
        catch (error) {
            console.error(chalk_1.default.red('❌ Search failed'));
            console.error(chalk_1.default.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
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
        .action(async (skillId, options) => {
        try {
            // Add source prefix if specified
            const fullSkillId = options.source
                ? `${options.source}:${skillId}`
                : skillId;
            console.log(chalk_1.default.blue(`📦 Installing ${fullSkillId}...\n`));
            const registry = (0, registry_1.getGlobalSkillRegistry)();
            // Check if already installed
            const existing = await registry.isInstalled(fullSkillId);
            if (existing.installed && !options.force) {
                console.log(chalk_1.default.yellow(`⚠️  ${skillId}@${existing.version} is already installed from ${existing.source}.`));
                console.log(chalk_1.default.gray('   Use --force to reinstall.'));
                return;
            }
            // Fetch skill metadata first
            console.log(chalk_1.default.gray('Fetching skill metadata...'));
            const metadata = await registry.fetchSkill(fullSkillId);
            console.log(chalk_1.default.green(`✓ Found ${metadata.name || skillId} v${metadata.version} from ${formatSourceBadge(metadata.source)}`));
            console.log(chalk_1.default.gray(`  ${metadata.description}`));
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
                console.log(chalk_1.default.green(`\n✓ Successfully installed ${skillId}@${result.version}`));
                console.log(chalk_1.default.gray(`  Source: ${formatSourceBadge(result.source)}`));
                console.log(chalk_1.default.gray(`  Path: ${result.installPath}`));
                console.log(chalk_1.default.gray(`  Time: ${duration}ms`));
                if (result.installedDependencies?.length) {
                    console.log(chalk_1.default.gray(`  Dependencies: ${result.installedDependencies.length} installed`));
                }
                if (result.warnings?.length) {
                    console.log(chalk_1.default.yellow('\nWarnings:'));
                    for (const warning of result.warnings) {
                        console.log(chalk_1.default.yellow(`  ⚠️  ${warning}`));
                    }
                }
            }
            else {
                console.error(chalk_1.default.red('\n❌ Installation failed'));
                if (result.errors?.length) {
                    for (const error of result.errors) {
                        console.error(chalk_1.default.red(`   ${error}`));
                    }
                }
                process.exit(1);
            }
        }
        catch (error) {
            if (error instanceof types_1.AmbiguousSkillError) {
                console.error(chalk_1.default.yellow('⚠️  Multiple sources have this skill:'));
                console.error(chalk_1.default.gray(`   ${error.sources.map(s => `${s}:${skillId}`).join(', ')}`));
                console.error(chalk_1.default.gray('\n   Specify source with:'));
                console.error(chalk_1.default.gray(`   dash skills install clawhub:${skillId}`));
                console.error(chalk_1.default.gray(`   dash skills install vercel:${skillId}`));
            }
            else if (error instanceof types_1.SkillNotFoundError) {
                console.error(chalk_1.default.red(`❌ Skill not found: ${skillId}`));
                console.error(chalk_1.default.gray('\n   Try searching first:'));
                console.error(chalk_1.default.gray(`   dash skills search ${skillId}`));
            }
            else if (error instanceof types_1.SourceNotAvailableError) {
                console.error(chalk_1.default.red(`❌ Source not available: ${error.source}`));
            }
            else {
                console.error(chalk_1.default.red('❌ Installation failed'));
                console.error(chalk_1.default.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
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
        .action(async (skillId, options) => {
        try {
            const registry = (0, registry_1.getGlobalSkillRegistry)();
            // Check if installed
            const existing = await registry.isInstalled(skillId);
            if (!existing.installed) {
                console.log(chalk_1.default.yellow(`⚠️  ${skillId} is not installed.`));
                return;
            }
            // Confirm unless --yes
            if (!options.yes) {
                console.log(chalk_1.default.yellow(`\n⚠️  This will remove ${skillId}@${existing.version} from ${existing.source}`));
                console.log(chalk_1.default.gray('Use --yes to skip this confirmation\n'));
                console.log(chalk_1.default.gray('Re-run with --yes to confirm:'));
                console.log(chalk_1.default.gray(`  dash skills remove ${skillId} --yes`));
                return;
            }
            console.log(chalk_1.default.blue(`\n🗑️  Removing ${skillId}...`));
            await registry.uninstall(skillId);
            console.log(chalk_1.default.green(`✓ ${skillId} has been removed`));
        }
        catch (error) {
            console.error(chalk_1.default.red('❌ Remove failed'));
            console.error(chalk_1.default.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
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
        .action(async (skillId, options) => {
        try {
            const registry = (0, registry_1.getGlobalSkillRegistry)();
            if (!skillId && !options.all) {
                console.log(chalk_1.default.yellow('Please specify a skill or use --all to update all skills'));
                console.log(chalk_1.default.gray('  dash skills update <skill>'));
                console.log(chalk_1.default.gray('  dash skills update --all'));
                return;
            }
            if (options.all) {
                console.log(chalk_1.default.blue('🔄 Checking for updates...\n'));
                const installed = await registry.listInstalled();
                let updateCount = 0;
                let errorCount = 0;
                for (const skill of installed) {
                    try {
                        console.log(chalk_1.default.gray(`Checking ${skill.name || skill.slug}...`));
                        const metadata = await registry.fetchSkill(skill.id);
                        if (metadata.version !== skill.version) {
                            console.log(chalk_1.default.yellow(`${skill.name || skill.slug}: ${skill.version} → ${metadata.version}`));
                            const result = await registry.update(skill.id);
                            if (result.success) {
                                console.log(chalk_1.default.green(`  ✓ Updated to ${metadata.version}`));
                                updateCount++;
                            }
                            else {
                                console.log(chalk_1.default.red(`  ✗ Update failed`));
                                errorCount++;
                            }
                        }
                    }
                    catch (error) {
                        console.log(chalk_1.default.red(`  ✗ Failed to check ${skill.slug}: ${error instanceof Error ? error.message : String(error)}`));
                        errorCount++;
                    }
                }
                if (updateCount === 0 && errorCount === 0) {
                    console.log(chalk_1.default.green('All skills are up to date!'));
                }
                else {
                    console.log();
                    if (updateCount > 0) {
                        console.log(chalk_1.default.green(`Updated ${updateCount} skill(s)`));
                    }
                    if (errorCount > 0) {
                        console.log(chalk_1.default.red(`Failed to update ${errorCount} skill(s)`));
                    }
                }
            }
            else if (skillId) {
                console.log(chalk_1.default.blue(`🔄 Checking ${skillId} for updates...\n`));
                const existing = await registry.isInstalled(skillId);
                if (!existing.installed) {
                    console.log(chalk_1.default.yellow(`${skillId} is not installed`));
                    return;
                }
                const metadata = await registry.fetchSkill(skillId);
                if (metadata.version === existing.version) {
                    console.log(chalk_1.default.green(`${skillId} is already at the latest version (${existing.version})`));
                }
                else {
                    console.log(chalk_1.default.yellow(`${skillId}: ${existing.version} → ${metadata.version}`));
                    const result = await registry.update(skillId);
                    if (result.success) {
                        console.log(chalk_1.default.green(`✓ Updated to ${metadata.version}`));
                    }
                    else {
                        console.log(chalk_1.default.red(`✗ Update failed`));
                        process.exit(1);
                    }
                }
            }
        }
        catch (error) {
            console.error(chalk_1.default.red('❌ Update failed'));
            console.error(chalk_1.default.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
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
        .action(async (skillId, options) => {
        try {
            const registry = (0, registry_1.getGlobalSkillRegistry)();
            console.log(chalk_1.default.blue(`🔍 Fetching information for ${skillId}...\n`));
            // Fetch metadata
            const metadata = await registry.fetchSkill(skillId);
            // Check installation status
            const installed = await registry.isInstalled(skillId);
            // Display info
            console.log(chalk_1.default.bold.cyan(metadata.name || metadata.slug));
            console.log(chalk_1.default.gray(metadata.slug));
            console.log(formatSourceBadge(metadata.source));
            console.log();
            console.log(chalk_1.default.white(metadata.description));
            console.log();
            console.log(chalk_1.default.bold('Stats:'));
            console.log(`  ${formatStars(metadata.stars)}`);
            console.log(`  ${formatDownloads(metadata.downloads)}`);
            console.log(`  Version: ${metadata.version}`);
            if (metadata.versions && metadata.versions.length > 1) {
                console.log(`  All versions: ${metadata.versions.join(', ')}`);
            }
            console.log();
            console.log(chalk_1.default.bold('Author:'));
            console.log(`  ${metadata.author.username}`);
            console.log();
            if (metadata.tags.length > 0) {
                console.log(chalk_1.default.bold('Tags:'));
                console.log(`  ${metadata.tags.map(t => chalk_1.default.blue(`#${t}`)).join(' ')}`);
                console.log();
            }
            // Installation status
            console.log(chalk_1.default.bold('Installation:'));
            if (installed.installed) {
                console.log(chalk_1.default.green(`  ✓ Installed (v${installed.version})`));
                console.log(`  Source: ${formatSourceBadge(installed.source)}`);
            }
            else {
                console.log(chalk_1.default.gray('  Not installed'));
                console.log(chalk_1.default.gray(`  Install: dash skills install ${skillId}`));
            }
            console.log();
            // Show README if requested
            if (options.readme && metadata.readme) {
                console.log(chalk_1.default.bold('README:'));
                console.log(chalk_1.default.gray('─'.repeat(60)));
                console.log(metadata.readme);
                console.log(chalk_1.default.gray('─'.repeat(60)));
            }
            else if (metadata.readme) {
                console.log(chalk_1.default.gray('Use --readme to view full documentation'));
            }
        }
        catch (error) {
            if (error instanceof types_1.SkillNotFoundError) {
                console.error(chalk_1.default.red(`❌ Skill not found: ${skillId}`));
                console.error(chalk_1.default.gray('\nTry searching for it:'));
                console.error(chalk_1.default.gray(`  dash skills search ${skillId}`));
            }
            else {
                console.error(chalk_1.default.red('❌ Failed to fetch skill info'));
                console.error(chalk_1.default.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
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
            const registry = (0, registry_1.getGlobalSkillRegistry)();
            const sources = registry.getSources();
            console.log(chalk_1.default.bold('Available Skill Sources:\n'));
            for (const source of sources) {
                const status = source.enabled
                    ? chalk_1.default.green('● enabled')
                    : chalk_1.default.gray('○ disabled');
                console.log(`${formatSourceBadge(source.id)} ${status}`);
                console.log(chalk_1.default.gray(`  ${source.description}`));
                console.log(chalk_1.default.gray(`  URL: ${source.url}`));
                console.log();
            }
            console.log(chalk_1.default.gray('Use --source <source> to search or install from a specific source.'));
        }
        catch (error) {
            console.error(chalk_1.default.red('❌ Failed to list sources'));
            console.error(chalk_1.default.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
            process.exit(1);
        }
    });
}
exports.default = registerSkillsCommand;
//# sourceMappingURL=skills.js.map