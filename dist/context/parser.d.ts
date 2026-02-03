/**
 * Dependency Parser Module
 * Parses import statements from various programming languages
 */
import type { ImportStatement, DependencyParser, LanguageType } from './types';
/**
 * Parse import statements from file content
 */
export declare function parseImports(content: string, language: LanguageType): ImportStatement[];
/**
 * Parse exports from file content
 */
export declare function parseExports(content: string, language: LanguageType): string[];
/**
 * Detect language from file extension
 */
export declare function detectLanguage(filePath: string): LanguageType | null;
/**
 * Create a language-agnostic parser interface
 */
export declare function createParser(language: LanguageType): DependencyParser;
/**
 * Parse file and extract imports and exports
 */
export declare function parseFile(content: string, filePath: string): {
    imports: ImportStatement[];
    exports: string[];
};
//# sourceMappingURL=parser.d.ts.map