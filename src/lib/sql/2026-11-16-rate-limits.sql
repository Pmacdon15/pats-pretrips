-- Rate limits (src/lib/rate-limit). Run once against the database; it's safe
-- to run again. Until it has run, the app still works: the limiter can't
-- count in the database, logs that once, and only the per-instance memory
-- limit applies.

-- pt_rate_limits: one counter per bucket per fixed time window. A bucket is
-- what is being limited and for whom, e.g. "mcp-auth-failures:203.0.113.7"
-- or "geocode:pat@example.com". Each check is a single upsert that adds one
-- to the current window's counter; rows for windows that have ended are
-- deleted a few at a time by the same statement, so the table stays small
-- without a scheduled job.
CREATE TABLE IF NOT EXISTS pt_rate_limits (
    bucket VARCHAR(255) NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    hits INT NOT NULL DEFAULT 1,
    -- When the window ends; the row can be deleted after that.
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (bucket, window_start)
);

-- Finds windows that have ended, for the opportunistic clean-up.
CREATE INDEX IF NOT EXISTS pt_rate_limits_expires_idx ON pt_rate_limits (expires_at);
