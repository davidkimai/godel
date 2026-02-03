/**
 * Skill Parser Unit Tests
 * 
 * Tests for Markdown skill parsing functionality.
 */

import {
  parseFrontmatter,
  parseSections,
  extractWhenToUse,
  extractSteps,
  extractExamples,
  extractTools,
  validateSkillName,
  validateDescription,
  validateFrontmatterFields,
  loadSkillFromFile,
  formatSkillsForPrompt,
  SkillSource,
} from '../../../src/core/skills';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Skill Parser', () => {
  describe('parseFrontmatter', () => {
    it('should parse basic frontmatter', () => {
      const content = `---
name: test-skill
description: A test skill
---

# Test Skill

This is the body.`;

      const result = parseFrontmatter(content);
      
      expect(result.frontmatter).toEqual({
        name: 'test-skill',
        description: 'A test skill',
      });
      expect(result.body).toContain('# Test Skill');
    });

    it('should parse frontmatter with metadata', () => {
      const content = `---
name: test-skill
description: A test skill
metadata:
  author: test-author
  version: "1.0.0"
---

Body content.`;

      const result = parseFrontmatter(content);
      
      expect(result.frontmatter['name']).toBe('test-skill');
      expect(result.frontmatter['metadata']).toBeDefined();
    });

    it('should handle content without frontmatter', () => {
      const content = '# Just a header\n\nSome content';
      
      const result = parseFrontmatter(content);
      
      expect(result.frontmatter).toEqual({});
      expect(result.body).toBe(content);
    });
  });

  describe('parseSections', () => {
    it('should parse markdown sections', () => {
      const content = `# Main Section
Content here

## Sub Section
More content

### Deep Section
Even more`;

      const sections = parseSections(content);
      
      expect(sections).toHaveLength(3);
      expect(sections[0].title).toBe('Main Section');
      expect(sections[0].level).toBe(1);
      expect(sections[1].title).toBe('Sub Section');
      expect(sections[1].level).toBe(2);
      expect(sections[2].title).toBe('Deep Section');
      expect(sections[2].level).toBe(3);
    });

    it('should handle content without headers', () => {
      const content = 'Just some plain text\n\nMore text';
      
      const sections = parseSections(content);
      
      expect(sections).toHaveLength(0);
    });
  });

  describe('extractWhenToUse', () => {
    it('should extract bullet points from when to use section', () => {
      const sections = [
        {
          title: 'When to Use',
          level: 2,
          content: '- When deploying to production\n- When setting up CI/CD\n- For rollback procedures',
        },
      ];

      const whenToUse = extractWhenToUse(sections);
      
      expect(whenToUse).toHaveLength(3);
      expect(whenToUse).toContain('When deploying to production');
      expect(whenToUse).toContain('When setting up CI/CD');
      expect(whenToUse).toContain('For rollback procedures');
    });

    it('should handle asterisk bullets', () => {
      const sections = [
        {
          title: 'When',
          level: 2,
          content: '* First item\n* Second item',
        },
      ];

      const whenToUse = extractWhenToUse(sections);
      
      expect(whenToUse).toHaveLength(2);
    });

    it('should return empty array if no when to use section', () => {
      const sections = [
        { title: 'Other Section', level: 2, content: 'Some content' },
      ];

      const whenToUse = extractWhenToUse(sections);
      
      expect(whenToUse).toHaveLength(0);
    });
  });

  describe('extractSteps', () => {
    it('should extract numbered steps', () => {
      const sections = [
        {
          title: 'Steps',
          level: 2,
          content: '1. First step\n2. Second step\n3. Third step',
        },
      ];

      const steps = extractSteps(sections);
      
      expect(steps).toHaveLength(3);
      expect(steps[0]).toBe('First step');
      expect(steps[1]).toBe('Second step');
      expect(steps[2]).toBe('Third step');
    });

    it('should handle parenthesis numbering', () => {
      const sections = [
        {
          title: 'Procedure',
          level: 2,
          content: '1) Do this\n2) Do that',
        },
      ];

      const steps = extractSteps(sections);
      
      expect(steps).toHaveLength(2);
    });
  });

  describe('extractExamples', () => {
    it('should extract examples with title', () => {
      const sections = [
        {
          title: 'Examples',
          level: 2,
          content: `### Example 1: Basic Usage
Input: hello
Output: world

### Example 2: Advanced
Input: test
Output: result`,
        },
      ];

      const examples = extractExamples(sections);
      
      expect(examples).toHaveLength(2);
      expect(examples[0].title).toContain('Example 1');
      expect(examples[1].title).toContain('Example 2');
    });
  });

  describe('extractTools', () => {
    it('should extract tool definitions', () => {
      const sections = [
        {
          title: 'Tools Available',
          level: 2,
          content: '- `deploy`: Deploy the application\n- `test`: Run tests\n- `build`: Build artifacts',
        },
      ];

      const tools = extractTools(sections);
      
      expect(tools).toHaveLength(3);
      expect(tools[0].name).toBe('deploy');
      expect(tools[0].description).toBe('Deploy the application');
    });
  });

  describe('validateSkillName', () => {
    it('should validate correct names', () => {
      const errors = validateSkillName('test-skill', 'test-skill');
      expect(errors).toHaveLength(0);
    });

    it('should reject name mismatch with directory', () => {
      const errors = validateSkillName('wrong-name', 'test-skill');
      expect(errors).toContain('name "wrong-name" does not match parent directory "test-skill"');
    });

    it('should reject uppercase', () => {
      const errors = validateSkillName('Test-Skill', 'Test-Skill');
      expect(errors.some(e => e.includes('name contains invalid characters'))).toBe(true);
    });

    it('should reject starting with hyphen', () => {
      const errors = validateSkillName('-test', '-test');
      expect(errors).toContain('name must not start or end with a hyphen');
    });

    it('should reject consecutive hyphens', () => {
      const errors = validateSkillName('test--skill', 'test--skill');
      expect(errors).toContain('name must not contain consecutive hyphens');
    });

    it('should reject too long names', () => {
      const longName = 'a'.repeat(65);
      const errors = validateSkillName(longName, longName);
      expect(errors.some(e => e.includes('name exceeds 64 characters'))).toBe(true);
    });
  });

  describe('validateDescription', () => {
    it('should require description', () => {
      const errors = validateDescription(undefined);
      expect(errors).toContain('description is required');
    });

    it('should reject empty description', () => {
      const errors = validateDescription('   ');
      expect(errors).toContain('description is required');
    });

    it('should reject too long description', () => {
      const longDesc = 'a'.repeat(1025);
      const errors = validateDescription(longDesc);
      expect(errors.some(e => e.includes('description exceeds 1024 characters'))).toBe(true);
    });
  });

  describe('validateFrontmatterFields', () => {
    it('should allow valid fields', () => {
      const errors = validateFrontmatterFields(['name', 'description', 'metadata']);
      expect(errors).toHaveLength(0);
    });

    it('should reject unknown fields', () => {
      const errors = validateFrontmatterFields(['name', 'invalid-field']);
      expect(errors).toContain('unknown frontmatter field "invalid-field"');
    });
  });
});

