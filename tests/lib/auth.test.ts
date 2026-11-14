import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => mocks)

import {
	canEmailPretrips,
	driverName,
	getDriver,
	getDriverEmail,
} from '@/lib/auth'

beforeEach(() => {
	mocks.currentUser.mockResolvedValue({
		id: 'user_1',
		firstName: 'Pat',
		lastName: null,
		primaryEmailAddress: { emailAddress: 'pat@x.com' },
	})
})

describe('the signed-in driver', () => {
	it("comes from Clerk's current user", async () => {
		await expect(getDriver()).resolves.toEqual({
			userId: 'user_1',
			email: 'pat@x.com',
			givenName: 'Pat',
			familyName: null,
		})
		await expect(getDriverEmail()).resolves.toBe('pat@x.com')
	})

	it('is nobody when signed out or without an email', async () => {
		mocks.currentUser.mockResolvedValue(null)
		await expect(getDriver()).resolves.toBeNull()
		await expect(getDriverEmail()).resolves.toBeNull()
		mocks.currentUser.mockResolvedValue({ primaryEmailAddress: null })
		await expect(getDriver()).resolves.toBeNull()
	})
})

describe('emailing pre-trips', () => {
	it('names the driver, or uses their email', () => {
		const pat = {
			userId: 'user_1',
			email: 'pat@x.com',
			givenName: 'Pat',
			familyName: 'Mac',
		}
		expect(driverName(pat)).toBe('Pat Mac')
		expect(driverName({ ...pat, givenName: null, familyName: null })).toBe(
			'pat@x.com',
		)
	})

	it("is allowed by the plan's email_pretrips feature", async () => {
		const has = vi.fn().mockReturnValue(true)
		mocks.auth.mockResolvedValue({ userId: 'user_1', has })
		await expect(canEmailPretrips()).resolves.toBe(true)
		expect(has).toHaveBeenCalledWith({ feature: 'email_pretrips' })
		has.mockReturnValue(false)
		await expect(canEmailPretrips()).resolves.toBe(false)
		mocks.auth.mockResolvedValue({ userId: null, has })
		has.mockReturnValue(true)
		await expect(canEmailPretrips()).resolves.toBe(false)
	})
})
