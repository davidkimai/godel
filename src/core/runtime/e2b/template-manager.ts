/**
 * Agent_3: E2B Template Manager
 * Manages sandbox templates with versioning and caching
 */

import { EventEmitter } from 'eventemitter3';

export interface Template {
  id: string;
  name: string;
  version: string;
  dockerfile: string;
  dependencies: string[];
  envVars: Record<string, string>;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    size: number;
    buildTime: number;
  };
}

export interface TemplateBuildConfig {
  name: string;
  dockerfile: string;
  context?: string;
  buildArgs?: Record<string, string>;
  cache?: boolean;
}

export interface TemplateCache {
  templateId: string;
  lastUsed: Date;
  useCount: number;
  hitRate: number;
}

export class TemplateManager extends EventEmitter {
  private templates: Map<string, Template> = new Map();
  private cacheStats: Map<string, TemplateCache> = new Map();
  private defaultTemplateId: string | null = null;

  constructor() {
    super();
    this.loadBuiltInTemplates();
  }

  private loadBuiltInTemplates(): void {
    // Default Python sandbox
    this.register({
      id: 'python-3.11-default',
      name: 'Python 3.11',
      version: '1.0.0',
      dockerfile: `FROM python:3.11-slim
WORKDIR /app
RUN pip install numpy pandas requests`,
      dependencies: ['numpy', 'pandas', 'requests'],
      envVars: { PYTHONPATH: '/app' },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        size: 150 * 1024 * 1024, // 150MB
        buildTime: 120000 // 2 minutes
      }
    });

    // Node.js sandbox
    this.register({
      id: 'node-20-default',
      name: 'Node.js 20',
      version: '1.0.0',
      dockerfile: `FROM node:20-slim
WORKDIR /app
RUN npm install -g typescript tsx`,
      dependencies: ['typescript', 'tsx', '@types/node'],
      envVars: { NODE_ENV: 'production' },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        size: 200 * 1024 * 1024, // 200MB
        buildTime: 90000 // 1.5 minutes
      }
    });

    // Full-stack sandbox
    this.register({
      id: 'fullstack-default',
      name: 'Full Stack (Node + Python)',
      version: '1.0.0',
      dockerfile: `FROM node:20-slim
RUN apt-get update && apt-get install -y python3 python3-pip
WORKDIR /app`,
      dependencies: ['typescript', 'tsx', 'numpy'],
      envVars: { NODE_ENV: 'production', PYTHONPATH: '/app' },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        size: 350 * 1024 * 1024, // 350MB
        buildTime: 180000 // 3 minutes
      }
    });

    this.defaultTemplateId = 'python-3.11-default';
  }

  register(template: Template): void {
    this.templates.set(template.id, template);
    this.emit('template:registered', { templateId: template.id, name: template.name });
  }

  get(templateId: string): Template | undefined {
    const template = this.templates.get(templateId);
    if (template) {
      this.recordCacheHit(templateId);
    }
    return template;
  }

  getDefault(): Template | undefined {
    return this.defaultTemplateId ? this.get(this.defaultTemplateId) : undefined;
  }

  setDefault(templateId: string): void {
    if (!this.templates.has(templateId)) {
      throw new Error(`Template ${templateId} not found`);
    }
    this.defaultTemplateId = templateId;
    this.emit('template:defaultChanged', { templateId });
  }

  list(): Template[] {
    return Array.from(this.templates.values());
  }

  async build(config: TemplateBuildConfig): Promise<Template> {
    this.emit('template:building', { name: config.name });

    const templateId = `custom-${Date.now()}`;
    const startTime = Date.now();

    // Simulate build process
    await this.simulateBuild(config);

    const template: Template = {
      id: templateId,
      name: config.name,
      version: '1.0.0',
      dockerfile: config.dockerfile,
      dependencies: [],
      envVars: {},
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        size: Math.floor(Math.random() * 500 * 1024 * 1024),
        buildTime: Date.now() - startTime
      }
    };

    this.register(template);
    this.emit('template:built', { templateId, duration: template.metadata.buildTime });

    return template;
  }

  private async simulateBuild(config: TemplateBuildConfig): Promise<void> {
    // Simulate Docker build time (100-500ms for tests)
    const buildTime = Math.floor(Math.random() * 400) + 100;
    await new Promise(resolve => setTimeout(resolve, buildTime));
  }

  delete(templateId: string): boolean {
    const deleted = this.templates.delete(templateId);
    if (deleted) {
      this.cacheStats.delete(templateId);
      this.emit('template:deleted', { templateId });
    }
    return deleted;
  }

  update(templateId: string, updates: Partial<Template>): Template | undefined {
    const existing = this.templates.get(templateId);
    if (!existing) return undefined;

    const updated: Template = {
      ...existing,
      ...updates,
      id: existing.id, // Prevent ID change
      metadata: {
        ...existing.metadata,
        ...updates.metadata,
        updatedAt: new Date()
      }
    };

    this.templates.set(templateId, updated);
    this.emit('template:updated', { templateId });
    return updated;
  }

  private recordCacheHit(templateId: string): void {
    let stats = this.cacheStats.get(templateId);
    if (!stats) {
      stats = {
        templateId,
        lastUsed: new Date(),
        useCount: 0,
        hitRate: 0
      };
      this.cacheStats.set(templateId, stats);
    }

    stats.lastUsed = new Date();
    stats.useCount++;
    stats.hitRate = (stats.useCount / (stats.useCount + 1)) * 100;
  }

  getCacheStats(): TemplateCache[] {
    return Array.from(this.cacheStats.values());
  }

  getMostUsed(limit: number = 5): Template[] {
    const sorted = Array.from(this.cacheStats.entries())
      .sort((a, b) => b[1].useCount - a[1].useCount)
      .slice(0, limit)
      .map(([id]) => this.templates.get(id))
      .filter((t): t is Template => t !== undefined);

    return sorted;
  }

  export(templateId: string): string | null {
    const template = this.templates.get(templateId);
    if (!template) return null;

    return JSON.stringify(template, null, 2);
  }

  async import(json: string): Promise<Template> {
    const template = JSON.parse(json) as Template;
    template.id = `imported-${Date.now()}`;
    template.metadata.createdAt = new Date();
    template.metadata.updatedAt = new Date();
    
    this.register(template);
    return template;
  }
}

export default TemplateManager;
