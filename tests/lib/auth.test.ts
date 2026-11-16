import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	auth: vi.fn(),
	currentUser: vi.fn(),
	getOrganization: vi.fn(),
	clerkClient: vi.fn(),
}))
vi.mock('@clerk/nextjs/server', () => mocks)

import {
	canEmailPretrips,
	driverName,
	getDriver,
	getDriverEmail,
	getOrgName,
	getSpace,
	isSpaceAdmin,
	ORG_ADMIN_ROLE,
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

	it("is allowed by the personal plan's email_pretrips feature in the personal space", async () => {
		const has = vi.fn().mockReturnValue(true)
		mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: null, has })
		await expect(canEmailPretrips()).resolves.toBe(true)
		expect(has).toHaveBeenCalledWith({ feature: 'u:email_pretrips' })
		has.mockReturnValue(false)
		await expect(canEmailPretrips()).resolves.toBe(false)
		mocks.auth.mockResolvedValue({ userId: null, has })
		has.mockReturnValue(true)
		await expect(canEmailPretrips()).resolves.toBe(false)
	})

	it("is allowed by the organization's plan in an organization's space", async () => {
		const has = vi.fn().mockReturnValue(true)
		mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1', has })
		await expect(canEmailPretrips()).resolves.toBe(true)
		expect(has).toHaveBeenCalledWith({ feature: 'o:email_pretrips' })
	})
})

describe('spaces and admin checks', () => {
	it('is the personal space, whose solo user is its admin, without an active organization', async () => {
		const has = vi.fn().mockReturnValue(false)
		mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: null, has })
		await expect(getSpace()).resolves.toEqual({
			kind: 'personal',
			isAdmin: true,
		})
		await expect(isSpaceAdmin()).resolves.toBe(true)
		expect(has).not.toHaveBeenCalled()
	})

	it("is the organization's space, administered only by its org:admin members", async () => {
		const has = vi.fn().mockReturnValue(true)
		mocks.auth.mockResolvedValue({ userId: 'user_1', orgId: 'org_1', has })
		await expect(getSpace()).resolves.toEqual({
			kind: 'org',
			orgId: 'org_1',
			isAdmin: true,
		})
		expect(has).toHaveBeenCalledWith({ role: ORG_ADMIN_ROLE })
		expect(ORG_ADMIN_ROLE).toBe('org:admin')
		has.mockReturnValue(false)
		await expect(isSpaceAdmin()).resolves.toBe(false)
	})

	it('is nobody when signed out', async () => {
		mocks.auth.mockResolvedValue({ userId: null, has: vi.fn() })
		await expect(getSpace()).resolves.toBeNull()
		await expect(isSpaceAdmin()).resolves.toBe(false)
	})
})

describe("the organization's name", () => {
	beforeEach(() => {
		mocks.clerkClient.mockResolvedValue({
			organizations: { getOrganization: mocks.getOrganization },
		})
	})

	it('comes from Clerk', async () => {
		mocks.getOrganization.mockResolvedValue({ name: ' Acme Freight ' })
		await expect(getOrgName('org_1')).resolves.toBe('Acme Freight')
		expect(mocks.getOrganization).toHaveBeenCalledWith({
			organizationId: 'org_1',
		})
	})

	it("is null, logged, when Clerk can't be reached", async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		mocks.getOrganization.mockRejectedValue(new Error('down'))
		await expect(getOrgName('org_1')).resolves.toBeNull()
		expect(error).toHaveBeenCalled()
	})
})
