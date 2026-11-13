/** Where the app serves the driver's saved signature. */
export const SAVED_SIGNATURE_PATH = '/api/signature'

/** Where the app serves the signature on one of the driver's trips. */
export function tripSignaturePath(tripId: number) {
	return `/api/trips/${tripId}/signature`
}
