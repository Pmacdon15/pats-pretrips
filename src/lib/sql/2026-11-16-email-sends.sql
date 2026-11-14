-- A log of pre-trip emails, used to cap how many a driver can send (the
-- limits are in src/lib/email/config.ts). Run once against the database; it's
-- safe to run again. Until it's run, emails still send, without limits, and
-- the server logs that the table is missing.

-- pt_email_sends: one row per email (manual or automatic). Recipient
-- addresses aren't kept, only how many there were: the limits count
-- deliveries, and the addresses would be personal data the app doesn't need.
-- A row is added (status 'reserved') before the email goes to SES and marked
-- 'sent' with SES's message id once SES accepts it; if SES refuses it, the row
-- is deleted. A row left 'reserved' means the server stopped mid-send: it
-- still counts towards the limits, since the email may have gone out.
-- No foreign key on trip_id, so the log outlives a deleted trip.
CREATE TABLE IF NOT EXISTS pt_email_sends (
    id BIGSERIAL PRIMARY KEY,
    driver_email VARCHAR(255) NOT NULL,
    -- The trip emailed; NULL only if the app didn't know its id.
    trip_id INT,
    recipient_count SMALLINT NOT NULL CHECK (recipient_count > 0),
    -- 'manual' (the Email this pre-trip box) or 'auto' (sent on save).
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('manual', 'auto')),
    status VARCHAR(10) NOT NULL DEFAULT 'reserved'
        CHECK (status IN ('reserved', 'sent')),
    -- SES's message id, to match a bounce or complaint to the driver.
    ses_message_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

-- Counting a driver's sends in the last 24 hours.
CREATE INDEX IF NOT EXISTS pt_email_sends_driver_created
    ON pt_email_sends (driver_email, created_at);

-- Rows older than a day no longer count towards any limit. Keep them as long
-- as they're useful for looking into abuse, e.g. prune now and then with:
--   DELETE FROM pt_email_sends WHERE created_at < NOW() - INTERVAL '90 days';
