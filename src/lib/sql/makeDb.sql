-- The trips table (PTTrips), as the app expects it today. Run it first on a
-- new database, then every dated file in this folder in date order (oldest
-- first, by file name): they add the other tables and the indexes. It's safe
-- to run again, and safe to run on a database that already has the table: it
-- only creates PTTrips if it's missing, and never drops or changes anything.
--
-- signed_at (2026-11-15-pretrip-signatures.sql) and clerk_user_id
-- (2026-11-18-clerk-user-id.sql) are included here, so a new database has
-- them from the start; those files add them with ADD COLUMN IF NOT EXISTS, so
-- they do nothing to a table made here. The indexes on PTTrips stay in the
-- dated files (2026-11-12-ai-connector.sql, 2026-11-18-clerk-user-id.sql).
CREATE TABLE IF NOT EXISTS PTTrips (
    tripId SERIAL PRIMARY KEY,
    driverEmail VARCHAR(255) NOT NULL,
    carrier VARCHAR(255) NOT NULL,
    carrierAddress VARCHAR(255) NOT NULL,
    inspectionAddress VARCHAR(255) NOT NULL,
    make VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    odometer INT NOT NULL,
    truckPlate VARCHAR(20),
    trailerPlateA VARCHAR(20),
    trailerPlateB VARCHAR(20),
    date TIMESTAMP NOT NULL,
    defects text,
    remarks text,
    -- When the trip was signed; NULL for unsigned trips.
    signed_at TIMESTAMPTZ,
    -- The driver's Clerk user ID (user_...); NULL until filled in.
    clerk_user_id VARCHAR(64)
);
