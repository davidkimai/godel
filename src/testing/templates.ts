/**
 * Test Templates Module
 * 
 * Generate test templates for various frameworks and test types
 */

import * as path from 'path';
import * as fs from 'fs';
import { TestFramework } from './types';

/**
 * Test template definition
 */
export interface TestTemplate {
  name: string;
  description: string;
  framework: TestFramework;
  template: string;
  fileName: string;
}

/**
 * Generate test result
 */
export interface GenerateTestResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Available test templates
 */
export const TEST_TEMPLATES: TestTemplate[] = [
  // Jest/Vitest templates
  {
    name: 'unit',
    description: 'Unit test template for Jest/Vitest',
    framework: 'jest',
    template: `import { describe, it, expect } from '@testing-library/react';
import { {{className}} } from './{{filename}}';

describe('{{className}}', () => {
  it('should render correctly', () => {
    expect(true).toBe(true);
  });
});`,
    fileName: '{{name}}.test.tsx'
  },
  {
    name: 'integration',
    description: 'Integration test template for Jest/Vitest',
    framework: 'jest',
    template: `import { describe, it, expect, beforeAll, afterAll } from '@testing-library/react';
import { {{className}} } from './{{filename}}';

describe('{{className}} Integration', () => {
  beforeAll(() => {
    // Setup test environment
  });

  afterAll(() => {
    // Cleanup
  });

  it('should work with dependencies', () => {
    expect(true).toBe(true);
  });
});`,
    fileName: '{{name}}.integration.test.tsx'
  },
  {
    name: 'api',
    description: 'API endpoint test template',
    framework: 'jest',
    template: `import request from 'supertest';
import express from 'express';

const app = express();

// Import your routes
// import { {{className}}Router } from './{{filename}}';
// app.use('/api', {{className}}Router);

describe('{{className}} API', () => {
  it('should return 200 OK', async () => {
    const response = await request(app)
      .get('/api/health')
      .expect(200);
    
    expect(response.body.status).toBe('ok');
  });
});`,
    fileName: '{{name}}.api.test.ts'
  },
  {
    name: 'component',
    description: 'React/Vue component test template',
    framework: 'jest',
    template: `import { render, screen, fireEvent } from '@testing-library/react';
import { {{className}} } from './{{filename}}';

describe('{{className}}', () => {
  it('renders without crashing', () => {
    render(<{{className}} />);
    expect(screen.getByText('{{className}}')).toBeInTheDocument();
  });

  it('handles click events', () => {
    const handleClick = jest.fn();
    render(<{{className}} onClick={handleClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});`,
    fileName: '{{name}}.component.test.tsx'
  },
  // pytest templates
  {
    name: 'python-unit',
    description: 'Python pytest unit test',
    framework: 'pytest',
    template: `import pytest
from {{filename}} import {{className}}


def test_{{className.lower()}}_creation():
    \"\"\"Test {{className}} creation.\"\"\"
    instance = {{className}}()
    assert instance is not None


class Test{{className}}:
    \"\"\"Test cases for {{className}}.\"\"\"
    
    def setup_method(self):
        \"\"\"Set up test fixtures.\"\"\"
        self.instance = {{className}}()
    
    def test_example(self):
        \"\"\"Test example.\"\"\"
        assert True`,
    fileName: 'test_{{name}}.py'
  },
  {
    name: 'python-integration',
    description: 'Python pytest integration test',
    framework: 'pytest',
    template: `import pytest
from {{filename}} import {{className}}


class Test{{className}}Integration:
    \"\"\"Integration tests for {{className}}.\"\"\"
    
    @pytest.fixture
    def client(self):
        \"\"\"Create test client.\"\"\"
        # Setup
        yield
        # Teardown
    
    def test_with_database(self, client):
        \"\"\"Test interaction with database.\"\"\"
        assert True
    
    def test_with_external_service(self, client):
        \"\"\"Test interaction with external service.\"\"\"
        assert True`,
    fileName: 'test_{{name}}_integration.py'
  },
  // Rust cargo templates
  {
    name: 'rust-unit',
    description: 'Rust cargo unit test',
    framework: 'cargo',
    template: `#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_{{name}}_creation() {
        let instance = {{ClassName}}::new();
        assert!(instance.is_ok());
    }
    
    #[test]
    fn test_{{name}}_basic_operation() {
        let result = {{ClassName}}::default();
        assert!(result.is_some());
    }
    
    #[test]
    #[should_panic(expected = "error")]
    fn test_{{name}}_should_panic() {
        // Test that this panics
        panic!("error");
    }
}`,
    fileName: '{{name}}.rs'
  },
  {
    name: 'rust-integration',
    description: 'Rust cargo integration test',
    framework: 'cargo',
    template: `use {{crate_name}};

#[test]
fn test_integration() {
    // Integration test for multiple components
    let result = {{crate_name}}::process();
    assert!(result.is_ok());
}`,
    fileName: 'tests/integration_{{name}}.rs'
  },
  // Go templates
  {
    name: 'go-unit',
    description: 'Go unit test',
    framework: 'go',
    template: `package main

import "testing"

func Test{{ClassName}}(t *testing.T) {
    // Test setup
    instance := New{{ClassName}}()
    
    // Test assertions
    if instance == nil {
        t.Error("Expected non-nil instance")
    }
}

func Test{{ClassName}}WithParams(t *testing.T) {
    tests := []struct {
        name     string
        input    string
        expected string
    }{
        {"test case 1", "input1", "expected1"},
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := process(tt.input)
            if result != tt.expected {
                t.Errorf("Expected %s, got %s", tt.expected, result)
            }
        })
    }
}`,
    fileName: '{{name}}_test.go'
  },
  {
    name: 'go-integration',
    description: 'Go integration test',
    framework: 'go',
    template: `package main

import (
    "testing"
    "net/http"
    "net/http/httptest"
)

func Test{{ClassName}}Integration(t *testing.T) {
    // Create test server
    ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Write([]byte("response"))
    }))
    defer ts.Close()
    
    // Test client
    resp, err := http.Get(ts.URL)
    if err != nil {
        t.Fatal(err)
    }
    defer resp.Body.Close()
    
    if resp.StatusCode != http.StatusOK {
        t.Errorf("Expected status 200, got %d", resp.StatusCode)
    }
}`,
    fileName: '{{name}}_integration_test.go'
  }
];

