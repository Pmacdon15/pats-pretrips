import { PDFDocument } from 'pdf-lib'
import type { StoredFile } from '@/lib/db/repairs'

/*
 * Invoices and signatures are compressed before they're stored, whether they
 * came from the web app or an AI assistant: photos become a JPEG no larger
 * than 1600px, PDFs are rewritten with compressed object streams (kept as
 * they were if that isn't smaller), signatures become a small PNG.
 */

/** Largest file accepted before compression. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024
/** Largest invoice stored after compression. */
export const MAX_STORED_BYTES = 3 * 1024 * 1024

const INVOICE_PX = 1600
const SIGNATURE_PX = 800

/**
 * Largest image (width x height) sharp will decode. A 48 or 50 MP phone
 * photo (up to 8160 x 6144) fits; a small file that claims a huge canvas
 * (a decompression bomb) is refused before it is decoded.
 */
export const MAX_INPUT_PIXELS = 64_000_000

/*
 * Every upload is untrusted, so sharp refuses images that are too large,
 * and truncated or corrupt data ("warning" is the strictest level).
 */
const SHARP_INPUT = {
	limitInputPixels: MAX_INPUT_PIXELS,
	failOn: 'warning',
} as const

export type FileKind = 'pdf' | 'jpeg' | 'png' | 'webp' | 'heic'

/** What the file really is, from its first bytes (never the name or type sent). */
export function sniff(bytes: Uint8Array): FileKind | null {
	const at = (i: number, ...b: number[]) =>
		b.every((v, j) => bytes[i + j] === v)
	if (at(0, 0x25, 0x50, 0x44, 0x46)) return 'pdf' // %PDF
	if (at(0, 0xff, 0xd8, 0xff)) return 'jpeg'
	if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'png'
	if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50))
		return 'webp'
	if (at(4, 0x66, 0x74, 0x79, 0x70)) {
		const brand = String.fromCharCode(...bytes.slice(8, 12))
		if (/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(brand)) return 'heic'
	}
	return null
}

export class FileError extends Error {}

async function loadSharp() {
	return (await import('sharp')).default
}

function baseName(name: string | undefined, ext: string) {
	const stem = (name || 'invoice')
		.replace(/\.[^.]*$/, '')
		.replace(/[^\w\- ]+/g, '')
		.trim()
		.slice(0, 80)
	return `${stem || 'invoice'}.${ext}`
}

export type CompressedInvoice = StoredFile & {
	name: string
	originalSize: number
}

/** The invoice ready to store, or a FileError saying what's wrong with it. */
export async function compressInvoice(
	input: Uint8Array,
	name?: string,
): Promise<CompressedInvoice> {
	if (input.length === 0) throw new FileError('The invoice file is empty.')
	if (input.length > MAX_UPLOAD_BYTES) {
		throw new FileError('The invoice is larger than 8 MB.')
	}
	const kind = sniff(input)
	if (!kind) {
		throw new FileError(
			'The invoice must be a PDF or a photo (JPEG, PNG, WebP or HEIC).',
		)
	}

	let out: StoredFile
	if (kind === 'pdf') {
		out = { bytes: await compressPdf(input), type: 'application/pdf' }
	} else {
		const sharp = await loadSharp()
		try {
			const bytes = await sharp(input, SHARP_INPUT)
				.rotate()
				.resize(INVOICE_PX, INVOICE_PX, {
					fit: 'inside',
					withoutEnlargement: true,
				})
				.jpeg({ quality: 70, mozjpeg: true })
				.toBuffer()
			out = { bytes, type: 'image/jpeg' }
		} catch {
			throw new FileError(
				kind === 'heic'
					? 'This HEIC photo could not be read. Send it as a JPEG.'
					: 'The invoice photo could not be read.',
			)
		}
	}

	if (out.bytes.length > MAX_STORED_BYTES) {
		throw new FileError(
			'The invoice is still larger than 3 MB after compression. Send a photo or a smaller PDF.',
		)
	}
	return {
		...out,
		name: baseName(name, out.type === 'application/pdf' ? 'pdf' : 'jpg'),
		originalSize: input.length,
	}
}

async function compressPdf(input: Uint8Array) {
	const original = Buffer.from(input)
	try {
		const doc = await PDFDocument.load(input, {
			ignoreEncryption: true,
			updateMetadata: false,
		})
		const bytes = Buffer.from(await doc.save({ useObjectStreams: true }))
		return bytes.length < original.length ? bytes : original
	} catch {
		throw new FileError('The invoice PDF could not be read.')
	}
}

/** The signature as a small PNG. */
export async function compressSignature(
	input: Uint8Array,
): Promise<StoredFile> {
	if (input.length === 0) throw new FileError('The signature is empty.')
	if (input.length > MAX_UPLOAD_BYTES) {
		throw new FileError('The signature image is too large.')
	}
	const kind = sniff(input)
	if (!kind || kind === 'pdf') {
		throw new FileError('The signature must be a PNG or JPEG image.')
	}
	const sharp = await loadSharp()
	try {
		const bytes = await sharp(input, SHARP_INPUT)
			.rotate()
			.resize(SIGNATURE_PX, SIGNATURE_PX, {
				fit: 'inside',
				withoutEnlargement: true,
			})
			.png({ compressionLevel: 9, palette: true })
			.toBuffer()
		return { bytes, type: 'image/png' }
	} catch {
		throw new FileError('The signature image could not be read.')
	}
}

/** Bytes from base64, with or without a data: URL prefix. */
export function fromBase64(value: string): Uint8Array {
	const data = value.replace(/^data:[^,]*,/, '').replace(/\s+/g, '')
	if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(data)) {
		throw new FileError('The file is not valid base64.')
	}
	return new Uint8Array(Buffer.from(data, 'base64'))
}
