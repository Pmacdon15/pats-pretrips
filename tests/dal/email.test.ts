import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repair, trip } from '../helpers/fixtures'

const mocks = vi.hoisted(() => ({
	getDriver: vi.fn(),
	canEmailPretrips: vi.fn(),
	getEmailSettingsDb: vi.fn(),
	saveEmailSettingsDb: vi.fn(),
	getTripDb: vi.fn(),
	sendTripEmail: vi.fn(),
	listTripRepairsDb: vi.fn(),
	getRepairFileDb: vi.fn(),
	getTripSignatureDb: vi.fn(),
}))
vi.mock('@/lib/db/signatures', () => ({
	getTripSignatureDb: mocks.getTripSignatureDb,
}))
vi.mock('@/lib/db/repairs', () => ({
	listTripRepairsDb: mocks.listTripRepairsDb,
	getRepairFileDb: mocks.getRepairFileDb,
}))
vi.mock('@/lib/auth', () => ({
	getDriver: mocks.getDriver,
	canEmailPretrips: mocks.canEmailPretrips,
	driverName: (d: { givenName: string | null; email: string }) =>
		d.givenName ?? d.email,
}))
vi.mock('@/lib/db/email-settings', () => ({
	getEmailSettingsDb: mocks.getEmailSettingsDb,
	saveEmailSettingsDb: mocks.saveEmailSettingsDb,
}))
vi.mock('@/lib/db/trips', () => ({ getTripDb: mocks.getTripDb }))
vi.mock('@/lib/email/trip-email', () => ({
	sendTripEmail: mocks.sendTripEmail,
}))

import {
	emailTripDAL,
	getEmailAccessDAL,
	prepareAutoEmailDAL,
	saveEmailSettingsDAL,
} from '@/lib/DAL/email'

const settings = {
	recipients: ['a@x.com'],
	autoSend: true,
	timeZone: 'UTC',
}
const pat = { email: 'pat@x.com', givenName: 'Pat', familyName: null }

