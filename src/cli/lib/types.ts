/**
 * CLI Types
 */

import { Command } from 'commander';

export interface RegisterCommandsOptions {
  format?: 'table' | 'json' | 'jsonl';
  verbose?: boolean;
}

export type RegisterCommandsFn = (program: Command, options?: RegisterCommandsOptions) => void;
