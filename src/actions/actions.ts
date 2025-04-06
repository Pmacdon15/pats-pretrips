'use server'
import { auth } from '@/auth';
import { neon } from '@neondatabase/serverless';
import { checkIsAuthorized } from './auth';

export async function addOnRouteDefects(driverEmail: string, tripId: number, formData: FormData) {

    const session = await auth();
    await checkIsAuthorized(session?.user?.email, driverEmail)

    const defects = formData.get("defects");
    let defectsArray = defects?.toString().split(', ');
    const remarks = formData.get('remarks');

    console.log("defectsArray: ", defectsArray)

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

        const [result] = await sql`         
            UPDATE PTTrips
            SET defects = CASE 
                            WHEN COALESCE(defects, '') = '' THEN ${defects}
                            ELSE COALESCE(defects || ', ' || ${defects}, ${defects})
                          END,
                remarks = CASE 
                            WHEN COALESCE(remarks, '') = '' THEN ${remarks}::text
                            ELSE COALESCE(remarks || ', ' || ${remarks}::text, ${remarks}::text)
                          END
            WHERE tripId = ${tripId} 
            AND driverEmail = ${driverEmail}
            AND date >= NOW() - INTERVAL '24 hour'
            RETURNING *;
        `;
        if (!result) throw new Error;
    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        throw new Error(errorMessage);
    }

}

export async function addTrip(driverEmail: string, formData: FormData) {

    const session = await auth();
    await checkIsAuthorized(session?.user?.email, driverEmail)

    const carrier = formData.get("carrier");
    const carrierAddress = formData.get("carrier-address");
    const inspectionAddress = formData.get("inspection-address");
    const make = formData.get("make");
    const model = formData.get("model");
    const odometer = formData.get("odometer");
    const truckPlate = formData.get("truck-plate");
    const trailerPlateA = formData.get("trailer-plate");
    const trailerPlateB = formData.get("trailer-plate-b");
    const date = new Date().toISOString();
    const defects = formData.get("defects");
    const remarks = formData.get('remarks');

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
                ${carrier},
                ${carrierAddress},
                ${inspectionAddress},
                ${make},
                ${model},
                ${odometer},
                ${truckPlate},
                ${trailerPlateA},
                ${trailerPlateB},
                ${date},
                ${defects},
                ${remarks}
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