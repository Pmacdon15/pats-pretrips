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