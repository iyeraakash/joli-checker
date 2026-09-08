import type { JobCollector } from "../collectors/types.js";
import type { NormalizedJob } from "../domain/job.js";

import { createJobSetHash } from "./job-set-hash.js";


type SourceHealthRow = {
  activeJobSetHash: string | null;
  lastSuccessfulScanAt: string | null;
  jobsReturned: number;
};


type StoredJobRow = {
  id: number;
  externalJobId: string;

  title: string;
  location: string | null;
  jobUrl: string;

  employerPostedAt: string | null;
  postedPrecision: string;
  freshnessConfidence: string;

  isActive: number;
};


export type CompanyScanResult = {
  companyId: string;

  status:
    | "SUCCESS"
    | "WARNING"
    | "ERROR";

  totalJobs: number;

  newJobs: number;
  updatedJobs: number;
  reappearedJobs: number;
  removedJobs: number;

  sourceChanged: boolean;

  warnings: string[];

  error?: string;
};


type DeduplicationResult = {
  jobs: NormalizedJob[];
  duplicateCount: number;
};


function deduplicateJobs(
  jobs: NormalizedJob[],
): DeduplicationResult {
  const jobsById =
    new Map<string, NormalizedJob>();

  for (const job of jobs) {
    jobsById.set(
      job.externalJobId,
      job,
    );
  }

  return {
    jobs: Array.from(
      jobsById.values(),
    ),

    duplicateCount:
      jobs.length - jobsById.size,
  };
}


function hasMetadataChanged(
  stored: StoredJobRow,
  current: NormalizedJob,
): boolean {
  return (
    stored.title !== current.title ||
    stored.location !== current.location ||
    stored.jobUrl !== current.jobUrl ||
    stored.employerPostedAt !==
      current.employerPostedAt ||
    stored.postedPrecision !==
      current.postedPrecision ||
    stored.freshnessConfidence !==
      current.freshnessConfidence
  );
}


function getErrorMessage(
  error: unknown,
): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}


