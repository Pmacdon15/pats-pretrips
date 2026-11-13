import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	email: vi.fn(),
	getSavedSignatureDb: vi.fn(),
	getTripSignatureDb: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getDriverEmail: mocks.email }))
vi.mock('@/lib/db/signatures', () => ({
	getSavedSignatureDb: mocks.getSavedSignatureDb,
	getTripSignatureDb: mocks.getTripSignatureDb,
}))

import { GET as getSaved } from '@/app/api/signature/route'
import { GET as getTrip } from '@/app/api/trips/[tripId]/signature/route'

const PNG = { bytes: Buffer.from('png'), type: 'image/png' }
const trip = (tripId: string) =>
	getTrip(new Request(`https://app.test/api/trips/${tripId}/signature`), {
		params: Promise.resolve({ tripId }),
	})

beforeEach(() => {
	mocks.email.mockResolvedValue('pat@x.com')
	mocks.getSavedSignatureDb.mockResolvedValue({ ...PNG, updatedAt: 'x' })
	mocks.getTripSignatureDb.mockResolvedValue(PNG)
})

describe('GET /api/signature', () => {
	it("serves the driver's saved signature", async () => {
		const res = await getSaved()
		expect(res.status).toBe(200)
		expect(res.headers.get('content-type')).toBe('image/png')
		expect(mocks.getSavedSignatureDb).toHaveBeenCalledWith('pat@x.com')
	})

	it('needs a signed-in driver with a signature', async () => {
		mocks.getSavedSignatureDb.mockResolvedValue(undefined)
		expect((await getSaved()).status).toBe(404)
		mocks.email.mockResolvedValue(null)
		expect((await getSaved()).status).toBe(401)
	})
})

describe('GET /api/trips/[tripId]/signature', () => {
	it("serves the signature on the driver's trip", async () => {
		const res = await trip('4')
		expect(res.status).toBe(200)
		expect(await res.text()).toBe('png')
		expect(mocks.getTripSignatureDb).toHaveBeenCalledWith(4, 'pat@x.com')
	})

	it.each(['0', 'abc', '1.5'])('is a 404 for trip %j', async (id) => {
		expect((await trip(id)).status).toBe(404)
		expect(mocks.getTripSignatureDb).not.toHaveBeenCalled()
	})

	it('needs a signed-in driver with a signed trip', async () => {
		mocks.getTripSignatureDb.mockResolvedValue(undefined)
		expect((await trip('4')).status).toBe(404)
		mocks.email.mockResolvedValue(null)
		expect((await trip('4')).status).toBe(401)
	})
})
