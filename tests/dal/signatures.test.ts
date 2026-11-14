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
	rateLimit: vi.fn(),
	recordOwner: vi.fn(),
	setAiSigningDb: vi.fn(),
	aiSigningAllowed: vi.fn(),
	warnMissingAiSigningColumn: vi.fn(),
}))
vi.mock('@/lib/rate-limit', async (original) => ({
	...(await original<typeof import('@/lib/rate-limit')>()),
	rateLimit: mocks.rateLimit,
}))
// `email` stands in for the signed-in driver's email (null when signed out).
vi.mock('@/lib/auth', () => ({
	getDriverEmail: mocks.email,
	getDriver: async () => {
		const email = await mocks.email()
		return email
			? { userId: 'user_1', email, givenName: null, familyName: null }
			: null
	},
}))
vi.mock('@/lib/db/owner-stamps', () => ({ recordOwner: mocks.recordOwner }))
vi.mock('@/lib/db/signatures', () => ({
	getSavedSignatureDateDb: mocks.getSavedSignatureDateDb,
	saveSignatureDb: mocks.saveSignatureDb,
	deleteSavedSignatureDb: mocks.deleteSavedSignatureDb,
	setAiSigningDb: mocks.setAiSigningDb,
	signTripDb: mocks.signTripDb,
}))
vi.mock('@/lib/repairs/compress', async (original) => ({
	...(await original<typeof import('@/lib/repairs/compress')>()),
	compressSignature: mocks.compressSignature,
}))
vi.mock('@/lib/signatures/signatures', async (original) => ({
	...(await original<typeof import('@/lib/signatures/signatures')>()),
	resolveSignature: mocks.resolveSignature,
	aiSigningAllowed: mocks.aiSigningAllowed,
	warnMissingAiSigningColumn: mocks.warnMissingAiSigningColumn,
}))

import {
	deleteSignatureDAL,
	getSignatureStatusDAL,
	saveSignatureDAL,
	setAiSigningDAL,
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
	mocks.rateLimit.mockResolvedValue({ ok: true })
	mocks.aiSigningAllowed.mockResolvedValue(false)
	mocks.setAiSigningDb.mockResolvedValue({
		allowAiSigning: true,
		updatedAt: WHEN,
	})
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('signature rate limit', () => {
	it("counts saving, signing and the AI setting against the driver's limit", async () => {
		await saveSignatureDAL(DRAWN)
		await signTripDAL({ tripId: 1, signature: DRAWN })
		await setAiSigningDAL(true)
		expect(mocks.rateLimit).toHaveBeenCalledTimes(3)
		expect(mocks.rateLimit).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'signatures' }),
			'pat@x.com',
		)
	})

	it('refuses over the limit, before processing the image', async () => {
		mocks.rateLimit.mockResolvedValue({ ok: false, retryAfter: 30 })
		const saved = await saveSignatureDAL(DRAWN)
		expect(saved._unsafeUnwrapErr().reason).toContain('Too many requests')
		const signed = await signTripDAL({ tripId: 1, signature: DRAWN })
		expect(signed._unsafeUnwrapErr().reason).toContain('Too many requests')
		const setting = await setAiSigningDAL(true)
		expect(setting._unsafeUnwrapErr().reason).toContain('Too many requests')
		expect(mocks.compressSignature).not.toHaveBeenCalled()
		expect(mocks.resolveSignature).not.toHaveBeenCalled()
		expect(mocks.setAiSigningDb).not.toHaveBeenCalled()
	})
})

describe('getSignatureStatusDAL', () => {
	it('says whether the driver has a saved signature, and the AI setting', async () => {
		mocks.getSavedSignatureDateDb.mockResolvedValue(WHEN)
		await expect(getSignatureStatusDAL()).resolves.toEqual({
			saved: true,
			updatedAt: WHEN,
			allowAiSigning: false,
		})
		mocks.aiSigningAllowed.mockResolvedValue(true)
		await expect(getSignatureStatusDAL()).resolves.toEqual({
			saved: true,
			updatedAt: WHEN,
			allowAiSigning: true,
		})
		expect(mocks.aiSigningAllowed).toHaveBeenCalledWith('pat@x.com')
		mocks.getSavedSignatureDateDb.mockResolvedValue(null)
		await expect(getSignatureStatusDAL()).resolves.toEqual({
			saved: false,
			updatedAt: null,
			allowAiSigning: false,
		})
	})

	it('has none when signed out', async () => {
		mocks.email.mockResolvedValue(null)
		await expect(getSignatureStatusDAL()).resolves.toEqual({
			saved: false,
			updatedAt: null,
			allowAiSigning: false,
		})
		expect(mocks.getSavedSignatureDateDb).not.toHaveBeenCalled()
	})
})

