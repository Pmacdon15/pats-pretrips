-- Saved trailers (the Trailers section of the Vehicles page): the trailers a
-- driver pulls, each a name and a plate, so a new pre-trip's trailer plates
-- can be picked from them in a tap. Run once against the database; it's safe
-- to run again. Run it after 2026-11-22-organizations.sql, whose vehicles it
-- reads below.
--
-- Until it has run, the app still works: the Trailers section and the
-- trailer pickers on the new pre-trip form show no trailers, and saving one
-- fails with a message.
--
-- A trip copies the trailer's plate when it's started, so editing or deleting
-- a trailer never changes a trip already saved.

-- pt_trailers: one row per trailer a driver saved.
--   name   what the driver calls it, e.g. "53' dry van" (optional)
--   plate  its plate (PTTrips.trailerPlateA or trailerPlateB)
CREATE TABLE IF NOT EXISTS pt_trailers (
    id SERIAL PRIMARY KEY,
    driver_email VARCHAR(255) NOT NULL,
    -- The driver's Clerk user ID (docs/clerk-user-id.md); NULL if unknown.
    clerk_user_id VARCHAR(64),
    name VARCHAR(100),
    plate VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A driver's trailers, in the order they're listed.
CREATE INDEX IF NOT EXISTS pt_trailers_driver
    ON pt_trailers (driver_email, created_at);

-- pt_org_trailers: one row per trailer in an organization's fleet
-- (docs/organizations.md). Same fields as pt_trailers. Every member reads
-- them; only the organization's admins change them.
CREATE TABLE IF NOT EXISTS pt_org_trailers (
    id SERIAL PRIMARY KEY,
    clerk_org_id VARCHAR(64) NOT NULL,
    -- The admin who added it.
    driver_email VARCHAR(255) NOT NULL,
    clerk_user_id VARCHAR(64),
    name VARCHAR(100),
    plate VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pt_org_trailers_org
    ON pt_org_trailers (clerk_org_id, created_at);

-- Trailer plates used to be saved on vehicles (pt_vehicles.trailer_plate_a
-- and trailer_plate_b). Copy each plate saved there into the driver's (or
-- organization's) trailers once, so nobody has to type them again. A plate
-- already saved as a trailer is skipped, so running this again adds nothing.
-- The vehicles' own columns are left as they are.
INSERT INTO pt_trailers (driver_email, clerk_user_id, plate, created_at)
SELECT v.driver_email, MAX(v.clerk_user_id), v.plate, MIN(v.created_at)
FROM (
    SELECT driver_email, clerk_user_id, TRIM(trailer_plate_a) AS plate, created_at
    FROM pt_vehicles WHERE TRIM(COALESCE(trailer_plate_a, '')) <> ''
    UNION ALL
    SELECT driver_email, clerk_user_id, TRIM(trailer_plate_b), created_at
    FROM pt_vehicles WHERE TRIM(COALESCE(trailer_plate_b, '')) <> ''
) v
WHERE NOT EXISTS (
    SELECT 1 FROM pt_trailers t
    WHERE t.driver_email = v.driver_email AND UPPER(t.plate) = UPPER(v.plate)
)
GROUP BY v.driver_email, v.plate;

INSERT INTO pt_org_trailers (clerk_org_id, driver_email, clerk_user_id, plate, created_at)
SELECT v.clerk_org_id, MIN(v.driver_email), MAX(v.clerk_user_id), v.plate, MIN(v.created_at)
FROM (
    SELECT clerk_org_id, driver_email, clerk_user_id, TRIM(trailer_plate_a) AS plate, created_at
    FROM pt_org_vehicles WHERE TRIM(COALESCE(trailer_plate_a, '')) <> ''
    UNION ALL
    SELECT clerk_org_id, driver_email, clerk_user_id, TRIM(trailer_plate_b), created_at
    FROM pt_org_vehicles WHERE TRIM(COALESCE(trailer_plate_b, '')) <> ''
) v
WHERE NOT EXISTS (
    SELECT 1 FROM pt_org_trailers t
    WHERE t.clerk_org_id = v.clerk_org_id AND UPPER(t.plate) = UPPER(v.plate)
)
GROUP BY v.clerk_org_id, v.plate;

-- To check:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name IN ('pt_trailers', 'pt_org_trailers');
