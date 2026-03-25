import { neon } from '@neondatabase/serverless'
import type z from 'zod'
import type { Trip } from '../types/types'
import type { schemaAddTripForm } from '../ZOD/schemas'

export async function createTripDb(
	data: z.infer<typeof schemaAddTripForm>,
	driverEmail: string,
): Promise<Trip> {
	const sql = neon(`${process.env.DATABASE_URL}`)
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
                ${data.carrier},
                ${data.carrierAddress},
                ${data.inspectionAddress},
                ${data.make},
                ${data.model},
                ${data.odometer},
                ${data.truckPlate},
                ${data.trailerPlateA},
                ${data.trailerPlateB},
                ${new Date().toISOString()},
                ${data.defects},
                ${data.remarks}
                )
                RETURNING *;
            `
	return result[0] as Trip
}

// Fetch current defects for a specific trip
export async function getTripDefectsDb(
	tripId: number,
	driverEmail: string,
): Promise<string> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const [result] = await sql`
        SELECT defects 
        FROM PTTrips
        WHERE tripId = ${tripId} 
            AND driverEmail = ${driverEmail}
            AND date >= NOW() - INTERVAL '24 hour'            
    `
	return result?.defects || ''
}

// Update the trip with new defects and remarks
export async function updateTripDefectsDb(
	tripId: number,
	driverEmail: string,
	newDefects: string,
	newRemarks: string,
): Promise<Trip> {
	const sql = neon(`${process.env.DATABASE_URL}`)
	const [result] = await sql`         
        UPDATE PTTrips
        SET defects = CASE 
                        WHEN COALESCE(defects, '') = '' THEN ${newDefects}
                        ELSE COALESCE(defects || ', ' || ${newDefects}, ${newDefects})
                      END,
            remarks = CASE 
                        WHEN COALESCE(remarks, '') = '' THEN ${newRemarks}::text
                        ELSE COALESCE(remarks || ', ' || ${newRemarks}::text, ${newRemarks}::text)
                      END
        WHERE tripId = ${tripId} 
        AND driverEmail = ${driverEmail}
        AND date >= NOW() - INTERVAL '24 hour'
        RETURNING *;
    `

	if (!result) throw new Error('Failed to update trip or trip not found')
	return result as Trip
}
