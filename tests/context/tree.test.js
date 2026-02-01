"use strict";
/**
 * Tests for File Tree Module
 */
Object.defineProperty(exports, "__esModule", { value: true });
const tree_1 = require("../../src/context/tree");
describe('FileTreeBuilder', () => {
    let builder;
    beforeEach(() => {
        builder = new tree_1.FileTreeBuilder();
    });
    describe('addPath', () => {
        it('should add a single file path', () => {
            const node = builder.addPath('/src/main.ts');
            expect(node.name).toBe('main.ts');
            expect(node.path).toBe('/src/main.ts');
            expect(node.type).toBe('file');
        });
        it('should add nested directory structure', () => {
            builder.addPath('/src/components/Button.tsx');
            const root = builder.build();
            expect(root.type).toBe('directory');
            expect(root.children).toBeDefined();
            expect(root.children.length).toBe(1);
            const srcDir = root.children.find(c => c.name === 'src');
            expect(srcDir).toBeDefined();
            expect(srcDir.type).toBe('directory');
            const componentsDir = srcDir.children.find(c => c.name === 'components');
            expect(componentsDir).toBeDefined();
            const buttonFile = componentsDir.children.find(c => c.name === 'Button.tsx');
            expect(buttonFile).toBeDefined();
            expect(buttonFile.type).toBe('file');
        });
        it('should handle duplicate paths gracefully', () => {
            builder.addPath('/src/main.ts');
            const node2 = builder.addPath('/src/main.ts');
            expect(node2.path).toBe('/src/main.ts');
            expect(builder.getAllPaths().length).toBe(1);
        });
        it('should add metadata to files', () => {
            const metadata = { size: 1024, lastModified: new Date() };
            builder.addPath('/src/main.ts', metadata);
            const node = builder.getNode('/src/main.ts');
            expect(node.metadata).toEqual(metadata);
        });
    });
    describe('getNode', () => {
        it('should return undefined for non-existent paths', () => {
            expect(builder.getNode('/nonexistent')).toBeUndefined();
        });
        it('should return node for existing paths', () => {
            builder.addPath('/src/utils.ts');
            const node = builder.getNode('/src/utils.ts');
            expect(node).toBeDefined();
            expect(node.name).toBe('utils.ts');
        });
    });
    describe('hasPath', () => {
        it('should return false for non-existent paths', () => {
            expect(builder.hasPath('/fake')).toBe(false);
        });
        it('should return true for existing paths', () => {
            builder.addPath('/src/main.ts');
            expect(builder.hasPath('/src/main.ts')).toBe(true);
        });
    });
    describe('getAllPaths', () => {
        it('should return all file paths', () => {
            builder.addPath('/src/main.ts');
            builder.addPath('/src/utils.ts');
            builder.addPath('/tests/main.test.ts');
            const paths = builder.getAllPaths();
            expect(paths.length).toBe(3);
            expect(paths).toContain('/src/main.ts');
            expect(paths).toContain('/src/utils.ts');
            expect(paths).toContain('/tests/main.test.ts');
        });
        it('should not include root path', () => {
            builder.addPath('/src/main.ts');
            const paths = builder.getAllPaths();
            expect(paths).not.toContain('/');
        });
    });
    describe('build', () => {
        it('should clean up empty directories', () => {
            builder.addPath('/src/main.ts');
            const tree = builder.build();
            // Root should have src directory with the file
            const srcDir = tree.children.find(c => c.name === 'src');
            expect(srcDir).toBeDefined();
            expect(srcDir.children.length).toBe(1);
        });
        it('should return root with correct structure', () => {
            builder.addPath('/src/main.ts');
            const tree = builder.build();
            expect(tree.name).toBe('/');
            expect(tree.path).toBe('/');
            expect(tree.type).toBe('directory');
        });
    });
    describe('extractDependencies', () => {
        it('should extract dependencies based on path patterns', () => {
            builder.addPath('/src/api/users.ts');
            builder.addPath('/src/api/users.test.ts');
            const graph = builder.extractDependencies([
                '/src/api/users.ts',
                '/src/api/users.test.ts',
            ]);
            // Test file should have a dependency on the source file
            const testFileDeps = graph.nodes.get('/src/api/users.test.ts');
            expect(testFileDeps).toBeDefined();
            expect(testFileDeps.some(d => d.includes('users.ts'))).toBe(true);
        });
    });
    describe('addFileContent', () => {
        it('should store file contents for parsing', () => {
            builder.addFileContent('/src/main.ts', 'import React from "react";');
            // The content should be stored internally
            // We can verify this through the buildDependencyGraph method
            const graph = builder.buildDependencyGraph();
            expect(graph.nodes.get('/src/main.ts')).toBeDefined();
        });
    });
    describe('parseAllSymbols', () => {
        it('should parse symbols from all added file contents', () => {
            builder.addFileContent('/src/main.ts', "import React from 'react'; export const App = () => {};");
            builder.addFileContent('/src/utils.ts', "export const foo = () => {};");
            const symbols = builder.parseAllSymbols();
            expect(symbols.get('/src/main.ts').exports).toContain('App');
            expect(symbols.get('/src/utils.ts').exports).toContain('foo');
        });
    });
    describe('buildDependencyGraph', () => {
        it('should build dependency graph from file contents', () => {
            builder.addFileContent('/src/main.ts', "import { foo } from './utils';");
            builder.addFileContent('/src/utils.ts', "export const foo = () => {};");
            const graph = builder.buildDependencyGraph();
            expect(graph.nodes.get('/src/main.ts')).toContain('./utils');
            expect(graph.nodes.get('/src/utils.ts')).toEqual([]);
        });
        it('should include symbol index', () => {
            builder.addFileContent('/src/main.ts', "import { foo } from './utils'; export const bar = 42;");
            builder.addFileContent('/src/utils.ts', "export const foo = () => {};");
            const graph = builder.buildDependencyGraph();
            expect(graph.symbolIndex).toBeDefined();
            if (graph.symbolIndex) {
                expect(graph.symbolIndex.size).toBeGreaterThan(0);
            }
        });
    });
    describe('detectCircularDependencies', () => {
        it('should detect circular dependencies', () => {
            builder.addFileContent('/src/a.ts', "import { b } from './b';");
            builder.addFileContent('/src/b.ts', "import { a } from './a';");
            const result = builder.detectCircularDependencies();
            expect(result.hasCycles).toBe(true);
            expect(result.cycles.length).toBeGreaterThan(0);
        });
    });
    describe('getFileDependencies', () => {
        it('should return direct dependencies for a file', () => {
            builder.addFileContent('/src/main.ts', "import { a } from './a'; import { b } from './b';");
            builder.addFileContent('/src/a.ts', "");
            builder.addFileContent('/src/b.ts', "");
            const deps = builder.getFileDependencies('/src/main.ts');
            expect(deps).toContain('./a');
            expect(deps).toContain('./b');
        });
    });
    describe('getFileDependents', () => {
        it('should return files that depend on the given file', () => {
            builder.addFileContent('/src/utils.ts', "");
            builder.addFileContent('/src/main.ts', "import { utils } from './utils';");
            builder.addFileContent('/src/other.ts', "import { utils } from './utils';");
            const dependents = builder.getFileDependents('/src/utils.ts');
            expect(dependents).toContain('/src/main.ts');
            expect(dependents).toContain('/src/other.ts');
        });
    });
    describe('getTransitiveDependencies', () => {
        it('should return transitive dependencies', () => {
            builder.addFileContent('/src/main.ts', "import { a } from './a';");
            builder.addFileContent('/src/a.ts', "import { b } from './b';");
            builder.addFileContent('/src/b.ts', "import { c } from './c';");
            builder.addFileContent('/src/c.ts', "");
            const transitive = builder.getTransitiveDependencies('/src/main.ts');
            expect(transitive).toContain('./b');
            expect(transitive).toContain('./c');
        });
    });
    describe('getTransitiveDependents', () => {
        it('should return transitive dependents', () => {
            builder.addFileContent('/src/utils.ts', "");
            builder.addFileContent('/src/a.ts', "import { utils } from '../utils';");
            builder.addFileContent('/src/b.ts', "import { a } from './a';");
            builder.addFileContent('/src/main.ts', "import { b } from './b';");
            const transitive = builder.getTransitiveDependents('/src/utils.ts');
            expect(transitive).toContain('/src/a.ts');
            expect(transitive).toContain('/src/b.ts');
            expect(transitive).toContain('/src/main.ts');
        });
    });
    describe('getSymbolIndex', () => {
        it('should return the symbol index', () => {
            builder.addFileContent('/src/main.ts', "export const foo = 1;");
            const index = builder.getSymbolIndex();
            expect(index).toBeDefined();
        });
    });
    describe('topologicalSort', () => {
        it('should return sorted order', () => {
            builder.addFileContent('/src/main.ts', "import { utils } from './utils';");
            builder.addFileContent('/src/utils.ts', "");
            const result = builder.topologicalSort();
            expect(result.hasCycles).toBe(false);
            expect(result.sorted.length).toBe(2);
        });
    });
});
describe('buildFileTree', () => {
    it('should build tree from file paths', () => {
        const tree = (0, tree_1.buildFileTree)([
            '/src/main.ts',
            '/src/utils.ts',
            '/tests/main.test.ts',
        ]);
        expect(tree.name).toBe('/');
        expect(tree.children).toBeDefined();
        // Should have src and tests directories
        const hasSrcDir = tree.children.some(c => c.name === 'src');
        expect(hasSrcDir).toBe(true);
    });
    it('should handle metadata', () => {
        const metadata = new Map([
            ['/src/main.ts', { size: 100 }],
        ]);
        const tree = (0, tree_1.buildFileTree)(['/src/main.ts'], metadata);
        // Find the main.ts node
        const srcDir = tree.children.find(c => c.name === 'src');
        const mainNode = srcDir?.children?.find(c => c.name === 'main.ts');
        expect(mainNode.metadata).toEqual({ size: 100 });
    });
});
describe('formatTreeAsString', () => {
    it('should format tree as string', () => {
        const tree = (0, tree_1.buildFileTree)(['/src/main.ts', '/src/utils.ts']);
        const output = (0, tree_1.formatTreeAsString)(tree);
        expect(output).toContain('src/');
        expect(output).toContain('main.ts');
        expect(output).toContain('utils.ts');
    });
    it('should handle max depth', () => {
        const tree = (0, tree_1.buildFileTree)(['/src/components/Button.tsx']);
        const output = (0, tree_1.formatTreeAsString)(tree, '', true, 1);
        expect(output).toContain('src/');
        expect(output).not.toContain('Button.tsx');
    });
    it('should show directory markers', () => {
        const tree = (0, tree_1.buildFileTree)(['/src/main.ts']);
        const output = (0, tree_1.formatTreeAsString)(tree);
        expect(output).toContain('src/');
    });
});
describe('detectLanguage', () => {
    it('should detect TypeScript', () => {
        expect((0, tree_1.detectLanguage)('test.ts')).toBe('typescript');
        expect((0, tree_1.detectLanguage)('test.tsx')).toBe('typescript');
    });
    it('should detect JavaScript', () => {
        expect((0, tree_1.detectLanguage)('test.js')).toBe('javascript');
    });
    it('should detect Python', () => {
        expect((0, tree_1.detectLanguage)('test.py')).toBe('python');
    });
    it('should detect Rust', () => {
        expect((0, tree_1.detectLanguage)('test.rs')).toBe('rust');
    });
    it('should detect Go', () => {
        expect((0, tree_1.detectLanguage)('test.go')).toBe('go');
    });
    it('should return null for unknown extensions', () => {
        expect((0, tree_1.detectLanguage)('test.xyz')).toBeNull();
    });
});
//# sourceMappingURL=tree.test.js.map