/**
 * Agent 40-42: Storage Module Index
 * Unified storage interface for GCS, S3, and Local connectors
 */

export { GCSConnector, type GCSConfig, type ByteRangeRequest, type ByteRangeResponse } from './gcs-connector';
export { S3Connector, type S3Config, type MultipartUploadOptions } from './s3-connector';
export { LocalStorageConnector, type LocalStorageConfig } from './local-connector';

export type StorageConnector = 'gcs' | 's3' | 'local';

export interface UnifiedStorageConfig {
  type: StorageConnector;
  gcs?: import('./gcs-connector').GCSConfig;
  s3?: import('./s3-connector').S3Config;
  local?: import('./local-connector').LocalStorageConfig;
}

export interface StorageMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgLatencyMs: number;
  bytesTransferred: number;
}
