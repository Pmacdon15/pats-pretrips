-- Active: 1731700684828@@ep-square-snowflake-a41l6rrd-pooler.us-east-1.aws.neon.tech@5432@verceldb

-- Drop table if exists
DROP TABLE IF EXISTS PTTrips;

-- Create table
CREATE TABLE PTTrips (
    tripId SERIAL PRIMARY KEY,
    driverEmail VARCHAR(255) NOT NULL,
    truckPlate VARCHAR(20),
    trailerPlateA VARCHAR(20),
    trailerPlateB VARCHAR(20),
    date TIMESTAMP NOT NULL,
    defects TEXT
);

--Dummy data use your email
INSERT INTO PTTrips (tripId, driverEmail, truckPlate, trailerPlateA, trailerPlateB, date, defects)
VALUES 
    (1, 'patrick@patmac.ca', 'AXA6969', 'TRL123', '', '2025-04-01 09:30:00', '["Low tire pressure", "Broken headlight"]'),
    (2, 'patrick@patmac.ca', 'AXA6969', 'TRL124', '', '2025-04-01 09:30:00', '["Oil leak", "Cracked windshield"]'),
    (3, 'patrick@patmac.ca', 'AXA6969', 'TRL125', '', '2025-04-01 09:30:00', '["Faulty brake light", "Worn brake pads"]'),
    (4, 'patrick@patmac.ca', 'AXA6969', 'TRL126', '', '2024-02-25 16:45:00', '["Missing mirror", "Damaged mudflap"]');


