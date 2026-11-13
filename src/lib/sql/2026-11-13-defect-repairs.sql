-- Defect repairs: a defect on a pre-trip marked as fixed, e.g. by a
-- mechanic, with their signature, the invoice number and a compressed copy of
-- the invoice. Run once against the database; it's safe to run again.
--
-- The trip's own defects list never changes: a repair is a record beside it,
-- so the trip still shows what was found and this shows what was fixed.
CREATE TABLE IF NOT EXISTS pt_defect_repairs (
    id SERIAL PRIMARY KEY,
    trip_id INT NOT NULL REFERENCES PTTrips (tripId) ON DELETE CASCADE,
    driver_email VARCHAR(255) NOT NULL,
    defect VARCHAR(60) NOT NULL,
    repaired_on DATE NOT NULL,
    -- Who repaired it: the mechanic, the shop, or both (at least one).
    mechanic_name VARCHAR(120),
    shop_name VARCHAR(120),
    invoice_number VARCHAR(60),
    notes TEXT,
    -- PNG of the signature drawn in the app, or an image the assistant sent.
    signature BYTEA,
    signature_type VARCHAR(40),
    -- The invoice after compression (JPEG for photos, a rewritten PDF).
    invoice BYTEA,
    invoice_type VARCHAR(40),
    invoice_name VARCHAR(255),
    invoice_size INT,
    invoice_original_size INT,
    -- "web" or the AI app that recorded it.
    source VARCHAR(60) NOT NULL DEFAULT 'web',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A defect on a trip is repaired once.
CREATE UNIQUE INDEX IF NOT EXISTS pt_defect_repairs_defect_idx
    ON pt_defect_repairs (trip_id, LOWER(defect));
CREATE INDEX IF NOT EXISTS pt_defect_repairs_driver_idx
    ON pt_defect_repairs (driver_email, repaired_on DESC);
