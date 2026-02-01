"use strict";
/**
 * Dependency Graph Tests
 * Tests for dependency graph building and analysis
 */
Object.defineProperty(exports, "__esModule", { value: true });
const dependencies_1 = require("../../src/context/dependencies");
describe('DependencyGraphBuilder', () => {
    let builder;
    beforeEach(() => {
        builder = new dependencies_1.DependencyGraphBuilder();
    });
    describe('Basic Operations', () => {
        test('adds files to graph', () => {
            builder.addFile('/src/main.ts', "import { foo } from './utils';");
            builder.addFile('/src/utils.ts', "export const foo = 'bar';");
            const graph = builder.build();
            expect(graph.nodes.size).toBe(2);
            expect(graph.edges.length).toBe(1);
        });
        test('tracks dependencies correctly', () => {
            builder.addFile('/src/main.ts', "import A from './a'; import B from './b';");
            builder.addFile('/src/a.ts', '');
            builder.addFile('/src/b.ts', '');
            const deps = builder.getDependencies('/src/main.ts');
            expect(deps).toContain('./a');
            expect(deps).toContain('./b');
        });
        test('tracks dependents correctly', () => {
            builder.addFile('/src/main.ts', '');
            builder.addFile('/src/a.ts', "import '../main';");
            builder.addFile('/src/b.ts', "import '../main';");
            const dependents = builder.getDependents('/src/main.ts');
            expect(dependents).toContain('./a');
            expect(dependents).toContain('./b');
        });
    });
    describe('Circular Dependency Detection', () => {
        test('detects simple cycle', () => {
            builder.addFile('/src/a.ts', "import './b';");
            builder.addFile('/src/b.ts', "import './a';");
            const cycles = builder.detectCycles();
            expect(cycles.length).toBeGreaterThan(0);
        });
        test('detects multi-file cycle', () => {
            builder.addFile('/src/a.ts', "import './b';");
            builder.addFile('/src/b.ts', "import './c';");
            builder.addFile('/src/c.ts', "import './a';");
            const cycles = builder.detectCycles();
            expect(cycles.length).toBeGreaterThan(0);
            // cycles[0] is a string[] representing the cycle path
            const cyclePath = cycles.cycles[0];
            expect(cyclePath).toContain('/src/a.ts');
            expect(cyclePath).toContain('/src/b.ts');
            expect(cyclePath).toContain('/src/c.ts');
        });
        test('handles acyclic graphs', () => {
            builder.addFile('/src/main.ts', "import './a'; import './b';");
            builder.addFile('/src/a.ts', '');
            builder.addFile('/src/b.ts', '');
            const cycles = builder.detectCycles();
            expect(cycles.length).toBe(0);
        });
        test('does not report self-dependency as cycle', () => {
            builder.addFile('/src/main.ts', "import './main';");
            const cycles = builder.detectCycles();
            // Self-imports are not considered circular dependencies in this context
            expect(cycles.length).toBe(0);
        });
    });
    describe('Topological Sort', () => {
        test('returns valid topological order', () => {
            builder.addFile('/src/main.ts', "import './a'; import './b';");
            builder.addFile('/src/a.ts', '');
            builder.addFile('/src/b.ts', '');
            const sorted = builder.getTopologicalSort();
            expect(sorted.length).toBe(3);
            // main should come after its dependencies
            const mainIndex = sorted.indexOf('/src/main.ts');
            const aIndex = sorted.indexOf('/src/a.ts');
            const bIndex = sorted.indexOf('/src/b.ts');
            expect(mainIndex).toBeGreaterThan(aIndex);
            expect(mainIndex).toBeGreaterThan(bIndex);
        });
        test('handles disconnected components', () => {
            builder.addFile('/src/a.ts', '');
            builder.addFile('/src/b.ts', '');
            const sorted = builder.getTopologicalSort();
            expect(sorted.length).toBe(2);
        });
    });
    describe('Longest Chain', () => {
        test('finds longest dependency chain', () => {
            builder.addFile('/src/main.ts', "import './a';");
            builder.addFile('/src/a.ts', "import './b';");
            builder.addFile('/src/b.ts', "import './c';");
            builder.addFile('/src/d.ts', '');
            const chain = builder.getLongestChain();
            expect(chain.length).toBe(4); // main -> a -> b -> c
        });
    });
    describe('Statistics', () => {
        test('calculates correct statistics', () => {
            builder.addFile('/src/main.ts', "import './a'; import './b';");
            builder.addFile('/src/a.ts', '');
            builder.addFile('/src/b.ts', '');
            builder.addFile('/src/c.ts', '');
            const stats = builder.getStatistics();
            expect(stats.totalFiles).toBe(4);
            expect(stats.totalEdges).toBe(2);
            expect(stats.orphans).toBe(1); // c has no deps and no dependents
        });
        test('counts cyclic dependencies', () => {
            builder.addFile('/src/a.ts', "import './b';");
            builder.addFile('/src/b.ts', "import './a';");
            const stats = builder.getStatistics();
            expect(stats.cyclicDependencies).toBeGreaterThan(0);
        });
    });
});
describe('Dependency Health Analysis', () => {
    test('analyzes dependency health', () => {
        const files = [
            { path: '/src/main.ts', content: "import './a';" },
            { path: '/src/a.ts', content: '' },
        ];
        const health = (0, dependencies_1.analyzeDependencyHealth)(files);
        expect(health.statistics.totalFiles).toBe(2);
        expect(health.statistics.totalEdges).toBe(1);
        expect(Array.isArray(health.cycles)).toBe(true);
        expect(Array.isArray(health.recommendations)).toBe(true);
    });
    test('provides recommendations for orphans', () => {
        const files = [
            { path: '/src/main.ts', content: '' },
            { path: '/src/unused.ts', content: '' },
        ];
        const health = (0, dependencies_1.analyzeDependencyHealth)(files);
        expect(health.recommendations.some(r => r.includes('isolated'))).toBe(true);
    });
    test('provides recommendations for deep chains', () => {
        const files = [
            { path: '/src/a.ts', content: "import './b';" },
            { path: '/src/b.ts', content: "import './c';" },
            { path: '/src/c.ts', content: "import './d';" },
            { path: '/src/d.ts', content: "import './e';" },
            { path: '/src/e.ts', content: "import './f';" },
            { path: '/src/f.ts', content: "import './g';" },
            { path: '/src/g.ts', content: "import './h';" },
            { path: '/src/h.ts', content: "import './i';" },
            { path: '/src/i.ts', content: "import './j';" },
            { path: '/src/j.ts', content: "import './k';" },
            { path: '/src/k.ts', content: '' },
        ];
        const health = (0, dependencies_1.analyzeDependencyHealth)(files);
        expect(health.recommendations.some(r => r.includes('chain'))).toBe(true);
    });
});
describe('File Dependencies', () => {
    test('gets dependencies for specific file', () => {
        const files = [
            { path: '/src/main.ts', content: "import './utils';" },
            { path: '/src/utils.ts', content: '' },
        ];
        const result = (0, dependencies_1.getFileDependencies)(files, '/src/main.ts');
        expect(result.dependencies).toContain('./utils');
        expect(result.dependents).toEqual([]);
    });
    test('gets dependents for specific file', () => {
        const files = [
            { path: '/src/main.ts', content: '' },
            { path: '/src/a.ts', content: "import '../main';" },
        ];
        const result = (0, dependencies_1.getFileDependencies)(files, '/src/main.ts');
        expect(result.dependents).toContain('../main');
        expect(result.dependencies).toEqual([]);
    });
    test('handles non-existent file', () => {
        const files = [
            { path: '/src/main.ts', content: '' },
        ];
        const result = (0, dependencies_1.getFileDependencies)(files, '/src/nonexistent.ts');
        expect(result.dependencies).toEqual([]);
        expect(result.dependents).toEqual([]);
    });
});
describe('Dependency Graph Structure', () => {
    test('returns valid graph structure', () => {
        const files = [
            { path: '/src/main.ts', content: "import './a';" },
            { path: '/src/a.ts', content: '' },
        ];
        const builder = new dependencies_1.DependencyGraphBuilder();
        for (const f of files) {
            builder.addFile(f.path, f.content);
        }
        const graph = builder.build();
        expect(graph.nodes).toBeInstanceOf(Map);
        expect(graph.edges).toBeInstanceOf(Array);
        expect(graph.edges[0]).toBeInstanceOf(Array);
        expect(graph.edges[0].length).toBe(2);
    });
    test('handles complex dependency structures', () => {
        const files = [
            { path: '/src/main.ts', content: "import './a'; import './b';" },
            { path: '/src/a.ts', content: "import './c';" },
            { path: '/src/b.ts', content: "import './c';" },
            { path: '/src/c.ts', content: '' },
        ];
        const builder = new dependencies_1.DependencyGraphBuilder();
        for (const f of files) {
            builder.addFile(f.path, f.content);
        }
        const graph = builder.build();
        expect(graph.nodes.size).toBe(4);
        // main->a, main->b, a->c, b->c
        expect(graph.edges.length).toBe(4);
    });
});
describe('Edge Cases', () => {
    let builder;
    beforeEach(() => {
        builder = new dependencies_1.DependencyGraphBuilder();
    });
    test('handles files with no dependencies', () => {
        builder.addFile('/src/main.ts', 'const x = 1;');
        const deps = builder.getDependencies('/src/main.ts');
        const stats = builder.getStatistics();
        expect(deps).toEqual([]);
        expect(stats.totalEdges).toBe(0);
    });
    test('handles files with metadata override', () => {
        builder.addFile('/src/main.ts', '', { imports: ['./utils', './helpers'], exports: ['main'] });
        const deps = builder.getDependencies('/src/main.ts');
        expect(deps).toContain('./utils');
        expect(deps).toContain('./helpers');
    });
    test('handles empty graph', () => {
        const stats = builder.getStatistics();
        expect(stats.totalFiles).toBe(0);
        expect(stats.totalEdges).toBe(0);
        expect(stats.cyclicDependencies).toBe(0);
    });
});
//# sourceMappingURL=dependencies.test.js.map