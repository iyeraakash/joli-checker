import type {
  CollectorResult,
  JobCollector,
} from "../collectors/types.js";

import type {
  NormalizedJob,
} from "../domain/job.js";


export class StaticCollector implements JobCollector {
  private readonly jobs: NormalizedJob[];

  constructor(jobs: NormalizedJob[]) {
    this.jobs = jobs;
  }

  async collect(): Promise<CollectorResult> {
    return {
      jobs: this.jobs,
      fetchedAt: new Date().toISOString(),
      warnings: [],
    };
  }
}