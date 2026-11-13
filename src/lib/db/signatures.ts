import { neon } from '@neondatabase/serverless'
import type { Trip } from '../types/types'
import type { StoredFile } from './repairs'

/*
 * Driver signatures (see src/lib/sql/2026-11-15-pretrip-signatures.sql): the
 * one a driver saves to sign new pre-trips with, and the copy on each signed
 * trip. Every query takes the driver's email, so a driver only ever reads and
 * changes their own.
 */

const sql = () => neon(`${process.env.DATABASE_URL}`)

const toFile = (row: Record<string, unknown> | undefined) =>
	row?.data
		? {
				bytes: Buffer.from(
					String(row.data).replace(/\s+/g, ''),
					'base64',
				),
				type: String(row.type || 'image/png'),
			}
		: undefined

const iso = (value: unknown) => new Date(value as string).toISOString()

export type SavedSignature = StoredFile & { updatedAt: string }

/** The driver's saved signature, if they saved one. */
export async function getSavedSignatureDb(
	driverEmail: string,
): Promise<SavedSignature | undefined> {
	const [row] = await sql()`
        SELECT encode(signature, 'base64') AS data, signature_type AS type, updated_at
        FROM pt_driver_signatures
        WHERE driver_email = ${driverEmail}
    `
	const file = toFile(row)
	return file && { ...file, updatedAt: iso(row.updated_at) }
}

/** When the driver last saved their signature, or null without one. */
export async function getSavedSignatureDateDb(
	driverEmail: string,
): Promise<string | null> {
	const [row] = await sql()`
        SELECT updated_at FROM pt_driver_signatures
        WHERE driver_email = ${driverEmail}
    `
	return row ? iso(row.updated_at) : null
}

/** Saves (or replaces) the driver's signature. Returns when it was saved. */
export async function saveSignatureDb(
	driverEmail: string,
	file: StoredFile,
): Promise<string> {
	const [row] = await sql()`
        INSERT INTO pt_driver_signatures (driver_email, signature, signature_type, updated_at)
        VALUES (${driverEmail}, decode(${file.bytes.toString('hex')}::text, 'hex'), ${file.type}, NOW())
        ON CONFLICT (driver_email) DO UPDATE
        SET signature = EXCLUDED.signature,
            signature_type = EXCLUDED.signature_type,
            updated_at = NOW()
        RETURNING updated_at
    `
	return iso(row.updated_at)
}

/** Deletes the driver's saved signature. Signed trips keep theirs. */
export async function deleteSavedSignatureDb(
	driverEmail: string,
): Promise<boolean> {
	const rows = await sql()`
        DELETE FROM pt_driver_signatures
        WHERE driver_email = ${driverEmail}
        RETURNING driver_email
    `
	return rows.length > 0
}

/** The signature on one of the driver's trips, if it was signed. */
export async function getTripSignatureDb(
	tripId: number,
	driverEmail: string,
): Promise<StoredFile | undefined> {
	const [row] = await sql()`
        SELECT encode(signature, 'base64') AS data, signature_type AS type
        FROM pt_trip_signatures
        WHERE trip_id = ${tripId} AND driver_email = ${driverEmail}
    `
	return toFile(row)
}

/**
 * Signs one of the driver's unsigned trips from the last 24 hours. Undefined
 * when the trip isn't theirs, is older, or was already signed.
 */
export async function signTripDb(
	tripId: number,
	driverEmail: string,
	file: StoredFile,
	source: string,
): Promise<Trip | undefined> {
	const [row] = await sql()`
        WITH t AS (
            UPDATE PTTrips SET signed_at = NOW()
            WHERE tripId = ${tripId}
            AND driverEmail = ${driverEmail}
            AND signed_at IS NULL
            AND date >= NOW() - INTERVAL '24 hours'
            RETURNING *
        ), s AS (
            INSERT INTO pt_trip_signatures (trip_id, driver_email, signature, signature_type, source)
            SELECT tripId, driverEmail, decode(${file.bytes.toString('hex')}::text, 'hex'), ${file.type}, ${source}
            FROM t
        )
        SELECT * FROM t
    `
	return row as Trip | undefined
}
