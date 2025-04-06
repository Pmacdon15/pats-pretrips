export interface Trip {
    tripid: number;
    driveremail: string;
    carrier: string;
    carrieraddress: string;
    inspectionaddress: string;
    make: string;
    model: string;
    odometer: string;
    truckplate?: string;
    trailerplatea?: string;
    trailerplateb?: string;
    date: Date;
    defects: string[];
    remarks: string[];
}

export interface AddressResponse {
    data: {
        features: {
            properties: {
                housenumber: string;
                street: string;
                country_code: string;
                county: string;
                state_code: string;
                formatted: string;
            };
        }[];
    };
}
