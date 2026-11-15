-- Clerk organizations (docs/organizations.md): the saved vehicles, carriers
-- and email settings an organization shares with its members. Run once
-- against the database; it's safe to run again.
--
-- A driver's personal space keeps using pt_vehicles, pt_carriers and
-- pt_email_settings exactly as before, so nothing changes for solo users,
-- even before this file is run. In an organization's space the app reads
-- these tables instead, keyed by the Clerk organization ID (org_...). Every
-- member reads them; only the organization's admins (org:admin) change them.
--
-- Until it has run, an organization's space shows no vehicles or carriers,
-- its email settings are empty, and saving any of them fails with a message.
--
-- Each row also keeps who last changed it (driver_email, clerk_user_id), for
-- support; the audit trail (pt_audit_events) records every change.

-- pt_org_vehicles: one row per vehicle in an organization's fleet. Same
-- fields as pt_vehicles (2026-11-20-vehicles.sql).
CREATE TABLE IF NOT EXISTS pt_org_vehicles (
    id SERIAL PRIMARY KEY,
    clerk_org_id VARCHAR(64) NOT NULL,
    -- The admin who added it.
    driver_email VARCHAR(255) NOT NULL,
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

CREATE INDEX IF NOT EXISTS pt_org_vehicles_org
    ON pt_org_vehicles (clerk_org_id, created_at);

-- pt_org_carriers: one row per carrier an organization hauls for. Same
-- fields as pt_carriers (2026-11-21-carriers.sql).
CREATE TABLE IF NOT EXISTS pt_org_carriers (
    id SERIAL PRIMARY KEY,
    clerk_org_id VARCHAR(64) NOT NULL,
    -- The admin who added it.
    driver_email VARCHAR(255) NOT NULL,
    clerk_user_id VARCHAR(64),
    name VARCHAR(255) NOT NULL,
    address VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pt_org_carriers_org
    ON pt_org_carriers (clerk_org_id, created_at);

-- pt_org_email_settings: who an organization's pre-trips are emailed to,
-- and whether each new one is sent automatically. One row per organization.
-- Same fields as pt_email_settings (2026-11-13-email.sql).
CREATE TABLE IF NOT EXISTS pt_org_email_settings (
    clerk_org_id VARCHAR(64) PRIMARY KEY,
    recipients TEXT NOT NULL DEFAULT '',
    auto_send BOOLEAN NOT NULL DEFAULT FALSE,
    time_zone VARCHAR(64),
    -- The admin who last saved them.
    driver_email VARCHAR(255) NOT NULL,
    clerk_user_id VARCHAR(64),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- To check:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_name LIKE 'pt_org_%' ORDER BY table_name;
