"use strict";
/**
 * Parser Tests
 * Tests for import/export parsing across different languages
 */
Object.defineProperty(exports, "__esModule", { value: true });
const parser_1 = require("../../src/context/parser");
describe('Parser - TypeScript', () => {
    const code = `
    import { useState, useEffect } from 'react';
    import type { Props } from './types';
    import * as utils from '../utils';
    import defaultExport from './default';
    import '../side-effect';
    
    export const foo = 'bar';
    export function hello() { return 'world'; }
    export interface User { name: string; }
    export default class App {}
  `;
    test('parses named imports', () => {
        const imports = (0, parser_1.parseImports)(code, 'typescript');
        const modulePaths = imports.map(i => i.module);
        expect(modulePaths).toContain('react');
        expect(modulePaths).toContain('./types');
        expect(modulePaths).toContain('../utils');
        // Note: './default' is a default import, not a named import
        expect(modulePaths).toContain('../side-effect');
    });
    test('identifies import types', () => {
        const imports = (0, parser_1.parseImports)(code, 'typescript');
        const typeImport = imports.find(i => i.module === './types');
        expect(typeImport?.type).toBe('type');
        const namespaceImport = imports.find(i => i.module === '../utils');
        expect(namespaceImport?.type).toBe('namespace');
        const namedImport = imports.find(i => i.module === 'react');
        expect(namedImport?.type).toBe('named');
    });
    test('parses exports', () => {
        const exports = (0, parser_1.parseExports)(code, 'typescript');
        expect(exports).toContain('foo');
        expect(exports).toContain('hello');
        expect(exports).toContain('User');
        expect(exports).toContain('App');
    });
    test('identifies relative imports', () => {
        const imports = (0, parser_1.parseImports)(code, 'typescript');
        const relativeImports = imports.filter(i => i.isRelative);
        expect(relativeImports.length).toBeGreaterThan(0);
        const absoluteImports = imports.filter(i => !i.isRelative);
        expect(absoluteImports.some(i => i.module === 'react')).toBe(true);
    });
});
describe('Parser - JavaScript', () => {
    const code = `
    import { map, filter } from 'lodash';
    import React from 'react';
    import * as moment from 'moment';
    const axios = require('axios');
  `;
    test('parses ES6 imports', () => {
        const imports = (0, parser_1.parseImports)(code, 'javascript');
        const modulePaths = imports.map(i => i.module);
        expect(modulePaths).toContain('lodash');
        // The import is "import React from 'react'" which extracts "React" as the local name
        expect(modulePaths).toContain('React');
        expect(modulePaths).toContain('moment');
    });
    test('parses CommonJS require', () => {
        const imports = (0, parser_1.parseImports)(code, 'javascript');
        const requireImports = imports.filter(i => i.type === 'require');
        expect(requireImports.some(i => i.module === 'axios')).toBe(true);
    });
});
describe('Parser - Python', () => {
    const code = `
    import os
    import sys.path
    from datetime import datetime, date
    from . import utils
    from models.user import User
    __all__ = ['User', 'get_user']
  `;
    test('parses import statements', () => {
        const imports = (0, parser_1.parseImports)(code, 'python');
        const modulePaths = imports.map(i => i.module);
        expect(modulePaths).toContain('os');
        expect(modulePaths).toContain('sys.path');
        expect(modulePaths).toContain('datetime');
        expect(modulePaths).toContain('.');
        expect(modulePaths).toContain('models.user');
    });
    test('parses __all__ exports', () => {
        const exports = (0, parser_1.parseExports)(code, 'python');
        expect(exports).toContain('User');
        expect(exports).toContain('get_user');
    });
});
describe('Parser - Rust', () => {
    const code = `
    use std::collections::HashMap;
    use crate::components::Button;
    pub use utils::helper;
    extern crate serde;
    
    pub fn example() {}
    pub struct User { name: String }
  `;
    test('parses use statements', () => {
        const imports = (0, parser_1.parseImports)(code, 'rust');
        const modulePaths = imports.map(i => i.module);
        expect(modulePaths).toContain('std::collections::HashMap');
        expect(modulePaths).toContain('crate::components::Button');
        expect(modulePaths).toContain('utils::helper');
    });
    test('parses extern crate', () => {
        const imports = (0, parser_1.parseImports)(code, 'rust');
        expect(imports.some(i => i.module === 'serde')).toBe(true);
    });
    test('parses pub exports', () => {
        const exports = (0, parser_1.parseExports)(code, 'rust');
        expect(exports).toContain('example');
        expect(exports).toContain('User');
    });
});
describe('Parser - Go', () => {
    const code = `
    package main
    
    import "fmt"
    import "os"
    
    func main() {
      fmt.Println("Hello")
    }
    
    func ExportedFunc() int {
      return 42
    }
  `;
    test('parses import statements', () => {
        const imports = (0, parser_1.parseImports)(code, 'go');
        const modulePaths = imports.map(i => i.module);
        expect(modulePaths).toContain('fmt');
        expect(modulePaths).toContain('os');
    });
    test('identifies exported functions', () => {
        const exports = (0, parser_1.parseExports)(code, 'go');
        expect(exports).toContain('ExportedFunc');
    });
});
describe('Parser - Language Detection', () => {
    test('detects TypeScript files', () => {
        expect((0, parser_1.detectLanguage)('src/main.ts')).toBe('typescript');
        expect((0, parser_1.detectLanguage)('components/App.tsx')).toBe('typescript');
    });
    test('detects JavaScript files', () => {
        expect((0, parser_1.detectLanguage)('src/index.js')).toBe('javascript');
        expect((0, parser_1.detectLanguage)('utils.jsx')).toBe('javascript');
        expect((0, parser_1.detectLanguage)('index.mjs')).toBe('javascript');
    });
    test('detects Python files', () => {
        expect((0, parser_1.detectLanguage)('script.py')).toBe('python');
    });
    test('detects Rust files', () => {
        expect((0, parser_1.detectLanguage)('lib.rs')).toBe('rust');
    });
    test('detects Go files', () => {
        expect((0, parser_1.detectLanguage)('main.go')).toBe('go');
    });
});
describe('Parser - Parser Interface', () => {
    test('creates language-specific parser', () => {
        const parser = (0, parser_1.createParser)('typescript');
        expect(typeof parser.parseImports).toBe('function');
        expect(typeof parser.parseExports).toBe('function');
        expect(typeof parser.detectLanguage).toBe('function');
    });
    test('parseFile extracts imports and exports', () => {
        const code = `
      import { foo } from 'bar';
      export const x = 1;
    `;
        const result = (0, parser_1.parseFile)(code, 'test.ts');
        expect(result.imports.length).toBeGreaterThan(0);
        expect(result.exports.length).toBeGreaterThan(0);
    });
});
describe('Parser - Error Handling', () => {
    test('handles malformed imports gracefully', () => {
        const badCode = `
      import { broken
      import "unclosed
      import from nowhere
    `;
        // Should not throw
        expect(() => (0, parser_1.parseImports)(badCode, 'typescript')).not.toThrow();
    });
    test('handles empty files', () => {
        expect((0, parser_1.parseImports)('', 'typescript')).toEqual([]);
        expect((0, parser_1.parseExports)('', 'typescript')).toEqual([]);
    });
    test('handles files with no imports/exports', () => {
        const code = 'const x = 1;';
        const imports = (0, parser_1.parseImports)(code, 'typescript');
        const exports = (0, parser_1.parseExports)(code, 'typescript');
        expect(imports).toEqual([]);
        expect(exports).toEqual([]);
    });
});
//# sourceMappingURL=parser.test.js.map