/**
 * Get all templates or filter by framework
 */
export function getTemplates(framework?: TestFramework): TestTemplate[] {
  if (!framework) {
    return TEST_TEMPLATES;
  }
  return TEST_TEMPLATES.filter(t => t.framework === framework);
}

/**
 * Get a specific template by name
 */
export function getTemplate(name: string, framework?: TestFramework): TestTemplate | undefined {
  const templates = getTemplates(framework);
  return templates.find(t => t.name === name);
}

/**
 * List all template names
 */
export function listTemplateNames(framework?: TestFramework): string[] {
  return getTemplates(framework).map(t => t.name);
}

/**
 * Generate a test file from a template
 */
export function generateTest(options: {
  template: string;
  targetFile: string;
  outputDir?: string;
  framework?: string;
}): GenerateTestResult {
  const fw = (options.framework as TestFramework) || 'jest';
  const templateObj = getTemplate(options.template, fw);
  
  if (!templateObj) {
    return { 
      success: false, 
      error: `Template '${options.template}' not found for framework '${fw}'` 
    };
  }
  
  const targetPath = options.targetFile;
  const targetDir = options.outputDir || path.dirname(targetPath);
  
  // Parse the target file to extract class/function name
  const fileName = path.basename(targetPath, path.extname(targetPath));
  const className = fileName
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  
  // Generate file name
  let generatedFileName = templateObj.fileName
    .replace('{{name}}', fileName)
    .replace('{{filename}}', fileName);
  
  const outputPath = path.join(targetDir, generatedFileName);
  
  // Generate content
  let content = templateObj.template
    .replace(/\{\{className\}\}/g, className)
    .replace(/\{\{ClassName\}\}/g, className)
    .replace(/\{\{filename\}\}/g, fileName)
    .replace(/\{\{name\}\}/g, fileName)
    .replace(/\{\{crate_name\}\}/g, fileName.replace(/-/g, '_'));
  
  try {
    // Ensure output directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    fs.writeFileSync(outputPath, content);
    
    return { success: true, filePath: outputPath };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to write test file: ${error}` 
    };
  }
}

/**
 * Generate multiple test files for an agent
 */
export function generateTestSuite(
  targetDir: string,
  framework: TestFramework
): { success: boolean; files: string[]; errors: string[] } {
  const results = {
    success: true,
    files: [] as string[],
    errors: [] as string[]
  };
  
  // Get templates for the framework
  const templates = getTemplates(framework);
  
  // Find source files in the target directory
  const sourceExtensions: Record<TestFramework, string[]> = {
    jest: ['.ts', '.tsx', '.js', '.jsx'],
    vitest: ['.ts', '.tsx', '.js', '.jsx'],
    pytest: ['.py'],
    unittest: ['.py'],
    cargo: ['.rs'],
    go: ['.go']
  };
  
  const extensions = sourceExtensions[framework] || [];
  const testDir = path.join(targetDir, 'tests');
  
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  
  return results;
}
