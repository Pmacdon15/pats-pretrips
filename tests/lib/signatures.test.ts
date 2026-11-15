import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	getAiSigningAllowedDb: vi.fn(),
	getSavedSignatureDb: vi.fn(),
	saveSignatureDb: vi.fn(),
	compressSignature: vi.fn(),
	recordOwner: vi.fn(),
	recordEvents: vi.fn(),
}))
vi.mock('@/lib/db/owner-stamps', () => ({ recordOwner: mocks.recordOwner }))
vi.mock('@/lib/db/audit-events', () => ({ recordEvents: mocks.recordEvents }))
vi.mock('@/lib/db/signatures', () => ({
	getAiSigningAllowedDb: mocks.getAiSigningAllowedDb,
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
	aiSigningAllowed,
	isMissingAiSigningColumn,
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

		expect(mocks.recordOwner).not.toHaveBeenCalled()
		expect(mocks.recordEvents).not.toHaveBeenCalled()

		await resolveSignature('pat@x.com', DRAWN, true, 'user_1')
		expect(mocks.saveSignatureDb).toHaveBeenCalledWith('pat@x.com', PNG)
		// The saved signature is stamped with the driver's Clerk user.
		expect(mocks.recordOwner).toHaveBeenCalledWith(
			{ email: 'pat@x.com', userId: 'user_1' },
			{ table: 'driver_signature' },
		)
		// And the save is in the audit trail (not the image).
		expect(mocks.recordEvents).toHaveBeenCalledWith(
			{ email: 'pat@x.com', userId: 'user_1' },
			{
				action: 'signature.saved',
				source: 'web',
				details: { while_signing: true },
			},
		)
	})

	it('records nothing for the saved signature, or a bad image', async () => {
		mocks.getSavedSignatureDb.mockResolvedValue({ ...PNG, updatedAt: 'x' })
		await resolveSignature('pat@x.com', 'saved', true)
		mocks.compressSignature.mockRejectedValueOnce(new FileError('bad'))
		await resolveSignature('pat@x.com', DRAWN, true)
		expect(mocks.saveSignatureDb).not.toHaveBeenCalled()
		expect(mocks.recordEvents).not.toHaveBeenCalled()
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

describe('aiSigningAllowed', () => {
	it("reads the driver's setting", async () => {
		mocks.getAiSigningAllowedDb.mockResolvedValueOnce(true)
		await expect(aiSigningAllowed('pat@x.com')).resolves.toBe(true)
		mocks.getAiSigningAllowedDb.mockResolvedValueOnce(false)
		await expect(aiSigningAllowed('pat@x.com')).resolves.toBe(false)
		expect(mocks.getAiSigningAllowedDb).toHaveBeenCalledWith('pat@x.com')
	})

	it('is off before the migration, and logs that once', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		mocks.getAiSigningAllowedDb.mockRejectedValue(
			Object.assign(new Error('column does not exist'), {
				code: '42703',
			}),
		)
		await expect(aiSigningAllowed('pat@x.com')).resolves.toBe(false)
		mocks.getAiSigningAllowedDb.mockRejectedValue(
			Object.assign(new Error('relation does not exist'), {
				code: '42P01',
			}),
		)
		await expect(aiSigningAllowed('pat@x.com')).resolves.toBe(false)
		expect(error).toHaveBeenCalledTimes(1)
		expect(error.mock.calls[0][0]).toMatch(
			/allow_ai_signing column is missing.*2026-11-17-ai-signing-setting\.sql/,
		)
		error.mockRestore()
	})

	it('throws any other database error', async () => {
		mocks.getAiSigningAllowedDb.mockRejectedValueOnce(new Error('down'))
		await expect(aiSigningAllowed('pat@x.com')).rejects.toThrow('down')
	})
})

describe('isMissingAiSigningColumn', () => {
	it('knows the missing column and missing table codes', () => {
		expect(isMissingAiSigningColumn({ code: '42703' })).toBe(true)
		expect(isMissingAiSigningColumn({ code: '42P01' })).toBe(true)
		expect(isMissingAiSigningColumn({ code: '23505' })).toBe(false)
		expect(isMissingAiSigningColumn(new Error('x'))).toBe(false)
		expect(isMissingAiSigningColumn(null)).toBe(false)
		expect(isMissingAiSigningColumn('42703')).toBe(false)
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
