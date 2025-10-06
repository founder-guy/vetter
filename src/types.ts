import { z } from 'zod';

// Grade types
export type Grade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

// Package identifier parsed from user input
export interface PackageIdentifier {
  name: string;
  version?: string;
}

// Security status from audit
export type SecurityStatus = 'clean' | 'vulnerable' | 'unknown';

export interface VulnerabilitySummary {
  critical: number;
  high: number;
  moderate: number;
  low: number;
  info: number;
  total: number;
}

export interface SecurityAnalysis {
  status: SecurityStatus;
  vulnerabilities: VulnerabilitySummary;
  auditError?: string;
}

// License category classification
export type LicenseCategory =
  | 'permissive'
  | 'weak-copyleft'
  | 'strong-copyleft'
  | 'network-copyleft'
  | 'proprietary'
  | 'deprecated'
  | 'unlicensed'
  | 'unknown';

// License analysis result
export interface LicenseInfo {
  raw?: string;
  category: LicenseCategory;
  normalizedSpdx?: string;
}

// Package snapshot from registry
export interface PackageSnapshot {
  name: string;
  version: string;
  publishedAt: Date;
  maintainers: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  unpackedSize?: number;
  description?: string;
  license?: string;
}

// Metrics derived from package data
export interface PackageMetrics {
  daysSincePublish: number;
  maintainerCount: number;
  directDependencyCount: number;
  totalDependencyCount: number;
  approximateSizeMB: number;
}

// Scoring result
export interface ScoreResult {
  grade: Grade;
  score: number;
  penalties: Penalty[];
}

export interface Penalty {
  reason: string;
  severity: 'high' | 'medium' | 'low';
  gradeDeduction: number;
}

// Dependency breakdown entry
export interface DependencyBreakdown {
  name: string;
  version: string;
  transitiveCount: number; // Number of transitive deps this package pulls in
}

// Complete analysis result
export interface AnalysisResult {
  package: PackageSnapshot;
  metrics: PackageMetrics;
  security: SecurityAnalysis;
  license: LicenseInfo;
  score: ScoreResult;
  dependencyBreakdown?: DependencyBreakdown[]; // Optional, only if lockfile available
}

// Workspace for shared temp directory and lockfile
export interface PackageLockEntry {
  version?: string;
  resolved?: string;
  integrity?: string;
  dependencies?: Record<string, string | PackageLockEntry>;
  requires?: Record<string, string>;
  [key: string]: unknown;
}

export interface PackageLockfileData {
  lockfileVersion?: number; // 1, 2, or 3
  packages?: Record<string, PackageLockEntry>; // v2/v3 format
  dependencies?: Record<string, PackageLockEntry>; // v1 format
}

export interface Workspace {
  dir: string;
  lockfile?: PackageLockfileData;
  cleanup: () => Promise<void>;
  installError?: string;
}

// Service options for accepting workspace
export interface SecurityAnalysisOptions {
  workspace?: Workspace;
}

export interface MetricsCalculationOptions {
  workspace?: Workspace;
}

// CLI options
export interface InstallOptions {
  json?: boolean;
  install?: boolean; // Commander sets this to false when --no-install is used
  failOnGrade?: Grade;
  version?: string;
  cache?: boolean; // Commander sets this to false when --no-cache is used
  refresh?: boolean;
  deps?: boolean; // Show dependency breakdown
}

// Zod schemas for validation
export const VulnerabilitySummarySchema = z.object({
  critical: z.number(),
  high: z.number(),
  moderate: z.number(),
  low: z.number(),
  info: z.number(),
  total: z.number(),
});

export const AuditResponseSchema = z.object({
  vulnerabilities: z.record(z.any()).optional(),
  metadata: z
    .object({
      vulnerabilities: VulnerabilitySummarySchema.optional(),
    })
    .optional(),
});
