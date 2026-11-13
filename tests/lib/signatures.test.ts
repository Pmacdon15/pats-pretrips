import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	getSavedSignatureDb: vi.fn(),
	saveSignatureDb: vi.fn(),
	compressSignature: vi.fn(),
}))
vi.mock('@/lib/db/signatures', () => ({
	getSavedSignatureDb: mocks.getSavedSignatureDb,
	saveSignatureDb: mocks.saveSignatureDb,
}))
vi.mock('@/lib/repairs/compress', async (original) => ({
	...(await original<typeof import('@/lib/repairs/compress')>()),
	compressSignature: mocks.compressSignature,
}))

import { FileError } from '@/lib/repairs/compress'
import { SAVED_SIGNATURE_PATH, tripSignaturePath } from '@/lib/signatures/paths'
import { signatureResponse } from '@/lib/signatures/response'
import {
	NO_SAVED_SIGNATURE,
	resolveSignature,
} from '@/lib/signatures/signatures'

const PNG = { bytes: Buffer.from('png'), type: 'image/png' }
const DRAWN = 'data:image/png;base64,aGk='

beforeEach(() => {
	mocks.compressSignature.mockResolvedValue(PNG)
})

describe('resolveSignature', () => {
	it('uses the saved signature', async () => {
		mocks.getSavedSignatureDb.mockResolvedValue({ ...PNG, updatedAt: 'x' })
		await expect(resolveSignature('pat@x.com', 'saved')).resolves.toEqual({
			ok: true,
			file: PNG,
		})
		expect(mocks.getSavedSignatureDb).toHaveBeenCalledWith('pat@x.com')
	})

	it('says when there is no saved signature', async () => {
		mocks.getSavedSignatureDb.mockResolvedValue(undefined)
		await expect(resolveSignature('pat@x.com', 'saved')).resolves.toEqual({
			ok: false,
			message: NO_SAVED_SIGNATURE,
		})
	})

	it('compresses a drawn signature, and saves it when asked', async () => {
		await expect(resolveSignature('pat@x.com', DRAWN)).resolves.toEqual({
			ok: true,
			file: PNG,
		})
		expect(mocks.compressSignature).toHaveBeenCalledWith(
			new Uint8Array(Buffer.from('hi')),
		)
		expect(mocks.saveSignatureDb).not.toHaveBeenCalled()

		await resolveSignature('pat@x.com', DRAWN, true)
		expect(mocks.saveSignatureDb).toHaveBeenCalledWith('pat@x.com', PNG)
	})

	it("says what's wrong with a bad image, and rethrows anything else", async () => {
		mocks.compressSignature.mockRejectedValueOnce(
			new FileError('The signature image could not be read.'),
		)
		await expect(resolveSignature('pat@x.com', DRAWN)).resolves.toEqual({
			ok: false,
			message: 'The signature image could not be read.',
		})
		mocks.compressSignature.mockRejectedValueOnce(new Error('sharp'))
		await expect(resolveSignature('pat@x.com', DRAWN)).rejects.toThrow(
			'sharp',
		)
	})
})

describe('signatureResponse', () => {
	it('serves the image privately', async () => {
		const res = signatureResponse(PNG)
		expect(res.status).toBe(200)
		expect(res.headers.get('content-type')).toBe('image/png')
		expect(res.headers.get('content-length')).toBe('3')
		expect(res.headers.get('cache-control')).toContain('private')
		expect(res.headers.get('x-content-type-options')).toBe('nosniff')
		expect(await res.text()).toBe('png')
	})

	it('is a 404 without one', () => {
		expect(signatureResponse(undefined).status).toBe(404)
	})
})

describe('signature paths', () => {
	it('points to the saved and trip signatures', () => {
		expect(SAVED_SIGNATURE_PATH).toBe('/api/signature')
		expect(tripSignaturePath(4)).toBe('/api/trips/4/signature')
	})
})
