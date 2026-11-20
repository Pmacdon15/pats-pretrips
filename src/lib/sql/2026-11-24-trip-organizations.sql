-- Trips belong to the space they were started in (issue #89,
-- docs/organizations.md). Run once against the database; it's safe to run
-- again.
--
-- clerk_org_id is the Clerk organization (org_...) whose space the trip was
-- started in, or NULL for a trip started in the driver's personal space. The
-- trip is still the driver's own (driverEmail): the trip lists show the
-- driver's trips in the active space only, so a trip started for one
-- organization no longer shows up under another organization or the
-- personal space.
--
-- Trips saved before this file ran are NULL, so they show in the personal
-- space until they are given their organization (see the note at the end).

DO $$
BEGIN
    IF to_regclass('pttrips') IS NOT NULL THEN
        ALTER TABLE PTTrips ADD COLUMN IF NOT EXISTS clerk_org_id VARCHAR(64);
        -- The lists: one driver's trips in one space, newest first.
        CREATE INDEX IF NOT EXISTS pttrips_driver_org_date_idx
            ON PTTrips (driverEmail, clerk_org_id, date DESC);
    END IF;
END $$;

-- Older trips started in an organization carry its name as their carrier
-- (the organization is the carrier on every trip in its space). To move them,
-- for each organization and each of its members:
--   UPDATE PTTrips SET clerk_org_id = '<org_id>'
--   WHERE driverEmail = '<member email>' AND carrier = '<organization name>'
--     AND clerk_org_id IS NULL;
-- To check:
--   SELECT clerk_org_id, count(*) FROM PTTrips GROUP BY 1;
