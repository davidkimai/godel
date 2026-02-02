"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerClawhubCommand = registerClawhubCommand;
const ClawHubClient_1 = require("../../integrations/openclaw/ClawHubClient");
const SkillInstaller_1 = require("../../integrations/openclaw/SkillInstaller");
const chalk_1 = __importDefault(require("chalk"));
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
    if (text.length <= maxLength)
        return text;
    return text.substring(0, maxLength - 3) + '...';
}
function formatVersion(version, isLatest) {
    if (isLatest) {
        return chalk_1.default.green(`${version} (latest)`);
    }
    return chalk_1.default.gray(version);
}
function formatSkillLine(skill, isInstalled = false, installedVersion) {
    const name = chalk_1.default.cyan.bold(skill.name || skill.slug);
    const slug = chalk_1.default.gray(skill.slug);
    const stars = formatStars(skill.stars);
    const downloads = formatDownloads(skill.downloads);
    const version = isInstalled
        ? chalk_1.default.yellow(`[${installedVersion}]`)
        : '';
    return `${isInstalled ? chalk_1.default.green('✓') : ' '} ${name} ${slug} ${version} ${stars} ${downloads}`;
}
// ============================================================================
// Command Registration
// ============================================================================
function registerClawhubCommand(program) {
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
        .action(async (query = '', options) => {
        try {
            console.log(chalk_1.default.blue('🔍 Searching ClawHub...\n'));
            const client = (0, ClawHubClient_1.getGlobalClawHubClient)();
            const searchParams = {
                query: query || '',
                limit: parseInt(options.limit, 10),
                sort: options.sort,
                tags: options.tag?.length ? options.tag : undefined,
                author: options.author,
            };
            const startTime = Date.now();
            const result = await client.search(searchParams);
            const totalTime = Date.now() - startTime;
            if (result.skills.length === 0) {
                console.log(chalk_1.default.yellow('No skills found matching your query.'));
                console.log(chalk_1.default.gray('\nTips:'));
                console.log(chalk_1.default.gray('  - Try a broader search term'));
                console.log(chalk_1.default.gray('  - Check for typos'));
                console.log(chalk_1.default.gray('  - Browse all skills at https://clawhub.ai'));
                return;
            }
            // Get list of installed skills for comparison
            const installed = await client.listInstalled();
            const installedMap = new Map(installed.map(s => [s.slug, s.version]));
            console.log(chalk_1.default.bold(`Found ${result.total} skills${result.fromCache ? ' (cached)' : ''}:\n`));
            for (const skill of result.skills) {
                const isInstalled = installedMap.has(skill.slug);
                const installedVersion = installedMap.get(skill.slug);
                const line = formatSkillLine(skill, isInstalled, installedVersion);
                console.log(line);
                console.log(chalk_1.default.gray(`   ${truncate(skill.description, 70)}`));
                console.log();
            }
            console.log(chalk_1.default.gray(`Query time: ${result.queryTimeMs || totalTime}ms | Showing ${result.skills.length}/${result.total} results`));
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
    // clawhub install
    // ============================================================================
    clawhub
        .command('install <skill>')
        .description('Install a skill from ClawHub')
        .option('-v, --version <version>', 'Specific version to install')
        .option('-f, --force', 'Force reinstall if already installed', false)
        .option('--no-deps', 'Skip installing dependencies')
        .option('--target-dir <dir>', 'Custom installation directory')
        .action(async (skillSlug, options) => {
        try {
            console.log(chalk_1.default.blue(`📦 Installing ${skillSlug}...\n`));
            const client = (0, ClawHubClient_1.getGlobalClawHubClient)();
            const installer = (0, SkillInstaller_1.getGlobalSkillInstaller)(client);
            // Check if already installed
            const existing = await client.isInstalled(skillSlug);
            if (existing.installed && !options.force) {
                console.log(chalk_1.default.yellow(`⚠️  ${skillSlug}@${existing.version} is already installed.`));
                console.log(chalk_1.default.gray('   Use --force to reinstall.'));
                return;
            }
            // Validate skill exists before installing
            console.log(chalk_1.default.gray('Fetching skill metadata...'));
            const metadata = await client.fetchSkill(skillSlug);
            console.log(chalk_1.default.green(`✓ Found ${metadata.name || skillSlug} v${metadata.version}`));
            console.log(chalk_1.default.gray(`  ${metadata.description}`));
            console.log();
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
                console.log(chalk_1.default.green(`\n✓ Successfully installed ${skillSlug}@${result.version}`));
                console.log(chalk_1.default.gray(`  Path: ${result.installPath}`));
                console.log(chalk_1.default.gray(`  Time: ${duration}ms`));
                if (result.installedDependencies?.length) {
                    console.log(chalk_1.default.gray(`  Dependencies: ${result.installedDependencies.length} installed`));
                    for (const dep of result.installedDependencies) {
                        console.log(chalk_1.default.gray(`    - ${dep}`));
                    }
                }
                if (result.warnings?.length) {
                    console.log(chalk_1.default.yellow('\nWarnings:'));
                    for (const warning of result.warnings) {
                        console.log(chalk_1.default.yellow(`  ⚠️  ${warning}`));
                    }
                }
                // Try to activate the skill
                console.log(chalk_1.default.gray('\nActivating skill...'));
                const activation = await installer.activate(skillSlug);
                if (activation.success) {
                    console.log(chalk_1.default.green(`✓ Skill activated and ready to use`));
                    if (activation.tools?.length) {
                        console.log(chalk_1.default.gray(`  Provides tools: ${activation.tools.join(', ')}`));
                    }
                }
                else {
                    console.log(chalk_1.default.yellow(`⚠️  Skill installed but activation failed:`));
                    console.log(chalk_1.default.yellow(`   ${activation.error}`));
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
            console.error(chalk_1.default.red('❌ Installation failed'));
            console.error(chalk_1.default.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
            if (error instanceof Error && error.message.includes('not found')) {
                console.error(chalk_1.default.gray('\n💡 The skill may not exist. Try searching first:'));
                console.error(chalk_1.default.gray(`   dash clawhub search ${skillSlug}`));
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
            const client = (0, ClawHubClient_1.getGlobalClawHubClient)();
            const installer = (0, SkillInstaller_1.getGlobalSkillInstaller)(client);
            const installed = await client.listInstalled();
            if (installed.length === 0) {
                console.log(chalk_1.default.yellow('No skills installed.'));
                console.log(chalk_1.default.gray('\nInstall skills with:'));
                console.log(chalk_1.default.gray('  dash clawhub install <skill>'));
                console.log(chalk_1.default.gray('\nSearch for skills with:'));
                console.log(chalk_1.default.gray('  dash clawhub search <query>'));
                return;
            }
            if (options.json) {
                console.log(JSON.stringify(installed, null, 2));
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
            console.log(chalk_1.default.bold(`Installed Skills (${displaySkills.length}):\n`));
            // Group by state
            const active = displaySkills.filter(s => s.state === 'active');
            const inactive = displaySkills.filter(s => s.state === 'inactive');
            const other = displaySkills.filter(s => !['active', 'inactive'].includes(s.state));
            if (active.length > 0) {
                console.log(chalk_1.default.green('Active:'));
                for (const skill of active) {
                    console.log(`  ✓ ${chalk_1.default.cyan(skill.name || skill.slug)} ${chalk_1.default.gray('@' + skill.version)}`);
                    console.log(chalk_1.default.gray(`    ${truncate(skill.description, 60)}`));
                }
                console.log();
            }
            if (inactive.length > 0) {
                console.log(chalk_1.default.gray(options.all ? 'Inactive:' : 'Inactive (use --all to show):'));
                if (options.all) {
                    for (const skill of inactive) {
                        console.log(`  ○ ${chalk_1.default.cyan(skill.name || skill.slug)} ${chalk_1.default.gray('@' + skill.version)}`);
                    }
                }
                else {
                    console.log(chalk_1.default.gray(`  ... and ${inactive.length} inactive skills`));
                }
                console.log();
            }
            if (other.length > 0 && options.all) {
                console.log(chalk_1.default.yellow('Other states:'));
                for (const skill of other) {
                    const stateIcon = skill.state === 'error' ? '✗' : '◌';
                    console.log(`  ${stateIcon} ${chalk_1.default.cyan(skill.name || skill.slug)} ${chalk_1.default.gray(`[${skill.state}]`)}`);
                }
            }
            console.log(chalk_1.default.gray(`\nRegistry: ${client.getConfig().registryUrl}`));
            console.log(chalk_1.default.gray(`Skills directory: ${client.getSkillsDirectory()}`));
        }
        catch (error) {
            console.error(chalk_1.default.red('❌ Failed to list skills'));
            console.error(chalk_1.default.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
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
        .action(async (skillSlug, options) => {
        try {
            const client = (0, ClawHubClient_1.getGlobalClawHubClient)();
            const installer = (0, SkillInstaller_1.getGlobalSkillInstaller)(client);
            // Check if installed
            const existing = await client.isInstalled(skillSlug);
            if (!existing.installed) {
                console.log(chalk_1.default.yellow(`⚠️  ${skillSlug} is not installed.`));
                return;
            }
            // Confirm unless --yes
            if (!options.yes) {
                console.log(chalk_1.default.yellow(`\n⚠️  This will remove ${skillSlug}@${existing.version}`));
                console.log(chalk_1.default.gray('Use --yes to skip this confirmation\n'));
                // In a real implementation, we'd use inquirer or similar
                // For now, just require --yes flag
                console.log(chalk_1.default.gray('Re-run with --yes to confirm:'));
                console.log(chalk_1.default.gray(`  dash clawhub uninstall ${skillSlug} --yes`));
                return;
            }
            console.log(chalk_1.default.blue(`\n🗑️  Uninstalling ${skillSlug}...`));
            // Deactivate first
            if (installer.isActive(skillSlug)) {
                console.log(chalk_1.default.gray('Deactivating skill...'));
                await installer.deactivate(skillSlug);
            }
            // Uninstall
            await client.uninstall(skillSlug);
            console.log(chalk_1.default.green(`✓ ${skillSlug} has been uninstalled`));
        }
        catch (error) {
            console.error(chalk_1.default.red('❌ Uninstall failed'));
            console.error(chalk_1.default.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
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
        .action(async (skillSlug, options) => {
        try {
            const client = (0, ClawHubClient_1.getGlobalClawHubClient)();
            const installer = (0, SkillInstaller_1.getGlobalSkillInstaller)(client);
            console.log(chalk_1.default.blue(`🔍 Fetching information for ${skillSlug}...\n`));
            // Check if installed locally first
            const installed = await client.isInstalled(skillSlug);
            let localSkill;
            if (installed.installed) {
                const installedSkills = await client.listInstalled();
                localSkill = installedSkills.find(s => s.slug === skillSlug);
            }
            // Fetch from registry
            const metadata = await client.fetchSkill(skillSlug);
            // Display info
            console.log(chalk_1.default.bold.cyan(metadata.name || metadata.slug));
            console.log(chalk_1.default.gray(metadata.slug));
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
            if (installed.installed && localSkill) {
                console.log(chalk_1.default.green(`  ✓ Installed (v${localSkill.version})`));
                console.log(`  Path: ${localSkill.installPath}`);
                console.log(`  State: ${installer.getActivationState(skillSlug)}`);
                if (localSkill.parsedSkill?.dependencies?.length) {
                    console.log(`  Dependencies: ${localSkill.parsedSkill.dependencies.length}`);
                }
            }
            else {
                console.log(chalk_1.default.gray('  Not installed'));
                console.log(chalk_1.default.gray(`  Install: dash clawhub install ${skillSlug}`));
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
            if (error instanceof Error && error.message.includes('not found')) {
                console.error(chalk_1.default.red(`❌ Skill not found: ${skillSlug}`));
                console.error(chalk_1.default.gray('\nTry searching for it:'));
                console.error(chalk_1.default.gray(`  dash clawhub search ${skillSlug}`));
            }
            else {
                console.error(chalk_1.default.red('❌ Failed to fetch skill info'));
                console.error(chalk_1.default.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
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
        .action(async (skillSlug, options) => {
        try {
            const client = (0, ClawHubClient_1.getGlobalClawHubClient)();
            if (!skillSlug && !options.all) {
                console.log(chalk_1.default.yellow('Please specify a skill or use --all to update all skills'));
                console.log(chalk_1.default.gray('  dash clawhub update <skill>'));
                console.log(chalk_1.default.gray('  dash clawhub update --all'));
                return;
            }
            if (options.all) {
                console.log(chalk_1.default.blue('🔄 Checking for updates...\n'));
                const installed = await client.listInstalled();
                let updateCount = 0;
                for (const skill of installed) {
                    try {
                        const metadata = await client.fetchSkill(skill.slug);
                        if (metadata.version !== skill.version) {
                            console.log(chalk_1.default.yellow(`${skill.name || skill.slug}: ${skill.version} → ${metadata.version}`));
                            await client.install(skill.slug, { force: true });
                            console.log(chalk_1.default.green(`  ✓ Updated to ${metadata.version}`));
                            updateCount++;
                        }
                    }
                    catch (error) {
                        console.log(chalk_1.default.red(`  ✗ Failed to check ${skill.slug}: ${error instanceof Error ? error.message : String(error)}`));
                    }
                }
                if (updateCount === 0) {
                    console.log(chalk_1.default.green('All skills are up to date!'));
                }
                else {
                    console.log(chalk_1.default.green(`\nUpdated ${updateCount} skill(s)`));
                }
            }
            else if (skillSlug) {
                console.log(chalk_1.default.blue(`🔄 Checking ${skillSlug} for updates...\n`));
                const installed = await client.isInstalled(skillSlug);
                if (!installed.installed) {
                    console.log(chalk_1.default.yellow(`${skillSlug} is not installed`));
                    return;
                }
                const metadata = await client.fetchSkill(skillSlug);
                if (metadata.version === installed.version) {
                    console.log(chalk_1.default.green(`${skillSlug} is already at the latest version (${installed.version})`));
                }
                else {
                    console.log(chalk_1.default.yellow(`${skillSlug}: ${installed.version} → ${metadata.version}`));
                    await client.install(skillSlug, { force: true });
                    console.log(chalk_1.default.green(`✓ Updated to ${metadata.version}`));
                }
            }
        }
        catch (error) {
            console.error(chalk_1.default.red('❌ Update failed'));
            console.error(chalk_1.default.red(`   Error: ${error instanceof Error ? error.message : String(error)}`));
            process.exit(1);
        }
    });
}
exports.default = registerClawhubCommand;
//# sourceMappingURL=clawhub.js.map