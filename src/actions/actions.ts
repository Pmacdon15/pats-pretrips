'use server'
import { neon } from '@neondatabase/serverless';

export default async function addOnRouteDefects(driverEmail: string, tripId: number, formData: FormData) {

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