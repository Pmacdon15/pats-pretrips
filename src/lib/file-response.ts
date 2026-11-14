import { opensInline, STORED_FILE_TYPES } from '@/lib/file-types'
import { FILE_CSP } from '@/lib/security-headers'

export type FileResponseOptions = {
	bytes: Buffer
	/** The type stored with the file. Only the app's own types are trusted. */
	type: string
	/** A filename already stripped to safe characters. */
	name?: string
	/** ?download: save the file even when it could open in the browser. */
	download?: boolean
	/** Seconds the browser may keep it. Always private. */
	maxAge: number
}

/**
 * A stored file (invoice or signature) for its owner's browser, made inert.
 *
 * Images open inline under FILE_CSP, whose `sandbox` gives the document an
 * opaque origin. PDFs always download: Chrome's viewer renders a sandboxed
 * PDF only by leaving it in the app's origin, with its embedded JavaScript
 * running, so a shop's PDF opens in the driver's PDF reader instead. A type
 * the app never writes is served as an opaque download.
 */
export function fileResponse({
	bytes,
	type,
	name,
	download = false,
	maxAge,
}: FileResponseOptions) {
	const disposition = !download && opensInline(type) ? 'inline' : 'attachment'
	return new Response(new Uint8Array(bytes), {
		headers: {
			'Content-Type': STORED_FILE_TYPES.has(type)
				? type
				: 'application/octet-stream',
			'Content-Length': String(bytes.length),
			'Content-Disposition': name
				? `${disposition}; filename="${name}"`
				: disposition,
			'Cache-Control': `private, max-age=${maxAge}`,
			'X-Content-Type-Options': 'nosniff',
			// next.config.ts sends the same policy for these routes: a header
			// set there replaces the route's own. This keeps it on the
			// response however the route is served.
			'Content-Security-Policy': FILE_CSP,
		},
	})
}
