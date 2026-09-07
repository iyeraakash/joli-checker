-- Migration number: 0001 	 2026-09-07T16:38:51.393Z
CREATE TABLE companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    careers_url TEXT NOT NULL,
    collector_type TEXT NOT NULL,
    priority_tier TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE scan_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id TEXT NOT NULL,

    started_at TEXT NOT NULL,
    finished_at TEXT,

    status TEXT NOT NULL,
    jobs_returned INTEGER NOT NULL DEFAULT 0
        CHECK (jobs_returned >= 0),

    error_message TEXT,

    FOREIGN KEY (company_id)
        REFERENCES companies(id)
);


CREATE TABLE jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    company_id TEXT NOT NULL,
    external_job_id TEXT NOT NULL,

    title TEXT NOT NULL,
    location TEXT,
    description TEXT,
    job_url TEXT NOT NULL,

    employer_posted_at TEXT,

    posted_precision TEXT NOT NULL DEFAULT 'UNKNOWN'
        CHECK (
            posted_precision IN (
                'EXACT_TIMESTAMP',
                'DATE_ONLY',
                'RELATIVE_TIME',
                'UNKNOWN'
            )
        ),

    freshness_confidence TEXT NOT NULL DEFAULT 'UNKNOWN'
        CHECK (
            freshness_confidence IN (
                'HIGH',
                'MEDIUM',
                'LOW',
                'UNKNOWN'
            )
        ),

    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    reappeared_at TEXT,

    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (company_id)
        REFERENCES companies(id),

    UNIQUE (company_id, external_job_id)
);


CREATE TABLE job_observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    job_id INTEGER NOT NULL,
    scan_run_id INTEGER NOT NULL,

    observed_at TEXT NOT NULL,

    was_active INTEGER NOT NULL DEFAULT 1
        CHECK (was_active IN (0, 1)),

    employer_posted_at TEXT,
    posted_precision TEXT,
    raw_location TEXT,

    FOREIGN KEY (job_id)
        REFERENCES jobs(id),

    FOREIGN KEY (scan_run_id)
        REFERENCES scan_runs(id),

    UNIQUE (job_id, scan_run_id)
);


CREATE TABLE source_health (
    company_id TEXT PRIMARY KEY,

    last_scan_at TEXT,
    last_successful_scan_at TEXT,

    status TEXT NOT NULL DEFAULT 'UNKNOWN',

    jobs_returned INTEGER NOT NULL DEFAULT 0
        CHECK (jobs_returned >= 0),

    warning_message TEXT,
    error_message TEXT,

    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (company_id)
        REFERENCES companies(id)
);


CREATE INDEX idx_scan_runs_company_started
    ON scan_runs(company_id, started_at);


CREATE INDEX idx_jobs_company
    ON jobs(company_id);


CREATE INDEX idx_jobs_first_seen
    ON jobs(first_seen_at);


CREATE INDEX idx_jobs_last_seen
    ON jobs(last_seen_at);


CREATE INDEX idx_jobs_active_first_seen
    ON jobs(is_active, first_seen_at);


CREATE INDEX idx_job_observations_job
    ON job_observations(job_id);


CREATE INDEX idx_job_observations_scan
    ON job_observations(scan_run_id);