'use server'
import { auth } from '@/auth';
import { neon } from '@neondatabase/serverless';
import { checkIsAuthorized } from './auth';
import DOMPurify from 'isomorphic-dompurify';

export async function addOnRouteDefects(driverEmail: string, tripId: number, formData: FormData) {

    const session = await auth();
    await checkIsAuthorized(session?.user?.email, driverEmail)

    const defects = formData.get("defects");
    const remarks = formData.get('remarks');

    const cleanDefects = DOMPurify.sanitize(defects ? defects.toString() : "");
    const cleanremarks = DOMPurify.sanitize(remarks ? remarks.toString() : "");

    let defectsArray = cleanDefects.toString().split(', ');

    if (!defectsArray) defectsArray = [];

    try {
        const sql = neon(`${process.env.DATABASE_URL}`);
        const [result1] = await sql`
        SELECT defects 
        FROM PTTrips
        WHERE tripId = ${tripId} 
            AND driverEmail = ${driverEmail}
            AND date >= NOW() - INTERVAL '24 hour'            
        `;

        const currentDefects = result1?.defects || ""; // Handle undefined or NULL
        defectsArray.forEach(defect => {
            if (currentDefects.toLowerCase().includes(defect.toLowerCase())) {
                throw new Error(`Defect "${defect}" already listed`);
            }
        });

        console.log(result1)
        const [result] = await sql`         
            UPDATE PTTrips
            SET defects = CASE 
                            WHEN COALESCE(defects, '') = '' THEN ${defects}
                            ELSE COALESCE(defects || ', ' || ${defects}, ${defects})
                          END,
                remarks = CASE 
                            WHEN COALESCE(remarks, '') = '' THEN ${cleanremarks}::text
                            ELSE COALESCE(remarks || ', ' || ${cleanremarks}::text, ${cleanremarks}::text)
                          END
            WHERE tripId = ${tripId} 
            AND driverEmail = ${driverEmail}
            AND date >= NOW() - INTERVAL '24 hour'
            RETURNING *;
        `;
        console.log(result)
        if (!result) throw new Error;
    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        throw new Error(errorMessage);
    }

}

export async function addTrip(driverEmail: string, formData: FormData) {

    const session = await auth();
    await checkIsAuthorized(session?.user?.email, driverEmail)

    const requiredFields = [
        "carrier",
        "carrier-address",
        "inspection-address",
        "make",
        "model",
        "odometer",  
    ];

    const formDataEntries = Object.fromEntries(formData);

    const validationErrors = requiredFields.filter((field) => {
        const value = formDataEntries[field];
        return !value || (typeof value === 'string' && value.trim() === "");
    });

    if (validationErrors.length > 0) {
        // Handle validation errors, e.g., return an error response
        throw new Error('Missing field');
    }

    const sanitizedData = {
        carrier: DOMPurify.sanitize(formDataEntries["carrier"]?.toString() || ""),
        carrierAddress: DOMPurify.sanitize(formDataEntries["carrier-address"]?.toString() || ""),
        inspectionAddress: DOMPurify.sanitize(formDataEntries["inspection-address"]?.toString() || ""),
        make: DOMPurify.sanitize(formDataEntries["make"]?.toString() || ""),
        model: DOMPurify.sanitize(formDataEntries["model"]?.toString() || ""),
        odometer: DOMPurify.sanitize(formDataEntries["odometer"]?.toString() || ""),
        truckPlate: DOMPurify.sanitize(formDataEntries["truck-plate"]?.toString() || ""),
        trailerPlateA: DOMPurify.sanitize(formDataEntries["trailer-plate"]?.toString() || ""),
        trailerPlateB: DOMPurify.sanitize(formDataEntries["trailer-plate-b"]?.toString() || ""),
        defects: DOMPurify.sanitize(formDataEntries["defects"]?.toString() || ""),
        remarks: DOMPurify.sanitize(formDataEntries["remarks"]?.toString() || ""),
        date: new Date().toISOString(),
    };

    try {
        const sql = neon(`${process.env.DATABASE_URL}`);
        const [result] = await sql`
            INSERT INTO PTTrips (
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
            ) VALUES (
            ${driverEmail},
            ${sanitizedData.carrier},
            ${sanitizedData.carrierAddress},
            ${sanitizedData.inspectionAddress},
            ${sanitizedData.make},
            ${sanitizedData.model},
            ${sanitizedData.odometer},
            ${sanitizedData.truckPlate},
            ${sanitizedData.trailerPlateA},
            ${sanitizedData.trailerPlateB},
            ${sanitizedData.date},
            ${sanitizedData.defects},
            ${sanitizedData.remarks}
            )
            RETURNING *;
        `;
        if (!result) throw new Error('Failed to create trip');
        return result;
    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        throw new Error(errorMessage);
    }
}

export async function getAddress(lat: number, lng: number, driverEmail: string): Promise<object> {
    const session = await auth();
    await checkIsAuthorized(session?.user?.email, driverEmail)

    const apiKey = process.env.REVERSE_GEOCODING_API_KEY;
    let data;
    try {
        const response = await fetch(
            `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&apiKey=${apiKey}`,
            {
                cache: "no-cache",
            }
        );
        data = await response.json();
        //console.log(data);
    } catch (error) {
        console.error("Error fetching:", (error instanceof Error ? error.message : error))
    }
    return { data };
}