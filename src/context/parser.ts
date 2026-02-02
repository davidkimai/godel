/**
 * Dependency Parser Module
 * Parses import statements from various programming languages
 */

import type { ImportStatement, DependencyParser, LanguageType } from './types';

// Language-specific patterns for import statements
const IMPORT_PATTERNS: Record<LanguageType, RegExp[]> = {
  typescript: [
    // ES6 imports: import { foo } from 'bar'
    /import\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/g,
    // Default imports: import foo from 'bar'
    /import\s+(\w+)\s*from\s*['"]([^'"]+)['"]/g,
    // Side-effect imports: import 'bar'
    /import\s*['"]([^'"]+)['"]/g,
    // Namespace imports: import * as foo from 'bar'
    /import\s*\*\s*as\s*\w+\s*from\s*['"]([^'"]+)['"]/g,
    // Type-only imports: import type { foo } from 'bar'
    /import\s+type\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/g,
    // Relative imports: import { foo } from './bar'
    /import\s*\{[^}]*\}\s*from\s*['"](\.[^'"]+)['"]/g,
  ],
  javascript: [
    // ES6 imports
    /import\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/g,
    /import\s+(\w+)\s*from\s*['"]([^'"]+)['"]/g,
    /import\s*['"]([^'"]+)['"]/g,
    /import\s*\*\s*as\s*\w+\s*from\s*['"]([^'"]+)['"]/g,
    // require() calls (CommonJS)
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ],
  python: [
    // import module
    /import\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g,
    // from module import name
    /from\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)\s+import/g,
    // from . import name (relative)
    /from\s+(\.[a-zA-Z_][a-zA-Z0-9_]*|\.)\s+import/g,
  ],
  rust: [
    // use statements: use foo::bar;
    /use\s+([a-zA-Z_][a-zA-Z0-9_:]*(?:\s*\{[^}]*\})?);/g,
    // extern crate: extern crate foo;
    /extern\s+crate\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
  ],
  go: [
    // import statements
    /import\s+["']([^"']+)["']/g,
    // multi-import
    /\(\s*["']([^"']+)["'](?:\s*["']([^"']+)["'])*\s*\)/g,
  ],
};

/**
 * Parse import statements from file content
 */
export function parseImports(
  content: string,
  language: LanguageType
): ImportStatement[] {
  const imports: ImportStatement[] = [];
  const patterns = IMPORT_PATTERNS[language] || IMPORT_PATTERNS.typescript;

  for (const pattern of patterns) {
    let match;
    // Reset lastIndex for global regex
    const regex = new RegExp(pattern.source, pattern.flags);
    
    while ((match = regex.exec(content)) !== null) {
      const modulePath = match[1] || match[0];
      
      // Determine if it's a relative import
      const isRelative = modulePath.startsWith('.');
      
      // Determine the type of import
      let importType: ImportStatement['type'] = 'default';
      if (match[0].includes('type ')) {
        importType = 'type';
      } else if (match[0].includes('* as')) {
        importType = 'namespace';
      } else if (match[0].includes('{')) {
        importType = 'named';
      } else if (match[0].includes('require')) {
        importType = 'require';
      }

      imports.push({
        module: modulePath,
        type: importType,
        isRelative,
        line: content.substring(0, match.index).split('\n').length,
      });
    }
  }

  // Remove duplicates
  const uniqueImports = new Map();
  for (const imp of imports) {
    if (!uniqueImports.has(imp.module)) {
      uniqueImports.set(imp.module, imp);
    }
  }

  return Array.from(uniqueImports.values());
}

/**
 * Parse exports from file content
 */
export function parseExports(
  content: string,
  language: LanguageType
): string[] {
  const exports: string[] = [];

  switch (language) {
    case 'typescript':
    case 'javascript': {
      // ES6 exports: export { foo, bar }
      const namedExportRegex = /export\s*\{([^}]+)\}/g;
      let match;
      while ((match = namedExportRegex.exec(content)) !== null) {
        const names = match[1].split(',').map((n) => n.trim());
        exports.push(...names);
      }

      // export const foo = ...
      const constExportRegex = /export\s+(const|let|function|class|interface|type)\s+(\w+)/g;
      while ((match = constExportRegex.exec(content)) !== null) {
        exports.push(match[2]);
      }

      // export default (with or without type keyword)
      const defaultExportRegex = /export\s+default\s+(?:class|function|interface|type)?\s*(\w+)/g;
      while ((match = defaultExportRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }
      break;
    }

    case 'python': {
      // __all__ definition
      const allRegex = /__all__\s*=\s*\[([^\]]+)\]/g;
      let match: RegExpExecArray | null;
      while ((match = allRegex.exec(content)) !== null) {
        const names = match[1]
          .split(',')
          .map((n: string) => n.trim().replace(/['"]/g, ''));
        exports.push(...names);
      }
      break;
    }

    case 'rust': {
      // pub use statements
      const pubUseRegex = /pub\s+use\s+([a-zA-Z_][a-zA-Z0-9_:]*)/g;
      let match: RegExpExecArray | null;
      while ((match = pubUseRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }

      // pub fn/class
      const pubFnRegex = /pub\s+(fn|struct|enum|trait|impl)\s+(\w+)/g;
      while ((match = pubFnRegex.exec(content)) !== null) {
        exports.push(match[2]);
      }
      break;
    }

    case 'go': {
      // exported functions/vars start with uppercase
      const exportedRegex = /func\s+([A-Z]\w+)/g;
      let match: RegExpExecArray | null;
      while ((match = exportedRegex.exec(content)) !== null) {
        exports.push(match[1]);
      }
      break;
    }
  }

  return [...new Set(exports)];
}

/**
 * Detect language from file extension
 */
export function detectLanguage(filePath: string): LanguageType | null {
  const ext = filePath.split('.').pop()?.toLowerCase();
  
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'py':
      return 'python';
    case 'rs':
      return 'rust';
    case 'go':
      return 'go';
    default:
      return null;
  }
}

/**
 * Create a language-agnostic parser interface
 */
export function createParser(language: LanguageType): DependencyParser {
  return {
    parseImports: (content: string) => parseImports(content, language),
    parseExports: (content: string) => parseExports(content, language),
    detectLanguage: (filePath: string) => detectLanguage(filePath) ?? 'typescript',
  };
}

/**
 * Parse file and extract imports and exports
 */
export function parseFile(
  content: string,
  filePath: string
): { imports: ImportStatement[]; exports: string[] } {
  const language = detectLanguage(filePath) ?? 'typescript';
  return {
    imports: parseImports(content, language),
    exports: parseExports(content, language),
  };
}
