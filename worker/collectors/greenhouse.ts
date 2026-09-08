import type {
  CollectorResult,
  JobCollector,
} from "./types.js";

import type {
  NormalizedJob,
} from "../domain/job.js";


type GreenhouseJob = {
  id: number;
  internal_job_id: number | null;
  title: string;

  location?: {
    name?: string | null;
  };

  absolute_url: string;

  updated_at?: string;
};


type GreenhouseJobsResponse = {
  jobs: GreenhouseJob[];

  meta?: {
    total?: number;
  };
};


export class GreenhouseCollector implements JobCollector {
  private readonly companyId: string;
  private readonly boardToken: string;

  constructor(companyId: string, boardToken: string) {
    this.companyId = companyId;
    this.boardToken = boardToken;
  }

  async collect(): Promise<CollectorResult> {
    const fetchedAt = new Date().toISOString();

    const url =
                `https://boards-api.greenhouse.io/v1/boards/` +
                `${encodeURIComponent(this.boardToken)}/jobs`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Greenhouse request failed for ${this.companyId}: ` +
        `${response.status} ${response.statusText}`,
      );
    }

    const payload =
      (await response.json()) as GreenhouseJobsResponse;

    if (!Array.isArray(payload.jobs)) {
      throw new Error(
        `Greenhouse returned an invalid jobs payload for ${this.companyId}`,
      );
    }

    const jobs: NormalizedJob[] = payload.jobs
      .filter((job) => job.internal_job_id !== null)
      .map((job) => ({
        companyId: this.companyId,
        externalJobId: String(job.id),
        title: job.title,
        location: job.location?.name?.trim() || null,
        description: null,
        jobUrl: job.absolute_url,
        employerPostedAt: null,
        postedPrecision: "UNKNOWN",
        freshnessConfidence: "UNKNOWN",
      }));

    return {
      jobs,
      fetchedAt,
      warnings: [],
    };
  }
}