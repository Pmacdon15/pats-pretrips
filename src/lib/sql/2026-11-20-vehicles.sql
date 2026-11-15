-- Saved vehicles (the Vehicles page, and the MCP vehicle tools): the trucks a
-- driver inspects, so a new pre-trip can be filled from one in a tap. Run once
-- against the database; it's safe to run again.
--
-- Until it has run, the app still works: the Vehicles page and the vehicle
-- picker on the new pre-trip form show no vehicles, saving one fails with a
-- message, and AI apps' vehicle tools answer that none are saved.
--
-- A trip copies the vehicle's make, model and plates when it's started, so
-- editing or deleting a vehicle never changes a trip already saved.

-- pt_vehicles: one row per saved vehicle.
--   name             what the driver calls it, e.g. "Unit 42" (optional)
--   make, model      e.g. "Freightliner", "Cascadia"
--   truck_plate      the truck's plate (optional)
--   trailer_plate_a  the usual trailer's plate (optional)
--   trailer_plate_b  the usual B-train trailer's plate (optional)
CREATE TABLE IF NOT EXISTS pt_vehicles (
    id SERIAL PRIMARY KEY,
    driver_email VARCHAR(255) NOT NULL,
    -- The driver's Clerk user ID (docs/clerk-user-id.md); NULL if unknown.
    clerk_user_id VARCHAR(64),
    name VARCHAR(100),
    make VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    truck_plate VARCHAR(20),
    trailer_plate_a VARCHAR(20),
    trailer_plate_b VARCHAR(20),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A driver's vehicles, in the order they're listed.
CREATE INDEX IF NOT EXISTS pt_vehicles_driver
    ON pt_vehicles (driver_email, created_at);