describe('Skill Loading Integration', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-skills-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should load a valid skill file', () => {
    const skillDir = path.join(tempDir, 'test-skill');
    fs.mkdirSync(skillDir);
    
    const skillContent = `---
name: test-skill
description: A test skill for unit testing
metadata:
  author: test
  version: "1.0.0"
---

# Test Skill

## When to Use

- Testing skill loading
- Validating parser

## Steps

1. Load the skill
2. Validate content
3. Return result

## Tools Available

- \`test\`: Run tests
- \`validate\`: Validate skill
`;

    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);

    const result = loadSkillFromFile(path.join(skillDir, 'SKILL.md'), 'builtin' as SkillSource);
    
    expect(result.skill).not.toBeNull();
    expect(result.skill!.name).toBe('test-skill');
    expect(result.skill!.description).toBe('A test skill for unit testing');
    expect(result.skill!.whenToUse).toHaveLength(2);
    expect(result.skill!.steps).toHaveLength(3);
    expect(result.skill!.tools).toHaveLength(2);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('should report errors for invalid skill', () => {
    const skillDir = path.join(tempDir, 'bad-skill');
    fs.mkdirSync(skillDir);
    
    const skillContent = `---
name: wrong-name
description: 
---

# Bad Skill
`;

    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);

    const result = loadSkillFromFile(path.join(skillDir, 'SKILL.md'), 'builtin' as SkillSource);
    
    expect(result.skill).toBeNull();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});

describe('formatSkillsForPrompt', () => {
  it('should format skills as XML', () => {
    const skills = [
      {
        name: 'deployment',
        description: 'Deploy services',
        filePath: '/skills/deployment/SKILL.md',
        baseDir: '/skills/deployment',
        source: 'builtin' as SkillSource,
        content: '',
        frontmatter: { name: 'deployment', description: 'Deploy services' },
        disableModelInvocation: false,
        sections: [],
        whenToUse: [],
        steps: [],
        examples: [],
        tools: [],
      },
    ];

    const formatted = formatSkillsForPrompt(skills);
    
    expect(formatted).toContain('<available_skills>');
    expect(formatted).toContain('<skill>');
    expect(formatted).toContain('<name>deployment</name>');
    expect(formatted).toContain('<description>Deploy services</description>');
    expect(formatted).toContain('</available_skills>');
  });

  it('should exclude skills with disableModelInvocation', () => {
    const skills = [
      {
        name: 'hidden',
        description: 'Hidden skill',
        filePath: '/skills/hidden/SKILL.md',
        baseDir: '/skills/hidden',
        source: 'builtin' as SkillSource,
        content: '',
        frontmatter: { 
          name: 'hidden', 
          description: 'Hidden skill',
          'disable-model-invocation': true,
        },
        disableModelInvocation: true,
        sections: [],
        whenToUse: [],
        steps: [],
        examples: [],
        tools: [],
      },
    ];

    const formatted = formatSkillsForPrompt(skills);
    
    expect(formatted).toBe('');
  });

  it('should escape XML special characters', () => {
    const skills = [
      {
        name: 'test-skill',
        description: 'Test with <special> & "characters"',
        filePath: '/skills/test/SKILL.md',
        baseDir: '/skills/test',
        source: 'builtin' as SkillSource,
        content: '',
        frontmatter: { name: 'test-skill', description: 'Test' },
        disableModelInvocation: false,
        sections: [],
        whenToUse: [],
        steps: [],
        examples: [],
        tools: [],
      },
    ];

    const formatted = formatSkillsForPrompt(skills);
    
    expect(formatted).toContain('&lt;special&gt;');
    expect(formatted).toContain('&amp;');
    expect(formatted).toContain('&quot;characters&quot;');
  });
});
