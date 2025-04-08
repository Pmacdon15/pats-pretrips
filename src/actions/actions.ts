'use server'
import { auth } from '@/auth';
import { neon } from '@neondatabase/serverless';
import { checkIsAuthorized } from './auth';
import DOMPurify from 'isomorphic-dompurify';
import { z } from 'zod'
import { Trip } from '@/types/types';

const schemaAddTrip = z.object({
    carrier: z.string({
        invalid_type_error: 'Carrier name is required',
        required_error: 'Carrier name is required',
    }),
    carrieraddress: z.string({
        invalid_type_error: 'Carrier address is required',
        required_error: 'Carrier address is required',
    }),
    inspectionaddress: z.string({
        invalid_type_error: 'Inspection address is required',
        required_error: 'Inspection address is required',
    }),
    make: z.string({
        invalid_type_error: 'Vehicle make is required',
        required_error: 'Vehicle make is required',
    }),
    model: z.string({
        invalid_type_error: 'Vehicle model is required',
        required_error: 'Vehicle model is required',
    }),
    odometer: z.number({
        invalid_type_error: 'Odometer reading must be positive',
        required_error: 'Odometer reading is required',
    }),
    truckplate: z.string().nullable().optional(),
    trailerplatea: z.string().nullable().optional(),
    trailerplateb: z.string().nullable().optional(),
    defects: z.string({
        invalid_type_error: 'Defects',
    }),
    remarks: z.string({
        invalid_type_error: 'Remarks',
    }),
});

const schemaAddDefects = z.object({
    defects: z.string({
        invalid_type_error: 'Defects',
        required_error: 'Defects requiered'
    }),
    remarks: z.string({
        invalid_type_error: 'Remarks',
        required_error: 'Defects requiered'
    }),
});

export async function addOnRouteDefects(driverEmail: string, tripId: number, formData: FormData) {

    const session = await auth();
    await checkIsAuthorized(session?.user?.email, driverEmail)

    const validatedFields = schemaAddDefects.safeParse({
        defects: formData.get("defects"),
        remarks: formData.get('remarks')
    });

    if (!validatedFields.success) {
        throw new Error("Invalid form data");
    }

    const cleanDefects = DOMPurify.sanitize(validatedFields?.data?.defects ? validatedFields.data?.defects.toString() : "");
    const cleanremarks = DOMPurify.sanitize(validatedFields.data?.remarks ? validatedFields.data?.remarks.toString() : "");

    let cleanDefectsToAddArray = cleanDefects.toString().split(', ');

    if (!cleanDefectsToAddArray) cleanDefectsToAddArray = [];

    try {
        const sql = neon(`${process.env.DATABASE_URL}`);
        const [result1] = await sql`
        SELECT defects 
        FROM PTTrips
        WHERE tripId = ${tripId} 
            AND driverEmail = ${driverEmail}
            AND date >= NOW() - INTERVAL '24 hour'            
        `;

        const cleanCurrentDefects = result1?.defects || "";

        cleanDefectsToAddArray.forEach(defect => {
            if (defect !== '' && cleanCurrentDefects !== '' && cleanCurrentDefects.toLowerCase().includes(defect.toLowerCase())) {
                throw new Error(`Defect "${defect}" already listed`);
            }
        });

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

    const validatedFields = schemaAddTrip.safeParse({
        driveremail: formData.get("driveremail"),
        carrier: formData.get("carrier"),
        carrieraddress: formData.get("carrier-address"),
        inspectionaddress: formData.get("inspection-address"),
        make: formData.get("make"),
        model: formData.get("model"),
        odometer: Number(formData.get("odometer")),
        truckplate: formData.get("truck-plate"),
        trailerplatea: formData.get("trailer-plate"),
        trailerplateb: formData.get("trailer-plate-b"),
        defects: formData.get("defects"),
        remarks: formData.get("remarks"),
    });

    let sanitizedData: Trip = {
        tripid: 0,
        driveremail: '',
        carrier: '',
        carrieraddress: '',
        inspectionaddress: '',
        make: '',
        model: '',
        odometer: 0,
        truckplate: '',
        trailerplatea: '',
        trailerplateb: '',
        defects: '',
        remarks: '',
        date: new Date(),
    };

    console.log(validatedFields.error)
    if (validatedFields.success) {
        sanitizedData = {
            driveremail: driverEmail,
            carrier: DOMPurify.sanitize(validatedFields.data.carrier ?? ''),
            carrieraddress: DOMPurify.sanitize(validatedFields.data.carrieraddress ?? ''),
            inspectionaddress: DOMPurify.sanitize(validatedFields.data.inspectionaddress ?? ''),
            make: DOMPurify.sanitize(validatedFields.data.make ?? ''),
            model: DOMPurify.sanitize(validatedFields.data.model ?? ''),
            odometer: validatedFields.data.odometer,
            truckplate: DOMPurify.sanitize(validatedFields.data.truckplate ?? ''),
            trailerplatea: DOMPurify.sanitize(validatedFields.data.trailerplatea ?? ''),
            trailerplateb: DOMPurify.sanitize(validatedFields.data.trailerplateb ?? ''),
            defects: DOMPurify.sanitize(validatedFields.data.defects ?? ''),
            remarks: DOMPurify.sanitize(validatedFields.data.remarks ?? ''),
            date: new Date(),
        };
    } else throw new Error("Invalid form data");

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
            ${sanitizedData.carrieraddress},
            ${sanitizedData.inspectionaddress},
            ${sanitizedData.make},
            ${sanitizedData.model},
            ${sanitizedData.odometer},
            ${sanitizedData.truckplate},
            ${sanitizedData.trailerplatea},
            ${sanitizedData.trailerplateb},
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
    } catch (error) {
        console.error("Error fetching:", (error instanceof Error ? error.message : error))
    }
    return { data };
}