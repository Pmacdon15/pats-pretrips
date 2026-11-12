-- AI connector (the MCP server at /api/mcp). Run once against the database;
-- it's safe to run again. makeDb.sql drops PTTrips, so don't re-run that.

-- pt_api_keys: personal keys for AI apps that can't sign in with OAuth. Only
-- a SHA-256 hash of each key is stored. The key itself is shown once, when it
-- is created. key_prefix is its first characters, so the driver can tell keys
-- apart.
CREATE TABLE IF NOT EXISTS pt_api_keys (
    id SERIAL PRIMARY KEY,
    driver_email VARCHAR(255) NOT NULL,
    name VARCHAR(60) NOT NULL,
    key_hash CHAR(64) NOT NULL UNIQUE,
    key_prefix VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS pt_api_keys_driver_idx ON pt_api_keys (driver_email, created_at);

-- Lookups the connector makes: a driver's latest trips, and the latest trip
-- for a truck plate (to suggest its make, model and last odometer).
CREATE INDEX IF NOT EXISTS pttrips_driver_date_idx ON PTTrips (driverEmail, date DESC);
