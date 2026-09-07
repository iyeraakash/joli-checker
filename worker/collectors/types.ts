import type { NormalizedJob } from "../domain/job.js";

export interface CollectorResult {
  jobs: NormalizedJob[];
  fetchedAt: string;
  warnings: string[];
}

export interface JobCollector {
  collect(): Promise<CollectorResult>;
}