export interface Trip {
    tripid: number;
    driveremail: string;
    truckplate?: string;
    trailerplatea?: string;
    trailerplateb?: string;
    date: Date;
    defects: string[];
}