import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trip } from '../helpers/fixtures'

const mocks = vi.hoisted(() => ({
	updateTag: vi.fn(),
	getSignatureStatusDAL: vi.fn(),
	saveSignatureDAL: vi.fn(),
	deleteSignatureDAL: vi.fn(),
	signTripDAL: vi.fn(),
}))
vi.mock('next/cache', () => ({ updateTag: mocks.updateTag }))
vi.mock('@/lib/DAL/signatures', () => ({
	getSignatureStatusDAL: mocks.getSignatureStatusDAL,
	saveSignatureDAL: mocks.saveSignatureDAL,
	deleteSignatureDAL: mocks.deleteSignatureDAL,
	signTripDAL: mocks.signTripDAL,
}))

import {
	deleteSignature,
	getSignatureStatus,
	saveSignature,
	signTrip,
} from '@/lib/actions/signatures'

const status = { saved: true, updatedAt: '2026-11-15T10:00:00.000Z' }

beforeEach(() => {
	mocks.getSignatureStatusDAL.mockResolvedValue(status)
})

describe('signature actions', () => {
	it('reads the saved signature status', async () => {
		await expect(getSignatureStatus()).resolves.toBe(status)
	})

	it.each([
		[
			'saveSignature',
			() => saveSignature('data:x'),
			mocks.saveSignatureDAL,
		],
		['deleteSignature', () => deleteSignature(), mocks.deleteSignatureDAL],
	])('%s answers a value or an error message', async (_name, call, dal) => {
		dal.mockResolvedValue(okAsync(status))
		await expect(call()).resolves.toEqual({ value: status })
		dal.mockResolvedValue(errAsync({ reason: 'Nope' }))
		await expect(call()).resolves.toEqual({ errorMessage: 'Nope' })
	})

	it("signs a trip and refreshes the driver's trips", async () => {
		const signed = trip({ signed_at: new Date() })
		mocks.signTripDAL.mockResolvedValue(okAsync(signed))
		const data = { tripId: 1, signature: 'saved' }
		await expect(signTrip(data)).resolves.toEqual({ value: signed })
		expect(mocks.signTripDAL).toHaveBeenCalledWith(data)
		expect(mocks.updateTag).toHaveBeenCalledWith(
			expect.stringContaining('pat@x.com'),
		)

		mocks.updateTag.mockClear()
		mocks.signTripDAL.mockResolvedValue(errAsync({ reason: 'Too old' }))
		await expect(signTrip(data)).resolves.toEqual({
			errorMessage: 'Too old',
		})
		expect(mocks.updateTag).not.toHaveBeenCalled()
	})
})
