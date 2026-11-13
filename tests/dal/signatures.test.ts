import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trip } from '../helpers/fixtures'

const mocks = vi.hoisted(() => ({
	email: vi.fn(),
	getSavedSignatureDateDb: vi.fn(),
	saveSignatureDb: vi.fn(),
	deleteSavedSignatureDb: vi.fn(),
	signTripDb: vi.fn(),
	compressSignature: vi.fn(),
	resolveSignature: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getDriverEmail: mocks.email }))
vi.mock('@/lib/db/signatures', () => ({
	getSavedSignatureDateDb: mocks.getSavedSignatureDateDb,
	saveSignatureDb: mocks.saveSignatureDb,
	deleteSavedSignatureDb: mocks.deleteSavedSignatureDb,
	signTripDb: mocks.signTripDb,
}))
vi.mock('@/lib/repairs/compress', async (original) => ({
	...(await original<typeof import('@/lib/repairs/compress')>()),
	compressSignature: mocks.compressSignature,
}))
vi.mock('@/lib/signatures/signatures', () => ({
	resolveSignature: mocks.resolveSignature,
}))

import {
	deleteSignatureDAL,
	getSignatureStatusDAL,
	saveSignatureDAL,
	signTripDAL,
} from '@/lib/DAL/signatures'
import { FileError } from '@/lib/repairs/compress'

const PNG = { bytes: Buffer.from('png'), type: 'image/png' }
const DRAWN = 'data:image/png;base64,aGk='
const WHEN = '2026-11-15T10:00:00.000Z'

beforeEach(() => {
	mocks.email.mockResolvedValue('pat@x.com')
	mocks.compressSignature.mockResolvedValue(PNG)
	mocks.saveSignatureDb.mockResolvedValue(WHEN)
	mocks.deleteSavedSignatureDb.mockResolvedValue(true)
	mocks.resolveSignature.mockResolvedValue({ ok: true, file: PNG })
	mocks.signTripDb.mockResolvedValue(trip({ signed_at: WHEN }))
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('getSignatureStatusDAL', () => {
	it('says whether the driver has a saved signature', async () => {
		mocks.getSavedSignatureDateDb.mockResolvedValue(WHEN)
		await expect(getSignatureStatusDAL()).resolves.toEqual({
			saved: true,
			updatedAt: WHEN,
		})
		mocks.getSavedSignatureDateDb.mockResolvedValue(null)
		await expect(getSignatureStatusDAL()).resolves.toEqual({
			saved: false,
			updatedAt: null,
		})
	})

	it('has none when signed out', async () => {
		mocks.email.mockResolvedValue(null)
		await expect(getSignatureStatusDAL()).resolves.toEqual({
			saved: false,
			updatedAt: null,
		})
		expect(mocks.getSavedSignatureDateDb).not.toHaveBeenCalled()
	})
})

describe('saveSignatureDAL', () => {
	it('compresses and saves the drawn signature', async () => {
		const result = await saveSignatureDAL(DRAWN)
		expect(result._unsafeUnwrap()).toEqual({ saved: true, updatedAt: WHEN })
		expect(mocks.saveSignatureDb).toHaveBeenCalledWith('pat@x.com', PNG)
	})

	it.each([
		'',
		'saved',
		'hello',
	])('needs a drawn signature (%j)', async (value) => {
		const result = await saveSignatureDAL(value)
		expect(result._unsafeUnwrapErr()).toEqual({
			reason: 'Sign in the box first.',
		})
	})

	it('says what is wrong with the image, or that saving failed', async () => {
		mocks.compressSignature.mockRejectedValueOnce(
			new FileError('Bad image'),
		)
		expect((await saveSignatureDAL(DRAWN))._unsafeUnwrapErr()).toEqual({
			reason: 'Bad image',
		})
		mocks.saveSignatureDb.mockRejectedValueOnce(new Error('down'))
		expect((await saveSignatureDAL(DRAWN))._unsafeUnwrapErr()).toEqual({
			reason: 'Could not save your signature. Please try again.',
		})
	})

	it('requires a signed-in driver', async () => {
		mocks.email.mockResolvedValue(null)
		expect((await saveSignatureDAL(DRAWN))._unsafeUnwrapErr()).toEqual({
			reason: 'Must be logged in',
		})
	})
})

describe('deleteSignatureDAL', () => {
	it('deletes the saved signature', async () => {
		expect((await deleteSignatureDAL())._unsafeUnwrap()).toEqual({
			saved: false,
			updatedAt: null,
		})
		expect(mocks.deleteSavedSignatureDb).toHaveBeenCalledWith('pat@x.com')
	})

	it('reports a failure, and needs a signed-in driver', async () => {
		mocks.deleteSavedSignatureDb.mockRejectedValueOnce(new Error('down'))
		expect((await deleteSignatureDAL())._unsafeUnwrapErr()).toEqual({
			reason: 'Could not delete your signature. Please try again.',
		})
		mocks.email.mockResolvedValue(null)
		expect((await deleteSignatureDAL())._unsafeUnwrapErr()).toEqual({
			reason: 'Must be logged in',
		})
	})
})

describe('signTripDAL', () => {
	const data = { tripId: 1, signature: 'saved' }

	it('signs the trip', async () => {
		const result = await signTripDAL({ ...data, saveSignature: true })
		expect(result._unsafeUnwrap()).toMatchObject({ signed_at: WHEN })
		expect(mocks.resolveSignature).toHaveBeenCalledWith(
			'pat@x.com',
			'saved',
			true,
		)
		expect(mocks.signTripDb).toHaveBeenCalledWith(
			1,
			'pat@x.com',
			PNG,
			'web',
		)
	})

	it('checks the input and the signature', async () => {
		expect(
			(
				await signTripDAL({ tripId: 0, signature: '' })
			)._unsafeUnwrapErr(),
		).toEqual({
			reason: expect.stringContaining('Sign the pre-trip'),
		})
		mocks.resolveSignature.mockResolvedValueOnce({
			ok: false,
			message: 'No saved signature',
		})
		expect((await signTripDAL(data))._unsafeUnwrapErr()).toEqual({
			reason: 'No saved signature',
		})
		expect(mocks.signTripDb).not.toHaveBeenCalled()
	})

	it("says when the trip can't be signed, or signing failed", async () => {
		mocks.signTripDb.mockResolvedValueOnce(undefined)
		expect((await signTripDAL(data))._unsafeUnwrapErr()).toEqual({
			reason: 'This pre-trip is already signed, or older than 24 hours.',
		})
		mocks.signTripDb.mockRejectedValueOnce(new Error('down'))
		expect((await signTripDAL(data))._unsafeUnwrapErr()).toEqual({
			reason: 'Could not sign the pre-trip. Please try again.',
		})
	})

	it('requires a signed-in driver', async () => {
		mocks.email.mockResolvedValue(null)
		expect((await signTripDAL(data))._unsafeUnwrapErr()).toEqual({
			reason: 'Must be logged in',
		})
	})
})
