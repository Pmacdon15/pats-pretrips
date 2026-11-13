-- Emailing pre-trips (the paid "email_pretrips" Clerk feature). Run once
-- against the database; it's safe to run again.

-- pt_email_settings: who a driver's pre-trips go to, and whether each new
-- pre-trip is sent to them as soon as it's saved. time_zone is the driver's
-- browser time zone, so emailed times read the way they do in the app.
CREATE TABLE IF NOT EXISTS pt_email_settings (
    driver_email VARCHAR(255) PRIMARY KEY,
    recipients TEXT NOT NULL DEFAULT '',
    auto_send BOOLEAN NOT NULL DEFAULT FALSE,
    time_zone VARCHAR(64),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
