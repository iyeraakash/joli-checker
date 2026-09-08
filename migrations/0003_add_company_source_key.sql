-- Migration number: 0003 	 2026-09-08T01:09:03.370Z
ALTER TABLE companies
ADD COLUMN source_key TEXT;


INSERT INTO companies (
    id,
    name,
    category,
    careers_url,
    collector_type,
    priority_tier,
    is_active,
    source_key
)
VALUES (
    'stripe',
    'Stripe',
    'FINTECH',
    'https://stripe.com/jobs/search',
    'GREENHOUSE',
    'A',
    1,
    'stripe'
)
ON CONFLICT (id)
DO UPDATE SET
    name = excluded.name,
    category = excluded.category,
    careers_url = excluded.careers_url,
    collector_type = excluded.collector_type,
    priority_tier = excluded.priority_tier,
    is_active = excluded.is_active,
    source_key = excluded.source_key,
    updated_at = CURRENT_TIMESTAMP;


INSERT INTO companies (
    id,
    name,
    category,
    careers_url,
    collector_type,
    priority_tier,
    is_active,
    source_key
)
VALUES (
    'amazon',
    'Amazon',
    'BIG_TECH',
    'https://www.amazon.jobs/',
    'AMAZON',
    'A',
    1,
    NULL
)
ON CONFLICT (id)
DO UPDATE SET
    name = excluded.name,
    category = excluded.category,
    careers_url = excluded.careers_url,
    collector_type = excluded.collector_type,
    priority_tier = excluded.priority_tier,
    is_active = excluded.is_active,
    source_key = excluded.source_key,
    updated_at = CURRENT_TIMESTAMP;