import { errAsync, okAsync } from 'neverthrow'
import { getDriverEmail } from '@/lib/auth'
import {
	deleteSavedSignatureDb,
	getSavedSignatureDateDb,
	saveSignatureDb,
	signTripDb,
} from '@/lib/db/signatures'
import {
	compressSignature,
	FileError,
	fromBase64,
} from '@/lib/repairs/compress'
import { resolveSignature } from '@/lib/signatures/signatures'
import { schemaSignature, schemaSignTrip } from '@/lib/ZOD/schemas'

/* The signed-in driver's saved signature, and signing their trips. */

const NOT_SIGNED_IN = { reason: 'Must be logged in' } as const

export type SignatureStatus = {
	/** The driver has a saved signature to sign new pre-trips with. */
	saved: boolean
	/** When it was saved, as an ISO date; null without one. */
	updatedAt: string | null
}

export async function getSignatureStatusDAL(): Promise<SignatureStatus> {
	const email = await getDriverEmail()
	if (!email) return { saved: false, updatedAt: null }
	const updatedAt = await getSavedSignatureDateDb(email)
	return { saved: Boolean(updatedAt), updatedAt }
}

/** Saves the signature the driver drew (a PNG data URL) as their saved one. */
export async function saveSignatureDAL(dataUrl: string) {
	const email = await getDriverEmail()
	if (!email) return errAsync(NOT_SIGNED_IN)
	const parsed = schemaSignature.safeParse(dataUrl)
	if (!parsed.success || parsed.data === 'saved') {
		return errAsync({ reason: 'Sign in the box first.' } as const)
	}
	try {
		const file = await compressSignature(fromBase64(parsed.data))
		const updatedAt = await saveSignatureDb(email, file)
		return okAsync({ saved: true, updatedAt } as SignatureStatus)
	} catch (e) {
		if (e instanceof FileError) return errAsync({ reason: e.message })
		console.error('Error saving signature: ', e)
		return errAsync({
			reason: 'Could not save your signature. Please try again.',
		} as const)
	}
}

export async function deleteSignatureDAL() {
	const email = await getDriverEmail()
	if (!email) return errAsync(NOT_SIGNED_IN)
	try {
		await deleteSavedSignatureDb(email)
		return okAsync({ saved: false, updatedAt: null } as SignatureStatus)
	} catch (e) {
		console.error('Error deleting signature: ', e)
		return errAsync({
			reason: 'Could not delete your signature. Please try again.',
		} as const)
	}
}

/** Signs one of the driver's unsigned pre-trips from the last 24 hours. */
export async function signTripDAL(data: {
	tripId: number
	signature: string
	saveSignature?: boolean
}) {
	const email = await getDriverEmail()
	if (!email) return errAsync(NOT_SIGNED_IN)
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
		return okAsync(trip)
	} catch (e) {
		console.error('Error signing trip: ', e)
		return errAsync({
			reason: 'Could not sign the pre-trip. Please try again.',
		} as const)
	}
}
