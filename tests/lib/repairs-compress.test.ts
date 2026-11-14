// @vitest-environment node
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import {
	compressInvoice,
	compressSignature,
	FileError,
	fromBase64,
	MAX_INPUT_PIXELS,
	MAX_UPLOAD_BYTES,
	sniff,
} from '@/lib/repairs/compress'

const photo = (width: number, height: number) =>
	sharp({
		create: {
			width,
			height,
			channels: 3,
			background: { r: 200, g: 120, b: 40 },
		},
	})
		.png()
		.toBuffer()

async function pdf(pages = 3) {
	const doc = await PDFDocument.create()
	for (let i = 0; i < pages; i++) {
		doc.addPage().drawText(`Invoice page ${i}`)
	}
	return doc.save({ useObjectStreams: false })
}

const bytes = (...b: number[]) => new Uint8Array(b)

describe('sniff', () => {
	it('tells files apart by their first bytes', () => {
		expect(sniff(bytes(0x25, 0x50, 0x44, 0x46))).toBe('pdf')
		expect(sniff(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg')
		expect(sniff(bytes(0x89, 0x50, 0x4e, 0x47))).toBe('png')
		expect(sniff(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe(
			'webp',
		)
		expect(sniff(new TextEncoder().encode('\0\0\0\x18ftypheic'))).toBe(
			'heic',
		)
		expect(sniff(new TextEncoder().encode('\0\0\0\x18ftypisom'))).toBe(null)
		expect(sniff(new TextEncoder().encode('RIFF\0\0\0\0WAVE'))).toBe(null)
		expect(sniff(new TextEncoder().encode('<html>'))).toBe(null)
	})
})

describe('compressInvoice', () => {
	it('turns a big photo into a JPEG no larger than 1600px', async () => {
		const input = await photo(3200, 2400)
		const out = await compressInvoice(input, 'IMG 0001.PNG')
		expect(out.type).toBe('image/jpeg')
		expect(out.name).toBe('IMG 0001.jpg')
		expect(out.originalSize).toBe(input.length)
		const meta = await sharp(out.bytes).metadata()
		expect(meta.format).toBe('jpeg')
		expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(1600)
	})

	it('rewrites a PDF smaller, or keeps it when that is not smaller', async () => {
		const input = await pdf()
		const out = await compressInvoice(input, 'bill.pdf')
		expect(out.type).toBe('application/pdf')
		expect(out.name).toBe('bill.pdf')
		expect(out.bytes.length).toBeLessThanOrEqual(input.length)
		expect((await PDFDocument.load(out.bytes)).getPageCount()).toBe(3)

		const tight = await PDFDocument.create()
		tight.addPage()
		const small = await tight.save({ useObjectStreams: true })
		const kept = await compressInvoice(small)
		expect(kept.name).toBe('invoice.pdf')
		expect(kept.bytes.length).toBeLessThanOrEqual(small.length)
	})

	it('names the file "invoice" when the name has nothing usable', async () => {
		const out = await compressInvoice(await photo(10, 10), '***.png')
		expect(out.name).toBe('invoice.jpg')
	})

	it('refuses empty, huge, unknown and broken files', async () => {
		await expect(compressInvoice(new Uint8Array())).rejects.toThrow('empty')
		await expect(
			compressInvoice(new Uint8Array(MAX_UPLOAD_BYTES + 1)),
		).rejects.toThrow('larger than 8 MB')
		await expect(
			compressInvoice(new TextEncoder().encode('hello there')),
		).rejects.toThrow('PDF or a photo')
		await expect(
			compressInvoice(bytes(0xff, 0xd8, 0xff, 0, 1, 2)),
		).rejects.toThrow('photo could not be read')
		await expect(
			compressInvoice(new TextEncoder().encode('\0\0\0\x18ftypheic')),
		).rejects.toThrow('Send it as a JPEG')
		await expect(
			compressInvoice(new TextEncoder().encode('%PDF-1.7 broken')),
		).rejects.toBeInstanceOf(FileError)
	})

	it('accepts a 50 MP phone photo but refuses anything over the pixel cap', async () => {
		const phone = await compressInvoice(await photo(8160, 6144))
		expect(phone.type).toBe('image/jpeg')

		const side = Math.ceil(Math.sqrt(MAX_INPUT_PIXELS)) + 1
		const bomb = await photo(side, side)
		expect(bomb.length).toBeLessThan(MAX_UPLOAD_BYTES)
		const error = await compressInvoice(bomb).catch((e) => e)
		expect(error).toBeInstanceOf(FileError)
		expect(error.message).toBe('The invoice photo could not be read.')
	})

	it('refuses a truncated JPEG', async () => {
		const jpeg = await sharp(await photo(400, 300))
			.jpeg()
			.toBuffer()
		await expect(
			compressInvoice(jpeg.subarray(0, Math.floor(jpeg.length / 2))),
		).rejects.toThrow('The invoice photo could not be read.')
	})

	it('refuses an invoice still over 3 MB after compression', async () => {
		vi.resetModules()
		vi.doMock('sharp', () => ({
			default: () => ({
				rotate() {
					return this
				},
				resize() {
					return this
				},
				jpeg() {
					return this
				},
				toBuffer: async () => Buffer.alloc(4 * 1024 * 1024),
			}),
		}))
		const fresh = await import('@/lib/repairs/compress')
		await expect(
			fresh.compressInvoice(bytes(0xff, 0xd8, 0xff, 0)),
		).rejects.toThrow('still larger than 3 MB')
		vi.doUnmock('sharp')
		vi.resetModules()
	})
})

describe('compressSignature', () => {
	it('makes a small PNG', async () => {
		const out = await compressSignature(await photo(1600, 400))
		expect(out.type).toBe('image/png')
		const meta = await sharp(out.bytes).metadata()
		expect(meta.width).toBe(800)
	})

	it('refuses empty, huge, PDF and broken images', async () => {
		await expect(compressSignature(new Uint8Array())).rejects.toThrow(
			'empty',
		)
		await expect(
			compressSignature(new Uint8Array(MAX_UPLOAD_BYTES + 1)),
		).rejects.toThrow('too large')
		await expect(compressSignature(await pdf(1))).rejects.toThrow(
			'PNG or JPEG',
		)
		await expect(
			compressSignature(bytes(0x89, 0x50, 0x4e, 0x47, 0)),
		).rejects.toThrow('could not be read')
	})

	it('refuses a signature over the pixel cap', async () => {
		const side = Math.ceil(Math.sqrt(MAX_INPUT_PIXELS)) + 1
		await expect(
			compressSignature(await photo(side, side)),
		).rejects.toThrow('The signature image could not be read.')
	})
})

describe('fromBase64', () => {
	it('reads base64 with or without a data URL', () => {
		expect([...fromBase64('aGk=')]).toEqual([104, 105])
		expect([...fromBase64('data:image/png;base64,aG\nk=')]).toEqual([
			104, 105,
		])
	})

	it('refuses what is not base64', () => {
		expect(() => fromBase64('not base64!')).toThrow(FileError)
	})
})
