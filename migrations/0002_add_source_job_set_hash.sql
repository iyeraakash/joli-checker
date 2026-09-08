-- Migration number: 0002 	 2026-09-08T00:22:31.574Z
ALTER TABLE source_health
ADD COLUMN active_job_set_hash TEXT;