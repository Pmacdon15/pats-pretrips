-- Active: 1763082343689@@ep-square-snowflake-a41l6rrd-pooler.us-east-1.aws.neon.tech@5432@verceldb
-- Drop table if exists
DROP TABLE IF EXISTS PTTrips;

-- Create table
CREATE TABLE PTTrips (
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
    remarks text
);


select * from PTTRips;