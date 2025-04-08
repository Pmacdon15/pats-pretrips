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
        'pmacdonald15@gmail.com',
        'ABC Trucking',
        '123 Truck St, City, ST',
        '456 Inspection Ave, City, ST',
        'Peterbilt',
        '579',
        '150000',
        'AXA6969',
        'TRL123',
        'TRLB-1234',
        '2025-04-05 09:35:00',
        'Broken',
        'test'
    ),
    (
        'pmacdonald15@gmail.com',
        'ABC Trucking',
        '123 Truck St, City, ST',
        '456 Inspection Ave, City, ST',
        'Peterbilt',
        '579',
        '150500',
        'AXA6969',
        'TRL124',
        NULL,
        '2025-04-04 09:55:00',
        'Steering, Windows, Brakes',
        'brakes messed up'
    ),
    (
       'pmacdonald15@gmail.com',
        'ABC Trucking',
        '123 Truck St, City, ST',
        '456 Inspection Ave, City, ST',
        'Peterbilt',
        '579',
        '151000',
        'AXA6969',
        'TRL125',
        NULL,
        '2025-04-01 09:33:00',
        NULL,
        NULL
    ),
    (
       'pmacdonald15@gmail.com',
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
    ),
    (
        'pmacdonald15@gmail.com',
        'ABC Trucking',
        '123 Truck St, City, ST',
        '456 Inspection Ave, City, ST',
        'Peterbilt',
        '579',
        '152000',
        'AXA6969',
        'TRL127',
        NULL,
        '2024-02-20 08:00:00',
        'Lights',
        'Front headlight out'
    ),
    -- Trip 6
    (
        'pmacdonald15@gmail.com',
        'ABC Trucking',
        '123 Truck St, City, ST',
        '456 Inspection Ave, City, ST',
        'Peterbilt',
        '579',
        '152500',
        'AXA6969',
        'TRL128',
        'TRLB-1284',
        '2024-02-15 10:30:00',
        NULL,
        'On-time delivery'
    ),
    -- Trip 7
    (
        'pmacdonald15@gmail.com',
        'ABC Trucking',
        '123 Truck St, City, ST',
        '456 Inspection Ave, City, ST',
        'Peterbilt',
        '579',
        '153000',
        'AXA6969',
        'TRL129',
        NULL,
        '2024-02-10 12:00:00',
        'Tire Pressure',
        'Low tire pressure'
    ),
    -- Trip 8
    (
        'pmacdonald15@gmail.com',
        'ABC Trucking',
        '123 Truck St, City, ST',
        '456 Inspection Ave, City, ST',
        'Peterbilt',
        '579',
        '153500',
        'AXA6969',
        'TRL130',
        'TRLB-1304',
        '2024-02-05 14:30:00',
        'Brakes',
        'Rear brakes worn'
    ),
    -- Trip 9
    (
        'pmacdonald15@gmail.com',
        'ABC Trucking',
        '123 Truck St, City, ST',
        '456 Inspection Ave, City, ST',
        'Peterbilt',
        '579',
        '154000',
        'AXA6969',
        'TRL131',
        NULL,
        '2024-01-31 11:00:00',
        NULL,
        'No issues'
    ),
    -- Trip 10
    (
        'pmacdonald15@gmail.com',
        'ABC Trucking',
        '123 Truck St, City, ST',
        '456 Inspection Ave, City, ST',
        'Peterbilt',
        '579',
        '154500',
        'AXA6969',
        'TRL132',
        'TRLB-1324',
        '2024-01-25 10:00:00',
        'Steering',
        'Loose steering'
    ),
    -- Trip 11
    (
        'pmacdonald15@gmail.com',
        'ABC Trucking',
        '123 Truck St, City, ST',
        '456 Inspection Ave, City, ST',
        'Peterbilt',
        '579',
        '155000',
        'AXA6969',
        'TRL133',
        NULL,
        '2024-01-20 12:31:00',
        NULL,
        NULL
    ),
    -- Trip 12
    (
        'pmacdonald15@gmail.com',
        'ABC Trucking',
        '123 Truck St, City, ST',
        '456 Inspection Ave, City, ST',
        'Peterbilt',
        '579',
        '155500',
        'AXA6969',
        'TRL134',
        'TRLB-1344',
        '2024-01-15 09:40:00',
        'Lights',
        'Rear lights out'
    ),
    -- Trip 13
    (
        'pmacdonald15@gmail.com',
        'ABC Trucking',
        '123 Truck St, City, ST',
        '456 Inspection Ave, City, ST',
        'Peterbilt',
        '579',
        '156000',
        'AXA6969',
        'TRL135',
        NULL,
        '2024-01-10 11:35:00',
        NULL,
        'On-time delivery'
    );

select * from PTTRips;