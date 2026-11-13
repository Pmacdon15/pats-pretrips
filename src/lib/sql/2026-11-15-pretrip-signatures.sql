-- Driver signatures on pre-trips. Run once against the database; it's safe to
-- run again.

-- pt_driver_signatures: the driver's saved signature, drawn once in the app.
-- New pre-trips are signed with it, including trips an AI assistant starts
-- through the MCP server, where nobody can draw.
CREATE TABLE IF NOT EXISTS pt_driver_signatures (
    driver_email VARCHAR(255) PRIMARY KEY,
    -- A small PNG.
    signature BYTEA NOT NULL,
    signature_type VARCHAR(40) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- pt_trip_signatures: the signature on one pre-trip. It's a copy, so changing
-- or deleting the saved signature later never changes a signed trip.
CREATE TABLE IF NOT EXISTS pt_trip_signatures (
    trip_id INT PRIMARY KEY REFERENCES PTTrips (tripId) ON DELETE CASCADE,
    driver_email VARCHAR(255) NOT NULL,
    signature BYTEA NOT NULL,
    signature_type VARCHAR(40) NOT NULL,
    -- "web" or the AI app that started or signed the trip.
    source VARCHAR(60) NOT NULL DEFAULT 'web',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- When the trip was signed, kept on the trip so lists know without reading
-- the image. NULL for unsigned trips.
ALTER TABLE PTTrips ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