export async function runCompanyScan(
  db: D1Database,
  companyId: string,
  collector: JobCollector,
): Promise<CompanyScanResult> {
  const startedAt =
    new Date().toISOString();


  /*
   * Record that a scan started.
   */
  const scanRun = await db
    .prepare(`
      INSERT INTO scan_runs (
        company_id,
        started_at,
        status,
        jobs_returned
      )
      VALUES (?, ?, 'RUNNING', 0)
      RETURNING id
    `)
    .bind(
      companyId,
      startedAt,
    )
    .first<{ id: number }>();


  if (!scanRun) {
    throw new Error(
      `Unable to create scan run for ${companyId}`,
    );
  }


  const scanRunId = scanRun.id;


  try {
    /*
     * 1. FETCH + NORMALIZE
     */
    const collectorResult =
      await collector.collect();


    /*
     * Defensive deduplication.
     *
     * Even though the source should give
     * unique IDs, we do not blindly trust it.
     */
    const deduplicated =
      deduplicateJobs(
        collectorResult.jobs,
      );

    const jobs =
      deduplicated.jobs;


    const warnings = [
      ...collectorResult.warnings,
    ];


    if (
      deduplicated.duplicateCount > 0
    ) {
      warnings.push(
        `Collector returned ` +
          `${deduplicated.duplicateCount} ` +
          `duplicate job IDs.`,
      );
    }


    /*
     * Read the previous source state.
     */
    const sourceHealth = await db
      .prepare(`
        SELECT
          active_job_set_hash
            AS activeJobSetHash,

          last_successful_scan_at
            AS lastSuccessfulScanAt,

          jobs_returned
            AS jobsReturned

        FROM source_health

        WHERE company_id = ?

        LIMIT 1
      `)
      .bind(companyId)
      .first<SourceHealthRow>();


    /*
     * SAFETY GUARD
     *
     * If a source previously returned jobs
     * and suddenly returns zero, do NOT
     * mark every job removed automatically.
     *
     * A parser/API/source failure could look
     * exactly like "zero jobs".
     */
    if (
      jobs.length === 0 &&
      sourceHealth !== null &&
      sourceHealth.jobsReturned > 0
    ) {
      const finishedAt =
        new Date().toISOString();

      const warning =
        `Collector returned 0 jobs after ` +
        `the previous scan returned ` +
        `${sourceHealth.jobsReturned}. ` +
        `Existing job state was preserved.`;

      warnings.push(warning);


      await db.batch([
        db
          .prepare(`
            UPDATE scan_runs

            SET
              finished_at = ?,
              status = 'WARNING',
              jobs_returned = 0,
              error_message = ?

            WHERE id = ?
          `)
          .bind(
            finishedAt,
            warning,
            scanRunId,
          ),

        db
          .prepare(`
            INSERT INTO source_health (
              company_id,
              last_scan_at,
              status,
              jobs_returned,
              warning_message,
              error_message,
              updated_at
            )
            VALUES (
              ?, ?, 'WARNING', 0, ?, NULL, ?
            )

            ON CONFLICT (company_id)
            DO UPDATE SET
              last_scan_at =
                excluded.last_scan_at,

              status = 'WARNING',

              jobs_returned = 0,

              warning_message =
                excluded.warning_message,

              error_message = NULL,

              updated_at =
                excluded.updated_at
          `)
          .bind(
            companyId,
            finishedAt,
            warning,
            finishedAt,
          ),
      ]);


      return {
        companyId,
        status: "WARNING",

        totalJobs: 0,

        newJobs: 0,
        updatedJobs: 0,
        reappearedJobs: 0,
        removedJobs: 0,

        sourceChanged: false,

        warnings,
      };
    }


    /*
     * 2. SOURCE FINGERPRINT
     */
    const jobSetHash =
      await createJobSetHash(jobs);


    const sourceChanged =
      sourceHealth?.activeJobSetHash
        !== jobSetHash;


    const finishedAt =
      new Date().toISOString();


    const warningMessage =
      warnings.length > 0
        ? warnings.join(" | ")
        : null;


    const scanStatus:
      | "SUCCESS"
      | "WARNING" =
      warnings.length > 0
        ? "WARNING"
        : "SUCCESS";


    /*
     * 3. FAST PATH
     *
     * If the source fingerprint is
     * identical to the previous scan,
     * don't rewrite every job row.
     */
    if (!sourceChanged) {
      await db.batch([
        db
          .prepare(`
            UPDATE scan_runs

            SET
              finished_at = ?,
              status = ?,
              jobs_returned = ?,
              error_message = ?

            WHERE id = ?
          `)
          .bind(
            finishedAt,
            scanStatus,
            jobs.length,
            warningMessage,
            scanRunId,
          ),

        db
          .prepare(`
            INSERT INTO source_health (
              company_id,
              last_scan_at,
              last_successful_scan_at,
              status,
              jobs_returned,
              warning_message,
              error_message,
              updated_at,
              active_job_set_hash
            )
            VALUES (
              ?, ?, ?, ?, ?, ?, NULL, ?, ?
            )

            ON CONFLICT (company_id)
            DO UPDATE SET
              last_scan_at =
                excluded.last_scan_at,

              last_successful_scan_at =
                excluded.last_successful_scan_at,

              status =
                excluded.status,

              jobs_returned =
                excluded.jobs_returned,

              warning_message =
                excluded.warning_message,

              error_message = NULL,

              updated_at =
                excluded.updated_at,

              active_job_set_hash =
                excluded.active_job_set_hash
          `)
          .bind(
            companyId,
            finishedAt,
            finishedAt,
            scanStatus,
            jobs.length,
            warningMessage,
            finishedAt,
            jobSetHash,
          ),
      ]);


      return {
        companyId,
        status: scanStatus,

        totalJobs: jobs.length,

        newJobs: 0,
        updatedJobs: 0,
        reappearedJobs: 0,
        removedJobs: 0,

        sourceChanged: false,

        warnings,
      };
    }


    /*
     * 4. CHANGE PATH
     *
     * Something changed in the source.
     * Load the existing jobs and determine
     * exactly what changed.
     */
    const storedResult = await db
      .prepare(`
        SELECT
          id,

          external_job_id
            AS externalJobId,

          title,

          location,

          job_url
            AS jobUrl,

          employer_posted_at
            AS employerPostedAt,

          posted_precision
            AS postedPrecision,

          freshness_confidence
            AS freshnessConfidence,

          is_active
            AS isActive

        FROM jobs

        WHERE company_id = ?
      `)
      .bind(companyId)
      .all<StoredJobRow>();


    const storedJobs =
      new Map<string, StoredJobRow>();


    for (
      const storedJob
      of storedResult.results
    ) {
      storedJobs.set(
        storedJob.externalJobId,
        storedJob,
      );
    }


    const currentJobIds =
      new Set(
        jobs.map(
          (job) =>
            job.externalJobId,
        ),
      );


    /*
     * NEW
     */
    const newJobs =
      jobs.filter((job) => {
        return !storedJobs.has(
          job.externalJobId,
        );
      });


    /*
     * REAPPEARED
     *
     * We knew about this job before,
     * but it was inactive.
     */
    const reappearedJobs =
      jobs.filter((job) => {
        const stored =
          storedJobs.get(
            job.externalJobId,
          );

        return (
          stored !== undefined &&
          stored.isActive === 0
        );
      });


    /*
     * UPDATED
     *
     * Same active employer job,
     * but metadata changed.
     */
    const updatedJobs =
      jobs.filter((job) => {
        const stored =
          storedJobs.get(
            job.externalJobId,
          );

        if (
          stored === undefined ||
          stored.isActive === 0
        ) {
          return false;
        }

        return hasMetadataChanged(
          stored,
          job,
        );
      });


    /*
     * REMOVED
     *
     * Previously active but absent
     * from the current source result.
     */
    const removedJobs =
      storedResult.results.filter(
        (stored) => {
          return (
            stored.isActive === 1 &&
            !currentJobIds.has(
              stored.externalJobId,
            )
          );
        },
      );


    /*
     * Jobs that need INSERT or UPDATE.
     *
     * Existing unchanged active jobs do
     * not need writes.
     */
    const jobsToUpsert = [
      ...newJobs,
      ...reappearedJobs,
      ...updatedJobs,
    ];


    const statements:
      D1PreparedStatement[] = [];


    /*
     * 5. INSERT / UPDATE CHANGED JOBS
     *
     * Send the jobs as one JSON parameter
     * and expand them using SQLite
     * json_each().
     */
    if (jobsToUpsert.length > 0) {
      statements.push(
        db
          .prepare(`
            INSERT INTO jobs (
              company_id,
              external_job_id,
              title,
              location,
              description,
              job_url,
              employer_posted_at,
              posted_precision,
              freshness_confidence,
              first_seen_at,
              last_seen_at,
              reappeared_at,
              is_active,
              created_at,
              updated_at
            )

            SELECT
              ?,
              json_extract(
                value,
                '$.externalJobId'
              ),

              json_extract(
                value,
                '$.title'
              ),

              json_extract(
                value,
                '$.location'
              ),

              NULL,

              json_extract(
                value,
                '$.jobUrl'
              ),

              json_extract(
                value,
                '$.employerPostedAt'
              ),

              json_extract(
                value,
                '$.postedPrecision'
              ),

              json_extract(
                value,
                '$.freshnessConfidence'
              ),

              ?,
              ?,
              NULL,
              1,
              ?,
              ?

            FROM json_each(?)

            WHERE true

            ON CONFLICT (
              company_id,
              external_job_id
            )
            DO UPDATE SET

              title =
                excluded.title,

              location =
                excluded.location,

              job_url =
                excluded.job_url,

              employer_posted_at =
                excluded.employer_posted_at,

              posted_precision =
                excluded.posted_precision,

              freshness_confidence =
                excluded.freshness_confidence,

              last_seen_at =
                excluded.last_seen_at,

              reappeared_at =
                CASE
                  WHEN jobs.is_active = 0
                  THEN excluded.last_seen_at
                  ELSE jobs.reappeared_at
                END,

              is_active = 1,

              updated_at =
                excluded.updated_at
          `)
          .bind(
            companyId,

            finishedAt,
            finishedAt,

            finishedAt,
            finishedAt,

            JSON.stringify(
              jobsToUpsert,
            ),
          ),
      );
    }


    /*
     * 6. MARK REMOVED JOBS INACTIVE
     *
     * A job absent from this scan was
     * last definitely seen during the
     * previous successful scan.
     */
    if (removedJobs.length > 0) {
      const removedJobIds =
        removedJobs.map(
          (job) =>
            job.externalJobId,
        );


      const previousSeenAt =
        sourceHealth
          ?.lastSuccessfulScanAt
        ?? startedAt;


      statements.push(
        db
          .prepare(`
            UPDATE jobs

            SET
              is_active = 0,
              last_seen_at = ?,
              updated_at = ?

            WHERE
              company_id = ?

              AND external_job_id IN (
                SELECT value
                FROM json_each(?)
              )
          `)
          .bind(
            previousSeenAt,
            finishedAt,
            companyId,

            JSON.stringify(
              removedJobIds,
            ),
          ),
      );
    }


    /*
     * 7. OBSERVE NEW / UPDATED /
     * REAPPEARED JOBS
     */
    if (jobsToUpsert.length > 0) {
      const observedJobIds =
        jobsToUpsert.map(
          (job) =>
            job.externalJobId,
        );


      statements.push(
        db
          .prepare(`
            INSERT INTO job_observations (
              job_id,
              scan_run_id,
              observed_at,
              was_active,
              employer_posted_at,
              posted_precision,
              raw_location
            )

            SELECT
              id,
              ?,
              ?,
              1,
              employer_posted_at,
              posted_precision,
              location

            FROM jobs

            WHERE
              company_id = ?

              AND external_job_id IN (
                SELECT value
                FROM json_each(?)
              )
          `)
          .bind(
            scanRunId,
            finishedAt,
            companyId,

            JSON.stringify(
              observedJobIds,
            ),
          ),
      );
    }


    /*
     * 8. OBSERVE REMOVALS
     */
    if (removedJobs.length > 0) {
      const removedJobIds =
        removedJobs.map(
          (job) =>
            job.externalJobId,
        );


      statements.push(
        db
          .prepare(`
            INSERT INTO job_observations (
              job_id,
              scan_run_id,
              observed_at,
              was_active,
              employer_posted_at,
              posted_precision,
              raw_location
            )

            SELECT
              id,
              ?,
              ?,
              0,
              employer_posted_at,
              posted_precision,
              location

            FROM jobs

            WHERE
              company_id = ?

              AND external_job_id IN (
                SELECT value
                FROM json_each(?)
              )
          `)
          .bind(
            scanRunId,
            finishedAt,
            companyId,

            JSON.stringify(
              removedJobIds,
            ),
          ),
      );
    }


    /*
     * 9. FINISH SCAN
     */
    statements.push(
      db
        .prepare(`
          UPDATE scan_runs

          SET
            finished_at = ?,
            status = ?,
            jobs_returned = ?,
            error_message = ?

          WHERE id = ?
        `)
        .bind(
          finishedAt,
          scanStatus,
          jobs.length,
          warningMessage,
          scanRunId,
        ),
    );


    /*
     * 10. UPDATE SOURCE HEALTH
     */
    statements.push(
      db
        .prepare(`
          INSERT INTO source_health (
            company_id,
            last_scan_at,
            last_successful_scan_at,
            status,
            jobs_returned,
            warning_message,
            error_message,
            updated_at,
            active_job_set_hash
          )

          VALUES (
            ?, ?, ?, ?, ?, ?, NULL, ?, ?
          )

          ON CONFLICT (company_id)
          DO UPDATE SET

            last_scan_at =
              excluded.last_scan_at,

            last_successful_scan_at =
              excluded.last_successful_scan_at,

            status =
              excluded.status,

            jobs_returned =
              excluded.jobs_returned,

            warning_message =
              excluded.warning_message,

            error_message = NULL,

            updated_at =
              excluded.updated_at,

            active_job_set_hash =
              excluded.active_job_set_hash
        `)
        .bind(
          companyId,

          finishedAt,
          finishedAt,

          scanStatus,

          jobs.length,

          warningMessage,

          finishedAt,

          jobSetHash,
        ),
    );


    /*
     * D1 executes these sequentially
     * as a transactional batch.
     */
    await db.batch(statements);


    return {
      companyId,
      status: scanStatus,

      totalJobs:
        jobs.length,

      newJobs:
        newJobs.length,

      updatedJobs:
        updatedJobs.length,

      reappearedJobs:
        reappearedJobs.length,

      removedJobs:
        removedJobs.length,

      sourceChanged: true,

      warnings,
    };
  } catch (error) {
    /*
     * FAILURE PATH
     *
     * A collector or persistence failure
     * must be visible in both scan history
     * and source health.
     */
    const finishedAt =
      new Date().toISOString();


    const errorMessage =
      getErrorMessage(error);


    await db.batch([
      db
        .prepare(`
          UPDATE scan_runs

          SET
            finished_at = ?,
            status = 'ERROR',
            error_message = ?

          WHERE id = ?
        `)
        .bind(
          finishedAt,
          errorMessage,
          scanRunId,
        ),

      db
        .prepare(`
          INSERT INTO source_health (
            company_id,
            last_scan_at,
            status,
            jobs_returned,
            warning_message,
            error_message,
            updated_at
          )

          VALUES (
            ?, ?, 'ERROR', 0, NULL, ?, ?
          )

          ON CONFLICT (company_id)
          DO UPDATE SET

            last_scan_at =
              excluded.last_scan_at,

            status = 'ERROR',

            jobs_returned = 0,

            warning_message = NULL,

            error_message =
              excluded.error_message,

            updated_at =
              excluded.updated_at
        `)
        .bind(
          companyId,
          finishedAt,
          errorMessage,
          finishedAt,
        ),
    ]);


    return {
      companyId,
      status: "ERROR",

      totalJobs: 0,

      newJobs: 0,
      updatedJobs: 0,
      reappearedJobs: 0,
      removedJobs: 0,

      sourceChanged: false,

      warnings: [],

      error: errorMessage,
    };
  }
}