-- The audit trail: one row per change a driver makes, from the web app or
-- through an AI app (see docs/audit-trail.md). Run once against the
-- database; it's safe to run again.
--
-- The app writes an event with a separate small INSERT after each change
-- has succeeded (src/lib/db/audit-events.ts), never as part of the change,
-- so saving works the same before this file is run: until then the INSERT
-- fails (undefined table, 42P01), the error is swallowed, and the server
-- logs once per instance that this file should be run. Changes made before
-- it's run aren't in the trail.
--
-- Best-effort: an event is lost if the server stops between the change and
-- the INSERT. It answers "what changed, when, and from where", not a
-- tamper-proof ledger.
--
-- The app only ever INSERTs into this table: it never reads, updates or
-- deletes events.

-- pt_audit_events: one row per change.
--
-- action is one of (src/lib/db/audit-events.ts, AUDIT_ACTIONS):
--   trip.created                 a new pre-trip (web or AI)
--   trip.updated                 a trip's core details changed (MCP update_trip):
--                                details.changed names the fields,
--                                details.from / details.to their old and new values
--   trip.defects_added           defects added (on-route, or update_trip)
--   trip.remarks_added           remarks added, with nothing else
--   trip.signed                  a trip was signed (on creation too); details.signature
--                                is 'saved' or 'drawn' (AI apps: always 'saved')
--   repair.recorded              a defect marked repaired
--   repair.deleted               a repair undone: the repair, its invoice and the
--                                mechanic's signature are deleted for good; details
--                                say what was removed (not the files)
--   signature.saved              the driver's saved signature saved or replaced
--   signature.deleted            the saved signature deleted
--   signature.ai_signing_changed "Allow AI apps to sign for me" turned on or off
--   email.settings_saved         email settings saved (recipient count, not addresses)
--   email.sent                   a pre-trip emailed, manually or automatically
--
-- source is 'web', or the AI app as the row the change is in records it:
-- for trips and their signatures the app's name (pt_trip_signatures.source),
-- for repairs 'AI: <name>' or 'AI assistant' (pt_defect_repairs.source).
--
-- No foreign keys on trip_id or repair_id, so an event outlives the row it
-- describes (a deleted repair keeps its history).
--
-- details never holds signature or invoice files, recipients' email
-- addresses, tokens or coordinates; free text (remarks) only by length.
CREATE TABLE IF NOT EXISTS pt_audit_events (
    id BIGSERIAL PRIMARY KEY,
    driver_email VARCHAR(255) NOT NULL,
    -- The driver's Clerk user ID (docs/clerk-user-id.md); NULL if unknown.
    clerk_user_id VARCHAR(64),
    action VARCHAR(40) NOT NULL,
    source VARCHAR(60) NOT NULL,
    trip_id INT,
    repair_id INT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A driver's history, newest first.
CREATE INDEX IF NOT EXISTS pt_audit_events_driver_created
    ON pt_audit_events (driver_email, created_at DESC);

-- A trip's history (its edits, signing, repairs and emails).
CREATE INDEX IF NOT EXISTS pt_audit_events_trip
    ON pt_audit_events (trip_id, created_at)
    WHERE trip_id IS NOT NULL;

-- Optional hardening, not needed by the app (it only INSERTs). Either:
--
-- 1. If the app connects as its own role (not the table's owner), take away
--    its right to change or remove events (replace app_role with that role):
--      REVOKE UPDATE, DELETE, TRUNCATE ON pt_audit_events FROM app_role;
--
-- 2. Or refuse changes for every role but a superuser, with a trigger. To
--    prune old events later, drop the trigger first (or disable it:
--    ALTER TABLE pt_audit_events DISABLE TRIGGER pt_audit_events_append_only).
--      CREATE OR REPLACE FUNCTION pt_audit_events_refuse_change() RETURNS trigger
--      LANGUAGE plpgsql AS $$
--      BEGIN
--          RAISE EXCEPTION 'pt_audit_events is append-only';
--      END
--      $$;
--      CREATE OR REPLACE TRIGGER pt_audit_events_append_only
--          BEFORE UPDATE OR DELETE ON pt_audit_events
--          FOR EACH ROW EXECUTE FUNCTION pt_audit_events_refuse_change();
--      CREATE OR REPLACE TRIGGER pt_audit_events_no_truncate
--          BEFORE TRUNCATE ON pt_audit_events
--          FOR EACH STATEMENT EXECUTE FUNCTION pt_audit_events_refuse_change();
--
-- Retention: events are small (a few hundred bytes each). Keep them at least
-- as long as the trips they describe; trips aren't pruned today, so neither
-- are events. If they ever are, prune both together, e.g.:
--   DELETE FROM pt_audit_events WHERE created_at < NOW() - INTERVAL '7 years';