beforeEach(() => {
	mocks.getDriver.mockResolvedValue(pat)
	mocks.canEmailPretrips.mockResolvedValue(true)
	mocks.getEmailSettingsDb.mockResolvedValue(settings)
	mocks.saveEmailSettingsDb.mockImplementation(async (_e, s) => s)
	mocks.getTripDb.mockResolvedValue(trip())
	mocks.sendTripEmail.mockResolvedValue('msg-1')
	mocks.listTripRepairsDb.mockResolvedValue([])
	mocks.getRepairFileDb.mockResolvedValue(undefined)
	mocks.getTripSignatureDb.mockResolvedValue(undefined)
	vi.stubEnv('SES_FROM_EMAIL', 'trips@x.com')
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

const reason = async (result: Promise<{ isErr(): boolean }>) => {
	const r = (await result) as unknown as {
		isErr(): boolean
		error: { reason: string }
	}
	return r.isErr() ? r.error.reason : null
}

describe('getEmailAccessDAL', () => {
	it("answers whether the plan has email, and the driver's settings", async () => {
		await expect(getEmailAccessDAL()).resolves.toEqual({
			allowed: true,
			settings,
		})
		expect(mocks.getEmailSettingsDb).toHaveBeenCalledWith('pat@x.com')
	})

	it('needs a signed-in driver', async () => {
		mocks.getDriver.mockResolvedValue(null)
		await expect(getEmailAccessDAL()).rejects.toThrow('Must be logged in')
	})
})

describe('saveEmailSettingsDAL', () => {
	const data = {
		recipients: 'A@x.com, b@x.com',
		autoSend: true,
		timeZone: 'UTC',
	}

	it('saves the cleaned-up list', async () => {
		const result = await saveEmailSettingsDAL(data)
		expect(result._unsafeUnwrap()).toEqual({
			recipients: ['a@x.com', 'b@x.com'],
			autoSend: true,
			timeZone: 'UTC',
		})
	})

	it('allows an empty list with auto-send off, and no time zone', async () => {
		const result = await saveEmailSettingsDAL({
			recipients: ' ',
			autoSend: false,
		})
		expect(result._unsafeUnwrap()).toEqual({
			recipients: [],
			autoSend: false,
			timeZone: null,
		})
	})

	it('refuses bad input', async () => {
		expect(
			await reason(
				saveEmailSettingsDAL({ ...data, timeZone: 'Mars/Base' }),
			),
		).toBe('Unknown time zone')
		expect(
			await reason(saveEmailSettingsDAL({ ...data, recipients: 'nope' })),
		).toBe('"nope" is not an email address')
		expect(
			await reason(saveEmailSettingsDAL({ ...data, recipients: '' })),
		).toBe('Add an email address to send new pre-trips to')
	})

	it('needs a signed-in driver on a plan with email', async () => {
		mocks.canEmailPretrips.mockResolvedValue(false)
		expect(await reason(saveEmailSettingsDAL(data))).toMatch(/paid plan/)
		mocks.getDriver.mockResolvedValue(null)
		expect(await reason(saveEmailSettingsDAL(data))).toBe(
			'Must be logged in',
		)
		expect(mocks.saveEmailSettingsDb).not.toHaveBeenCalled()
	})

	it('reports a database error', async () => {
		mocks.saveEmailSettingsDb.mockRejectedValue(new Error('db'))
		expect(await reason(saveEmailSettingsDAL(data))).toMatch(
			/Could not save/,
		)
	})
})

describe('emailTripDAL', () => {
	const data = { tripId: 1, recipients: 'a@x.com', timeZone: 'UTC' }

	it("emails the driver's trip", async () => {
		const result = await emailTripDAL(data)
		expect(result._unsafeUnwrap()).toEqual({ sentTo: ['a@x.com'] })
		expect(mocks.getTripDb).toHaveBeenCalledWith(1, 'pat@x.com')
		expect(mocks.sendTripEmail).toHaveBeenCalledWith(
			trip(),
			{ name: 'Pat', email: 'pat@x.com' },
			['a@x.com'],
			'UTC',
			[],
			null,
		)
		expect(mocks.getTripSignatureDb).not.toHaveBeenCalled()
	})

	it("includes the driver's signature on a signed trip", async () => {
		mocks.getTripDb.mockResolvedValue(trip({ signed_at: new Date() }))
		mocks.getTripSignatureDb.mockResolvedValueOnce({
			bytes: Buffer.from('sig'),
			type: 'image/png',
		})
		await emailTripDAL(data)
		expect(mocks.getTripSignatureDb).toHaveBeenCalledWith(1, 'pat@x.com')
		expect(mocks.sendTripEmail.mock.calls[0][5]).toEqual(Buffer.from('sig'))

		// Signed, but the signature can't be found.
		await emailTripDAL(data)
		expect(mocks.sendTripEmail.mock.calls[1][5]).toBeNull()
	})

	it("includes the trip's repairs and their signatures", async () => {
		const signed = repair()
		const unsigned = repair({
			id: 8,
			defect: 'Tires',
			has_signature: false,
		})
		mocks.listTripRepairsDb.mockResolvedValue([signed, unsigned])
		mocks.getRepairFileDb.mockResolvedValue({
			bytes: Buffer.from('png'),
			type: 'image/png',
			name: null,
		})
		await emailTripDAL(data)
		expect(mocks.listTripRepairsDb).toHaveBeenCalledWith(1, 'pat@x.com')
		expect(mocks.getRepairFileDb).toHaveBeenCalledTimes(1)
		expect(mocks.getRepairFileDb).toHaveBeenCalledWith(
			7,
			'pat@x.com',
			'signature',
		)
		expect(mocks.sendTripEmail.mock.calls[0][4]).toEqual([
			{ ...signed, signature: Buffer.from('png') },
			unsigned,
		])

		// The signature was deleted in the meantime.
		mocks.getRepairFileDb.mockResolvedValue(undefined)
		await emailTripDAL(data)
		expect(mocks.sendTripEmail.mock.calls[1][4][0].signature).toBeNull()
	})

	it('needs a signed-in driver on a plan with email', async () => {
		mocks.canEmailPretrips.mockResolvedValue(false)
		expect(await reason(emailTripDAL(data))).toMatch(/paid plan/)
		mocks.getDriver.mockResolvedValue(null)
		expect(await reason(emailTripDAL(data))).toBe('Must be logged in')
	})

	it('refuses bad input and a server without SES', async () => {
		expect(await reason(emailTripDAL({ ...data, recipients: '' }))).toBe(
			'Add at least one email address',
		)
		vi.stubEnv('SES_FROM_EMAIL', '')
		expect(await reason(emailTripDAL(data))).toMatch(/isn’t set up/)
	})

	it("can't email someone else's trip", async () => {
		mocks.getTripDb.mockResolvedValue(undefined)
		expect(await reason(emailTripDAL(data))).toBe('Trip not found')
	})

	it('reports a failed send', async () => {
		mocks.sendTripEmail.mockRejectedValue(new Error('SES'))
		expect(await reason(emailTripDAL(data))).toMatch(/Could not send/)
	})
})

describe('prepareAutoEmailDAL', () => {
	it('emails a new trip to the saved recipients', async () => {
		const send = await prepareAutoEmailDAL()
		await send?.(trip())
		expect(mocks.sendTripEmail).toHaveBeenCalledWith(
			trip(),
			{ name: 'Pat', email: 'pat@x.com' },
			['a@x.com'],
			'UTC',
			[],
			null,
		)
	})

	it('logs a failed send instead of throwing', async () => {
		mocks.getEmailSettingsDb.mockResolvedValue({
			...settings,
			timeZone: null,
		})
		mocks.sendTripEmail.mockRejectedValue(new Error('SES'))
		const send = await prepareAutoEmailDAL()
		await expect(send?.(trip())).resolves.toBeUndefined()
		expect(mocks.sendTripEmail.mock.calls[0][3]).toBeUndefined()
		expect(console.error).toHaveBeenCalled()
	})

	it('does nothing when it is off, has no one to send to, or is not allowed', async () => {
		mocks.getEmailSettingsDb.mockResolvedValue({
			...settings,
			autoSend: false,
		})
		await expect(prepareAutoEmailDAL()).resolves.toBeNull()
		mocks.getEmailSettingsDb.mockResolvedValue({
			...settings,
			recipients: [],
		})
		await expect(prepareAutoEmailDAL()).resolves.toBeNull()
		mocks.canEmailPretrips.mockResolvedValue(false)
		await expect(prepareAutoEmailDAL()).resolves.toBeNull()
		vi.stubEnv('SES_FROM_EMAIL', '')
		await expect(prepareAutoEmailDAL()).resolves.toBeNull()
		vi.stubEnv('SES_FROM_EMAIL', 'trips@x.com')
		mocks.getDriver.mockResolvedValue(null)
		await expect(prepareAutoEmailDAL()).resolves.toBeNull()
	})
})
