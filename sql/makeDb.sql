-- Active: 1731700684828@@ep-square-snowflake-a41l6rrd-pooler.us-east-1.aws.neon.tech@5432@verceldb

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

INSERT INTO
    PTTrips (
        driverEmail,
        carrier,
        carrierAddress,
        inspectionAddress,
        make,
        model,
        odometer,
        truckPlate,
        trailerPlateA,
        trailerPlateB,
        date,
        defects,
        remarks
    )
VALUES (
        'patrick@patmac.ca',
        'ABC Trucking',
        '123 Truck St, City, ST',
        '456 Inspection Ave, City, ST',
        'Peterbilt',
        '579',
        '150000',
        'AXA6969',
        'TRL123',
        'TRLB-1234',
        '2025-04-05 09:30:00',
        'Broken',
        'test'
    ),
    (
        'patrick@patmac.ca',
        'ABC Trucking',
        '123 Truck St, City, ST',
        '456 Inspection Ave, City, ST',
        'Peterbilt',
        '579',
        '150500',
        'AXA6969',
        'TRL124',
        NULL,
        '2025-04-04 09:45:00',
        'Steering, Windows, Brakes',
        'brakes messed up'
    ),
    (
        'patrick@patmac.ca',
        'ABC Trucking',
        '123 Truck St, City, ST',
        '456 Inspection Ave, City, ST',
        'Peterbilt',
        '579',
        '151000',
        'AXA6969',
        'TRL125',
        NULL,
        '2025-04-01 09:30:00',
        NULL,
        NULL
    ),
    (
        'patrick@patmac.ca',
        'ABC Trucking',
        '123 Truck St, City, ST',
        '456 Inspection Ave, City, ST',
        'Peterbilt',
        '579',
        '151500',
        'AXA6969',
        'TRL126',
        NULL,
        '2024-02-25 16:45:00',
        NULL,
        NULL
    );

select * from PTTRips;