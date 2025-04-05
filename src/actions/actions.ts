'use server'
import { neon } from '@neondatabase/serverless';

export async function addOnRouteDefects(driverEmail: string, tripId: number, formData: FormData) {

    const defects = formData.get("defects");
    const remarks = formData.get('remarks');
    try {
        const sql = neon(`${process.env.DATABASE_URL}`);
        const [result] = await sql`         
        UPDATE PTTrips
            SET defects = COALESCE(defects || ', ' || ${defects}, ${defects}),
            remarks = COALESCE(remarks, '') || CASE WHEN ${remarks}::text IS NOT NULL THEN ', ' || ${remarks}::text ELSE '' END
            WHERE tripId = ${tripId} 
            AND driverEmail = ${driverEmail}
            AND date >= NOW() - INTERVAL '24 hour'
            RETURNING *;
        `;
        if (!result) throw new Error;
        console.log(result)
    } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        throw new Error(errorMessage);
    }

}

export async function addTrip(driverEmail: string, formData: FormData) {
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