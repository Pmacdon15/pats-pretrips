import type { StoredFile } from '@/lib/db/repairs'
import { fileResponse } from '@/lib/file-response'

/** A signature image for the driver's browser, or a 404 without one. */
export function signatureResponse(file: StoredFile | undefined) {
	if (!file) return new Response('Not found', { status: 404 })
	// Private and short: a replaced signature shows up soon after.
	return fileResponse({ bytes: file.bytes, type: file.type, maxAge: 60 })
}
