import { recordOwner } from '@/lib/db/owner-stamps'
import type { StoredFile } from '@/lib/db/repairs'
import {
	getAiSigningAllowedDb,
	getSavedSignatureDb,
	saveSignatureDb,
} from '@/lib/db/signatures'
import {
	compressSignature,
	FileError,
	fromBase64,
} from '@/lib/repairs/compress'

/*
 * Turning what the web form sends into the signature to store: "saved" means
 * the driver's saved signature, anything else is the PNG they drew.
 */

export const NO_SAVED_SIGNATURE =
	"You don't have a saved signature anymore. Sign the pre-trip in the box."

export type ResolvedSignature =
	| { ok: true; file: StoredFile }
	| { ok: false; message: string }

/**
 * The signature for a trip: the saved one, or the drawn one compressed (and
 * kept as the saved signature when `save` is set, recording `userId`, the
 * driver's Clerk user ID, on it; see src/lib/db/owner-stamps.ts).
 */
export async function resolveSignature(
	driverEmail: string,
	value: string,
	save = false,
	userId?: string | null,
): Promise<ResolvedSignature> {
	if (value === 'saved') {
		const saved = await getSavedSignatureDb(driverEmail)
		return saved
			? { ok: true, file: { bytes: saved.bytes, type: saved.type } }
			: { ok: false, message: NO_SAVED_SIGNATURE }
	}
	let file: StoredFile
	try {
		file = await compressSignature(fromBase64(value))
	} catch (error) {
		if (error instanceof FileError) {
			return { ok: false, message: error.message }
		}
		throw error
	}
	if (save) {
		await saveSignatureDb(driverEmail, file)
		await recordOwner(
			{ email: driverEmail, userId },
			{ table: 'driver_signature' },
		)
	}
	return { ok: true, file }
}

/*
 * "Allow AI apps to sign for me". The code is deployed before the owner runs
 * src/lib/sql/2026-11-17-ai-signing-setting.sql, so until then the column (or,
 * without the signatures migration, the table) is missing. That reads as
 * "off": AI apps can't sign, and the web app's own signing is unaffected.
 */

const MISSING_SCHEMA_CODES = new Set(['42703', '42P01'])

/** Postgres's "undefined column" or "undefined table" error. */
export const isMissingAiSigningColumn = (e: unknown) =>
	typeof e === 'object' &&
	e !== null &&
	MISSING_SCHEMA_CODES.has(String((e as { code?: unknown }).code))

let warnedMissingColumn = false

/** Logs, once per server instance, that the migration hasn't run. */
export function warnMissingAiSigningColumn() {
	if (warnedMissingColumn) return
	warnedMissingColumn = true
	console.error(
		'Signatures: the pt_driver_signatures.allow_ai_signing column is missing, so AI apps cannot sign pre-trips. Run src/lib/sql/2026-11-17-ai-signing-setting.sql.',
	)
}

/**
 * Whether the driver lets AI apps sign with their saved signature: false
 * without a saved signature, without the setting turned on, or before the
 * migration has run. Other database errors are thrown.
 */
export async function aiSigningAllowed(driverEmail: string): Promise<boolean> {
	try {
		return await getAiSigningAllowedDb(driverEmail)
	} catch (error) {
		if (!isMissingAiSigningColumn(error)) throw error
		warnMissingAiSigningColumn()
		return false
	}
}