describe('saveSignatureDAL', () => {
	it('compresses and saves the drawn signature', async () => {
		const result = await saveSignatureDAL(DRAWN)
		expect(result._unsafeUnwrap()).toEqual({
			saved: true,
			updatedAt: WHEN,
			allowAiSigning: false,
		})
		expect(mocks.saveSignatureDb).toHaveBeenCalledWith('pat@x.com', PNG)
		expect(mocks.recordOwner).toHaveBeenCalledWith(
			expect.objectContaining({ email: 'pat@x.com', userId: 'user_1' }),
			{ table: 'driver_signature' },
		)
	})

	it("keeps the driver's AI signing choice when replacing it", async () => {
		mocks.aiSigningAllowed.mockResolvedValue(true)
		const result = await saveSignatureDAL(DRAWN)
		expect(result._unsafeUnwrap()).toMatchObject({ allowAiSigning: true })
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
	it('deletes the saved signature, and AI signing with it', async () => {
		expect((await deleteSignatureDAL())._unsafeUnwrap()).toEqual({
			saved: false,
			updatedAt: null,
			allowAiSigning: false,
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

describe('setAiSigningDAL', () => {
	it('turns AI signing on or off', async () => {
		const result = await setAiSigningDAL(true)
		expect(result._unsafeUnwrap()).toEqual({
			saved: true,
			updatedAt: WHEN,
			allowAiSigning: true,
		})
		expect(mocks.setAiSigningDb).toHaveBeenCalledWith('pat@x.com', true)
		mocks.setAiSigningDb.mockResolvedValue({
			allowAiSigning: false,
			updatedAt: WHEN,
		})
		expect((await setAiSigningDAL(false))._unsafeUnwrap()).toMatchObject({
			allowAiSigning: false,
		})
		expect(mocks.setAiSigningDb).toHaveBeenLastCalledWith(
			'pat@x.com',
			false,
		)
	})

	it.each([
		'true',
		1,
		null,
		undefined,
	])('only takes true or false (%j)', async (value) => {
		const result = await setAiSigningDAL(value)
		expect(result._unsafeUnwrapErr()).toEqual({
			reason: 'Choose whether AI apps can sign for you.',
		})
		expect(mocks.setAiSigningDb).not.toHaveBeenCalled()
	})

	it('needs a saved signature', async () => {
		mocks.setAiSigningDb.mockResolvedValue(undefined)
		expect((await setAiSigningDAL(true))._unsafeUnwrapErr()).toEqual({
			reason: 'Save a signature first, then choose whether AI apps can sign with it.',
		})
	})

	it.each([
		'42703',
		'42P01',
	])('says the setting is not available before the migration (%s)', async (code) => {
		mocks.setAiSigningDb.mockRejectedValue(
			Object.assign(new Error('missing'), { code }),
		)
		expect((await setAiSigningDAL(true))._unsafeUnwrapErr()).toEqual({
			reason: "This setting isn't available yet. Please try again later.",
		})
		expect(mocks.warnMissingAiSigningColumn).toHaveBeenCalled()
	})

	it('reports any other failure', async () => {
		mocks.setAiSigningDb.mockRejectedValue(new Error('down'))
		expect((await setAiSigningDAL(true))._unsafeUnwrapErr()).toEqual({
			reason: 'Could not change the setting. Please try again.',
		})
		expect(console.error).toHaveBeenCalledWith(
			'Error changing AI signing: ',
			expect.stringContaining('Error: down'),
		)
	})

	it('requires a signed-in driver', async () => {
		mocks.email.mockResolvedValue(null)
		expect((await setAiSigningDAL(true))._unsafeUnwrapErr()).toEqual({
			reason: 'Must be logged in',
		})
		expect(mocks.rateLimit).not.toHaveBeenCalled()
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
			'user_1',
		)
		expect(mocks.signTripDb).toHaveBeenCalledWith(
			1,
			'pat@x.com',
			PNG,
			'web',
		)
		expect(mocks.recordOwner).toHaveBeenCalledWith(
			expect.objectContaining({ email: 'pat@x.com', userId: 'user_1' }),
			{ table: 'trip', tripId: 1 },
			{ table: 'trip_signature', tripId: 1 },
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
		expect(mocks.recordOwner).not.toHaveBeenCalled()
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
