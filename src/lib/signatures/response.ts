import type { StoredFile } from '@/lib/db/repairs'

/** A signature image for the driver's browser, or a 404 without one. */
export function signatureResponse(file: StoredFile | undefined) {
	if (!file) return new Response('Not found', { status: 404 })
	return new Response(new Uint8Array(file.bytes), {
		headers: {
			'Content-Type': file.type,
			'Content-Length': String(file.bytes.length),
			// Private and short: a replaced signature shows up soon after.
			'Cache-Control': 'private, max-age=60',
			'X-Content-Type-Options': 'nosniff',
		},
	})
}
