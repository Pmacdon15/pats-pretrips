/*
 * The file types the app stores: invoices are re-encoded to JPEG or kept as
 * PDF (src/lib/repairs/compress.ts), signatures are PNG. Client-safe.
 */

/** Images the browser shows in a tab or an <img>, sandboxed. */
export const INLINE_FILE_TYPES: ReadonlySet<string> = new Set([
	'image/jpeg',
	'image/png',
])

/** Every type the app writes. Anything else is served as a plain download. */
export const STORED_FILE_TYPES: ReadonlySet<string> = new Set([
	...INLINE_FILE_TYPES,
	'application/pdf',
])

/** Whether a stored file opens in the browser rather than downloading. */
export function opensInline(type: string | null | undefined) {
	return INLINE_FILE_TYPES.has(type ?? '')
}
