import type { StoredFile } from '@/lib/db/repairs'
import { getSavedSignatureDb, saveSignatureDb } from '@/lib/db/signatures'
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
 * kept as the saved signature when `save` is set).
 */
export async function resolveSignature(
	driverEmail: string,
	value: string,
	save = false,
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
	if (save) await saveSignatureDb(driverEmail, file)
	return { ok: true, file }
}
