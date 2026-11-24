/*
 * Signatures are stored as dark ink on a transparent PNG. Email apps in dark
 * mode put that on a near-black background, where the ink all but vanishes,
 * and they recolour the HTML around an image but never the image itself. So
 * the email gets the signature flattened onto solid white, with a margin.
 */

const PADDING = 16

/**
 * The signature as an opaque PNG on white, or the bytes as they were when
 * they can't be read as an image (the email is sent either way).
 */
export async function signatureOnWhite(bytes: Uint8Array): Promise<Uint8Array> {
	try {
		const sharp = (await import('sharp')).default
		return await sharp(bytes, { failOn: 'warning' })
			.flatten({ background: '#ffffff' })
			.extend({
				top: PADDING,
				bottom: PADDING,
				left: PADDING,
				right: PADDING,
				background: '#ffffff',
			})
			.png({ compressionLevel: 9 })
			.toBuffer()
	} catch {
		return bytes
	}
}
