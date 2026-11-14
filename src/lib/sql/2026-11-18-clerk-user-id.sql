-- The driver's Clerk user ID beside their email on every driver-owned row
-- (stage one of keying rows by user ID; see docs/clerk-user-id.md). Run once
-- against the database; it's safe to run again, and safe to run on a
-- database where an earlier migration was skipped: each table is changed
-- only if it exists, so the file never stops half-way.
--
-- Rows are keyed by the driver's email. An email can change, or be released
-- and later verified on a different Clerk account, which would then see the
-- old account's trips. The Clerk user ID (user_...) never changes, so rows
-- will move to it. For now the app still reads by email and only records the
-- user ID: after every write, a separate UPDATE fills clerk_user_id where it
-- is NULL (src/lib/db/owner-stamps.ts), and never replaces a different one.
-- Until this file is run, those UPDATEs fail quietly and saving works as
-- before. Rows from before the deploy are filled by
-- scripts/backfill-clerk-user-ids.ts.
--
-- The column is nullable: old rows stay NULL until the backfill. Not on
-- pt_api_keys (being removed) or pt_rate_limits (not a driver's data).
--
-- The indexes are for the later switch of reads to clerk_user_id; they match
-- the email indexes the reads use today. The tables are small, so a plain
-- CREATE INDEX (which holds writes on the table for a moment) is fine.

DO $$
BEGIN
    -- Trips: lists and the latest trip are by driver, newest first.
    IF to_regclass('pttrips') IS NOT NULL THEN
        ALTER TABLE PTTrips ADD COLUMN IF NOT EXISTS clerk_user_id VARCHAR(64);
        CREATE INDEX IF NOT EXISTS pttrips_clerk_user_date_idx
            ON PTTrips (clerk_user_id, date DESC);
    END IF;

    -- Repairs (2026-11-13-defect-repairs.sql): listed by driver, newest first.
    IF to_regclass('pt_defect_repairs') IS NOT NULL THEN
        ALTER TABLE pt_defect_repairs ADD COLUMN IF NOT EXISTS clerk_user_id VARCHAR(64);
        CREATE INDEX IF NOT EXISTS pt_defect_repairs_clerk_user_idx
            ON pt_defect_repairs (clerk_user_id, repaired_on DESC);
    END IF;

    -- The signature on each trip (2026-11-15-pretrip-signatures.sql): read by
    -- trip_id, its primary key, so no new index.
    IF to_regclass('pt_trip_signatures') IS NOT NULL THEN
        ALTER TABLE pt_trip_signatures ADD COLUMN IF NOT EXISTS clerk_user_id VARCHAR(64);
    END IF;

    -- The driver's saved signature: one row per email today. Not UNIQUE on
    -- clerk_user_id: a driver who changed their email can have two rows.
    IF to_regclass('pt_driver_signatures') IS NOT NULL THEN
        ALTER TABLE pt_driver_signatures ADD COLUMN IF NOT EXISTS clerk_user_id VARCHAR(64);
        CREATE INDEX IF NOT EXISTS pt_driver_signatures_clerk_user_idx
            ON pt_driver_signatures (clerk_user_id);
    END IF;

    -- Email settings (2026-11-13-email.sql): same as signatures.
    IF to_regclass('pt_email_settings') IS NOT NULL THEN
        ALTER TABLE pt_email_settings ADD COLUMN IF NOT EXISTS clerk_user_id VARCHAR(64);
        CREATE INDEX IF NOT EXISTS pt_email_settings_clerk_user_idx
            ON pt_email_settings (clerk_user_id);
    END IF;

    -- The email send log (2026-11-16-email-sends.sql): sends are counted by
    -- driver over the last day.
    IF to_regclass('pt_email_sends') IS NOT NULL THEN
        ALTER TABLE pt_email_sends ADD COLUMN IF NOT EXISTS clerk_user_id VARCHAR(64);
        CREATE INDEX IF NOT EXISTS pt_email_sends_clerk_user_created
            ON pt_email_sends (clerk_user_id, created_at);
    END IF;
END $$;

-- If a table was missing, run its migration and then this file again.
-- To check: every driver-owned table should list the column.
--   SELECT table_name FROM information_schema.columns
--   WHERE column_name = 'clerk_user_id' ORDER BY table_name;
