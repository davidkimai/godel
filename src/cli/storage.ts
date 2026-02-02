/**
 * CLI Storage Exports
 * 
 * Centralized storage exports for CLI commands.
 * Provides convenient access to storage singletons.
 */

import { MemoryStore } from '../storage/memory';

export const memoryStore = new MemoryStore();
export const agentStorage = memoryStore.agents;
export const taskStorage = memoryStore.tasks;
export const eventStorage = memoryStore.events;
