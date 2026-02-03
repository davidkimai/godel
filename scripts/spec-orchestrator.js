#!/usr/bin/env node

/**
 * Spec Orchestrator - SDD System Controller
 * 
 * Manages specifications for Dash v2.0 autonomous operations.
 * Reads specs, generates prompts, validates outputs, tracks coverage.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPECS_DIR = path.join(__dirname, '..', 'specs');
const ACTIVE_DIR = path.join(SPECS_DIR, 'active');
const TEMPLATES_DIR = path.join(SPECS_DIR, 'templates');

/**
 * Parse YAML file (simple parser for spec format)
 */
function parseYAML(content) {
  const result = {};
  const lines = content.split('\n');
  let currentSection = null;
  let currentArray = null;
  
  for (const line of lines) {
    const indent = line.search(/\S/);
    const trimmed = line.trim();
    
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    // Top-level sections
    if (indent === 0 && trimmed.endsWith(':')) {
      const key = trimmed.slice(0, -1);
      if (key === 'requirements' || key === 'implementation' || key === 'validation' || 
          key === 'prompt_template' || key === 'metadata' || key === 'checks' || 
          key === 'validation_criteria' || key === 'problem' || key === 'target') {
        currentSection = key;
        if (key === 'requirements' || key === 'validation_criteria' || key === 'checks' || key === 'problem') {
          result[key] = [];
          currentArray = key;
        } else {
          result[key] = key === 'prompt_template' ? '' : {};
        }
      } else if (key === 'spec') {
        result[key] = {};
        currentSection = 'spec';
      }
      continue;
    }
    
    // Array items
    if (trimmed.startsWith('- ') && currentArray) {
      const item = trimmed.slice(2);
      if (item.includes(':')) {
        // Object in array
        const obj = {};
        const [k, v] = item.split(':').map(s => s.trim());
        obj[k] = v;
        result[currentArray].push(obj);
      } else {
        result[currentArray].push(item);
      }
      continue;
    }
    
    // Key-value pairs
    if (trimmed.includes(':')) {
      const [key, ...valueParts] = trimmed.split(':');
      const value = valueParts.join(':').trim();
      
      if (currentSection === 'spec' || currentSection === 'target' || currentSection === 'validation' || 
          currentSection === 'metadata' || currentSection === 'implementation') {
        result[currentSection][key] = value || '';
      } else if (currentArray && result[currentArray].length > 0) {
        const lastItem = result[currentArray][result[currentArray].length - 1];
        if (typeof lastItem === 'object') {
          lastItem[key] = value || '';
        }
      } else {
        result[key] = value || '';
      }
    }
    
    // Multi-line values
    if (trimmed.startsWith('|') && currentSection) {
      // Multi-line string starts
    } else if (indent > 0 && currentSection && currentSection !== 'spec' && 
               currentSection !== 'target' && currentSection !== 'validation' &&
               currentSection !== 'metadata' && currentSection !== 'implementation' &&
               result[currentSection] === '') {
      result[currentSection] += (result[currentSection] ? '\n' : '') + line.trim();
    }
  }
  
  return result;
}

/**
 * Load all specs from active directory
 */
function loadAllSpecs() {
  const specs = [];
  
  if (!fs.existsSync(ACTIVE_DIR)) {
    console.log('⚠️  No active specs found');
    return specs;
  }
  
  const files = fs.readdirSync(ACTIVE_DIR).filter(f => f.endsWith('.yaml'));
  
  for (const file of files) {
    const content = fs.readFileSync(path.join(ACTIVE_DIR, file), 'utf-8');
    const spec = parseYAML(content);
    spec._file = file;
    specs.push(spec);
  }
  
  return specs;
}

/**
 * Load a template
 */
function loadTemplate(name) {
  const templatePath = path.join(TEMPLATES_DIR, name);
  
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }
  
  const content = fs.readFileSync(templatePath, 'utf-8');
  return parseYAML(content);
}

/**
 * Generate prompt from spec
 */
function generatePrompt(spec) {
  const template = spec.prompt_template || 
    'You are building {{spec.name}}. Requirements: {{spec.requirements}}';
  
  // Simple template substitution
  let prompt = template
    .replace(/\{\{spec\.id\}\}/g, spec.spec?.id || '')
    .replace(/\{\{spec\.name\}\}/g, spec.spec?.name || '')
    .replace(/\{\{spec\.description\}\}/g, spec.description || '')
    .replace(/\{\{spec\.version\}\}/g, spec.spec?.version || '')
    .replace(/\{\{spec\.status\}\}/g, spec.spec?.status || '');
  
  // Handle requirements loop (simplified)
  if (spec.requirements) {
    const reqList = spec.requirements.map((r, i) => {
      if (typeof r === 'object') {
        return `- [${r.priority || 'P?'}] ${r.description || r.id || ''}`;
      }
      return `- ${r}`;
    }).join('\n');
    prompt = prompt.replace(/\{\{spec\.requirements\}\}/g, reqList);
  }
  
  // Handle implementation files
  if (spec.implementation?.files) {
    prompt = prompt.replace(/\{\{spec\.implementation\.files\}\}/g, 
      spec.implementation.files.join(', '));
  }
  
  return prompt;
}

