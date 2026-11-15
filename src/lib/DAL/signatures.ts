import { errAsync, okAsync } from 'neverthrow'
import { getDriver, getDriverEmail } from '@/lib/auth'
import { recordEvents } from '@/lib/db/audit-events'
import { recordOwner } from '@/lib/db/owner-stamps'
import {
	deleteSavedSignatureDb,
	getSavedSignatureDateDb,
	saveSignatureDb,
	setAiSigningDb,
	signTripDb,
} from '@/lib/db/signatures'
import { errorForLog } from '@/lib/log'
import { rateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { SIGNATURES } from '@/lib/rate-limit/limits'
import {
	compressSignature,
	FileError,
	fromBase64,
} from '@/lib/repairs/compress'
import {
	aiSigningAllowed,
	isMissingAiSigningColumn,
	resolveSignature,
	warnMissingAiSigningColumn,
} from '@/lib/signatures/signatures'
import {
	schemaAllowAiSigning,
	schemaSignature,
	schemaSignTrip,
} from '@/lib/ZOD/schemas'

/* The signed-in driver's saved signature, and signing their trips. */

const NOT_SIGNED_IN = { reason: 'Must be logged in' } as const

/** Why the driver can't save or sign right now, or null when they can. */
async function signatureLimit(email: string) {
	const limited = await rateLimit(SIGNATURES, email)
	return limited.ok ? null : { reason: rateLimitMessage(limited.retryAfter) }
}

export type SignatureStatus = {
	/** The driver has a saved signature to sign new pre-trips with. */
	saved: boolean
	/** When it was saved, as an ISO date; null without one. */
	updatedAt: string | null
	/**
	 * "Allow AI apps to sign for me": AI apps may sign pre-trips with the
	 * saved signature. Always false without one, and before the migration.
	 */
	allowAiSigning: boolean
}

const NO_SIGNATURE: SignatureStatus = {
	saved: false,
	updatedAt: null,
	allowAiSigning: false,
}

export async function getSignatureStatusDAL(): Promise<SignatureStatus> {
	const email = await getDriverEmail()
	if (!email) return NO_SIGNATURE
	const [updatedAt, allowAiSigning] = await Promise.all([
		getSavedSignatureDateDb(email),
		aiSigningAllowed(email),
	])
	return updatedAt ? { saved: true, updatedAt, allowAiSigning } : NO_SIGNATURE
}

/** Saves the signature the driver drew (a PNG data URL) as their saved one. */
export async function saveSignatureDAL(dataUrl: string) {
	const driver = await getDriver()
	if (!driver) return errAsync(NOT_SIGNED_IN)
	const { email } = driver
	const limited = await signatureLimit(email)
	if (limited) return errAsync(limited)
	const parsed = schemaSignature.safeParse(dataUrl)
	if (!parsed.success || parsed.data === 'saved') {
		return errAsync({ reason: 'Sign in the box first.' } as const)
	}
	try {
		const file = await compressSignature(fromBase64(parsed.data))
		const updatedAt = await saveSignatureDb(email, file)
		await recordOwner(driver, { table: 'driver_signature' })
		await recordEvents(driver, { action: 'signature.saved', source: 'web' })
		// Replacing a signature keeps the driver's AI signing choice.
		const allowAiSigning = await aiSigningAllowed(email)
		return okAsync({
			saved: true,
			updatedAt,
			allowAiSigning,
		} as SignatureStatus)
	} catch (e) {
		if (e instanceof FileError) return errAsync({ reason: e.message })
		console.error('Error saving signature: ', errorForLog(e))
		return errAsync({
			reason: 'Could not save your signature. Please try again.',
		} as const)
	}
}

export async function deleteSignatureDAL() {
	const driver = await getDriver()
	if (!driver) return errAsync(NOT_SIGNED_IN)
	try {
		// The AI signing choice goes with it (it's on the same row).
		const deleted = await deleteSavedSignatureDb(driver.email)
		if (deleted) {
			await recordEvents(driver, {
				action: 'signature.deleted',
				source: 'web',
			})
		}
		return okAsync(NO_SIGNATURE)
	} catch (e) {
		console.error('Error deleting signature: ', errorForLog(e))
		return errAsync({
			reason: 'Could not delete your signature. Please try again.',
		} as const)
	}
}

/**
 * Turns "Allow AI apps to sign for me" on or off. Only with a saved
 * signature, since that's what AI apps sign with.
 */
export async function setAiSigningDAL(allow: unknown) {
	const driver = await getDriver()
	if (!driver) return errAsync(NOT_SIGNED_IN)
	const { email } = driver
	const limited = await signatureLimit(email)
	if (limited) return errAsync(limited)
	const parsed = schemaAllowAiSigning.safeParse(allow)
	if (!parsed.success) {
		return errAsync({
			reason: parsed.error.issues.map((i) => i.message).join(', '),
		})
	}
	try {
		const row = await setAiSigningDb(email, parsed.data)
		if (!row) {
			return errAsync({
				reason: 'Save a signature first, then choose whether AI apps can sign with it.',
			} as const)
		}
		await recordEvents(driver, {
			action: 'signature.ai_signing_changed',
			source: 'web',
			details: { allow_ai_signing: row.allowAiSigning },
		})
		return okAsync({ saved: true, ...row } as SignatureStatus)
	} catch (e) {
		if (isMissingAiSigningColumn(e)) {
			warnMissingAiSigningColumn()
			return errAsync({
				reason: "This setting isn't available yet. Please try again later.",
			} as const)
		}
		console.error('Error changing AI signing: ', errorForLog(e))
		return errAsync({
			reason: 'Could not change the setting. Please try again.',
		} as const)
	}
}

/** Signs one of the driver's unsigned pre-trips from the last 24 hours. */
export async function signTripDAL(data: {
	tripId: number
	signature: string
	saveSignature?: boolean
}) {
	const driver = await getDriver()
	if (!driver) return errAsync(NOT_SIGNED_IN)
	const { email } = driver
	const limited = await signatureLimit(email)
	if (limited) return errAsync(limited)
	const parsed = schemaSignTrip.safeParse(data)
	if (!parsed.success) {
		return errAsync({
			reason: parsed.error.issues.map((i) => i.message).join(', '),
		})
	}
	try {
		const signed = await resolveSignature(
			email,
			parsed.data.signature,
			parsed.data.saveSignature,
			driver.userId,
		)
		if (!signed.ok) return errAsync({ reason: signed.message })
		const trip = await signTripDb(
			parsed.data.tripId,
			email,
			signed.file,
			'web',
		)
		if (!trip) {
			return errAsync({
				reason: 'This pre-trip is already signed, or older than 24 hours.',
			} as const)
		}
		await recordOwner(
			driver,
			{ table: 'trip', tripId: parsed.data.tripId },
			{ table: 'trip_signature', tripId: parsed.data.tripId },
		)
		await recordEvents(driver, {
			action: 'trip.signed',
			source: 'web',
			tripId: parsed.data.tripId,
			details: {
				signature:
					parsed.data.signature === 'saved' ? 'saved' : 'drawn',
			},
		})
		return okAsync(trip)
	} catch (e) {
		console.error('Error signing trip: ', errorForLog(e))
		return errAsync({
			reason: 'Could not sign the pre-trip. Please try again.',
		} as const)
	}
}
