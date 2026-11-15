-- Saved carriers (the Carriers page): the companies a driver hauls for, with
-- their addresses, so a new pre-trip can be filled from one in a tap. Run once
-- against the database; it's safe to run again.
--
-- Until it has run, the app still works: the Carriers page and the carrier
-- picker on the new pre-trip form show no carriers, and saving one fails with
-- a message.
--
-- A trip copies the carrier's name and address when it's started, so editing
-- or deleting a carrier never changes a trip already saved.

-- pt_carriers: one row per saved carrier.
--   name     the carrier's name, e.g. "Acme Freight" (PTTrips.carrier)
--   address  its address, e.g. "12 Depot Rd, Calgary AB" (PTTrips.carrierAddress)
CREATE TABLE IF NOT EXISTS pt_carriers (
    id SERIAL PRIMARY KEY,
    driver_email VARCHAR(255) NOT NULL,
    -- The driver's Clerk user ID (docs/clerk-user-id.md); NULL if unknown.
    clerk_user_id VARCHAR(64),
    name VARCHAR(255) NOT NULL,
    address VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A driver's carriers, in the order they're listed.
CREATE INDEX IF NOT EXISTS pt_carriers_driver
    ON pt_carriers (driver_email, created_at);