/**
 * Validate spec requirements
 */
async function validateSpec(spec) {
  const results = [];
  
  console.log(`\n🔍 Validating: ${spec.spec?.name || spec._file}`);
  console.log('=' .repeat(50));
  
  if (spec.requirements) {
    for (const req of spec.requirements) {
      const id = req.id || req.REQ?.id || 'unknown';
      const desc = req.description || req.REQ?.description || 'Requirement';
      const test = req.test || req.REQ?.test;
      
      console.log(`  📋 ${id}: ${desc}`);
      
      if (test) {
        console.log(`     Test: ${test}`);
        // In a real implementation, we would run the test command
        // For now, just note that validation is needed
        results.push({ id, status: 'pending', test });
      } else {
        results.push({ id, status: 'manual', test: 'none' });
      }
    }
  }
  
  // Check implementation files exist
  if (spec.implementation?.files) {
    console.log('\n  📁 Implementation Files:');
    for (const file of spec.implementation.files) {
      const exists = fs.existsSync(path.join(__dirname, '..', file));
      console.log(`    ${exists ? '✅' : '❌'} ${file}`);
      if (!exists) results.push({ id: file, status: 'missing', test: 'file exists' });
    }
  }
  
  return results;
}

/**
 * Calculate spec coverage
 */
function calculateCoverage(specs) {
  let total = 0;
  let passed = 0;
  
  for (const spec of specs) {
    if (spec.requirements) {
      total += spec.requirements.length;
    }
  }
  
  // In a real implementation, track actual validation results
  return { total, passed: 0, percentage: total > 0 ? 0 : 100 };
}

/**
 * List all specs
 */
function listSpecs() {
  const specs = loadAllSpecs();
  
  console.log('\n📋 SDD Specifications\n');
  console.log('=' .repeat(70));
  
  for (const spec of specs) {
    const status = spec.spec?.status || 'unknown';
    const statusIcon = status === 'active' ? '✅' : status === 'draft' ? '📝' : '⚠️';
    
    console.log(`${statusIcon} ${spec.spec?.id}: ${spec.spec?.name}`);
    console.log(`   Version: ${spec.spec?.version || 'N/A'}`);
    console.log(`   Status: ${status}`);
    
    if (spec.requirements) {
      console.log(`   Requirements: ${spec.requirements.length}`);
    }
    
    if (spec.implementation?.files) {
      console.log(`   Files: ${spec.implementation.files.length}`);
    }
    
    console.log('');
  }
  
  const coverage = calculateCoverage(specs);
  console.log('📊 Coverage Summary:');
  console.log(`   Total Requirements: ${coverage.total}`);
  console.log(`   Validated: ${coverage.passed}`);
  console.log(`   Coverage: ${coverage.percentage.toFixed(1)}%`);
}

/**
 * Main CLI
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
SDD Spec Orchestrator

Usage:
  node scripts/spec-orchestrator.js [options]

Options:
  --list, -l          List all specs
  --validate, -v      Validate all specs
  --coverage, -c      Show coverage statistics
  --generate <spec>   Generate prompt from spec
  --template <name>   Load a template
  --help, -h          Show this help

Examples:
  node scripts/spec-orchestrator.js --list
  node scripts/spec-orchestrator.js --validate
  node scripts/spec-orchestrator.js --coverage
`);
    process.exit(0);
  }
  
  if (args.includes('--list') || args.length === 0) {
    listSpecs();
  } else if (args.includes('--validate') || args.includes('-v')) {
    const specs = loadAllSpecs();
    for (const spec of specs) {
      await validateSpec(spec);
    }
    console.log('\n✅ Validation complete');
  } else if (args.includes('--coverage') || args.includes('-c')) {
    const specs = loadAllSpecs();
    const coverage = calculateCoverage(specs);
    console.log(`\n📊 Coverage: ${coverage.percentage.toFixed(1)}% (${coverage.passed}/${coverage.total})`);
  } else if (args.includes('--generate')) {
    const specName = args[args.indexOf('--generate') + 1];
    const specs = loadAllSpecs();
    const spec = specs.find(s => s._file === specName || s.spec?.id === specName);
    
    if (spec) {
      const prompt = generatePrompt(spec);
      console.log('\n📝 Generated Prompt:\n');
      console.log(prompt);
    } else {
      console.log(`❌ Spec not found: ${specName}`);
      process.exit(1);
    }
  } else if (args.includes('--template')) {
    const templateName = args[args.indexOf('--template') + 1];
    try {
      const template = loadTemplate(templateName);
      console.log('\n📄 Template:\n');
      console.log(JSON.stringify(template, null, 2));
    } catch (error) {
      console.log(`❌ ${error.message}`);
      process.exit(1);
    }
  } else {
    console.log('Unknown option. Use --help for usage.');
    process.exit(1);
  }
}

main().catch(console.error);
