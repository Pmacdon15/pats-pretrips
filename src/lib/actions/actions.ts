'use server'

import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server'
import { neon } from '@neondatabase/serverless'
import DOMPurify from 'isomorphic-dompurify'
import type { z } from 'zod'
import type { AddressResponse } from '@/lib/types/types'
import { schemaAddDefects, schemaAddTripForm } from '../ZOD/schemas'

export async function addOnRouteDefects(
	driverEmail: string,
	tripId: number,
	formData: FormData,
) {
	const validatedFields = schemaAddDefects.safeParse({
		defects: formData.get('defects'),
		remarks: formData.get('remarks'),
	})

	if (!validatedFields.success) {
		throw new Error('Invalid form data')
	}

	const cleanDefects = DOMPurify.sanitize(
		validatedFields?.data?.defects
			? validatedFields.data?.defects.toString()
			: '',
	)
	const cleanremarks = DOMPurify.sanitize(
		validatedFields.data?.remarks
			? validatedFields.data?.remarks.toString()
			: '',
	)

	let cleanDefectsToAddArray = cleanDefects.toString().split(', ')

	if (!cleanDefectsToAddArray) cleanDefectsToAddArray = []

	try {
		const sql = neon(`${process.env.DATABASE_URL}`)
		const [result1] = await sql`
        SELECT defects 
        FROM PTTrips
        WHERE tripId = ${tripId} 
            AND driverEmail = ${driverEmail}
            AND date >= NOW() - INTERVAL '24 hour'            
        `

		const cleanCurrentDefects = result1?.defects || ''

		cleanDefectsToAddArray.forEach((defect) => {
			if (
				defect !== '' &&
				cleanCurrentDefects !== '' &&
				cleanCurrentDefects.toLowerCase().includes(defect.toLowerCase())
			) {
				throw new Error(`Defect "${defect}" already listed`)
			}
		})

		const [result] = await sql`         
            UPDATE PTTrips
            SET defects = CASE 
                            WHEN COALESCE(defects, '') = '' THEN ${cleanDefectsToAddArray.join(', ')}
                            ELSE COALESCE(defects || ', ' || ${cleanDefectsToAddArray.join(', ')}, ${cleanDefectsToAddArray.join(', ')})
                          END,
                remarks = CASE 
                            WHEN COALESCE(remarks, '') = '' THEN ${cleanremarks}::text
                            ELSE COALESCE(remarks || ', ' || ${cleanremarks}::text, ${cleanremarks}::text)
                          END
            WHERE tripId = ${tripId} 
            AND driverEmail = ${driverEmail}
            AND date >= NOW() - INTERVAL '24 hour'
            RETURNING *;
        `
		if (!result) throw new Error()
	} catch (e: unknown) {
		const errorMessage = e instanceof Error ? e.message : String(e)
		throw new Error(errorMessage)
	}
}

export async function addTrip(data: z.infer<typeof schemaAddTripForm>) {
	const { getUser } = getKindeServerSession()
	const user = await getUser()

	const driverEmail = user?.email

	if (!driverEmail) {
		throw new Error('Must be logged in')
	}

	const validatedFields = schemaAddTripForm.safeParse({
		carrier: data.carrier,
		carrierAddress: data.carrierAddress,
		inspectionAddress: data.inspectionAddress,
		make: data.make,
		model: data.model,
		odometer: data.odometer,
		truckPlate: data.truckPlate,
		trailerPlateA: data.trailerPlateA,
		trailerPlateB: data.trailerPlateB,
		defects: data.defects,
		remarks: data.remarks,
	})

	if (!validatedFields.success) {
		console.log('Invalid Fields: ', validatedFields.error)
		throw new Error('Invalid form data')
	}

	try {
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
		if (!result) throw new Error('Failed to create trip')
		return result
	} catch (e: unknown) {
		const errorMessage = e instanceof Error ? e.message : String(e)
		throw new Error(errorMessage)
	}
}

export async function getAddress(
	lat: number,
	lng: number,
	_driverEmail: string,
): Promise<{ data: AddressResponse | undefined }> {
	const apiKey = process.env.REVERSE_GEOCODING_API_KEY
	let data: AddressResponse | undefined
	try {
		const response = await fetch(
			`https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&apiKey=${apiKey}`,
			{
				cache: 'no-cache',
			},
		)
		data = await response.json()
	} catch (error) {
		console.error(
			'Error fetching:',
			error instanceof Error ? error.message : error,
		)
	}
	return { data }
}
