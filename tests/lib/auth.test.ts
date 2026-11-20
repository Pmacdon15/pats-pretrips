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
	getDriverById,
	getDriverEmail,
	getOrgName,
	getSpace,
	isSpaceAdmin,
	ORG_ADMIN_ROLE,
	planIncludesEmail,
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

	it('is null when the organization has no name', async () => {
		mocks.getOrganization.mockResolvedValue({ name: '  ' })
		await expect(getOrgName('org_1')).resolves.toBeNull()
	})

	it("is null, logged, when Clerk can't be reached", async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		mocks.getOrganization.mockRejectedValue(new Error('down'))
		await expect(getOrgName('org_1')).resolves.toBeNull()
		expect(error).toHaveBeenCalled()
	})
})

describe('whether a plan includes email, from Clerk Billing', () => {
	const billing = {
		getUserBillingSubscription: vi.fn(),
		getOrganizationBillingSubscription: vi.fn(),
	}
	const item = (status: string, slugs: string[] | null) => ({
		status,
		plan: slugs ? { features: slugs.map((slug) => ({ slug })) } : null,
	})
	beforeEach(() => {
		mocks.clerkClient.mockResolvedValue({ billing })
	})

	it("reads a driver's own plan for their personal space", async () => {
		billing.getUserBillingSubscription.mockResolvedValue({
			subscriptionItems: [
				item('active', ['other']),
				item('active', ['email_pretrips']),
			],
		})
		await expect(planIncludesEmail({ userId: 'user_1' })).resolves.toBe(
			true,
		)
		expect(billing.getUserBillingSubscription).toHaveBeenCalledWith(
			'user_1',
		)
		expect(
			billing.getOrganizationBillingSubscription,
		).not.toHaveBeenCalled()
	})

	it("reads an organization's plan for its space", async () => {
		billing.getOrganizationBillingSubscription.mockResolvedValue({
			subscriptionItems: [item('active', ['email_pretrips'])],
		})
		await expect(planIncludesEmail({ orgId: 'org_1' })).resolves.toBe(true)
		expect(billing.getOrganizationBillingSubscription).toHaveBeenCalledWith(
			'org_1',
		)
	})

	it('is false without an active item that has the feature', async () => {
		billing.getUserBillingSubscription.mockResolvedValue({
			subscriptionItems: [
				item('ended', ['email_pretrips']),
				item('active', ['other']),
				item('active', null),
			],
		})
		await expect(planIncludesEmail({ userId: 'user_1' })).resolves.toBe(
			false,
		)
	})

	it("is false, logged, when Clerk can't be read", async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		billing.getOrganizationBillingSubscription.mockRejectedValue(
			new Error('not found'),
		)
		billing.getUserBillingSubscription.mockRejectedValue(
			new Error('not found'),
		)
		await expect(planIncludesEmail({ orgId: 'org_1' })).resolves.toBe(false)
		await expect(planIncludesEmail({ userId: 'user_1' })).resolves.toBe(
			false,
		)
		expect(error).toHaveBeenCalledTimes(2)
	})
})

describe('a driver from their Clerk user ID', () => {
	const getUser = vi.fn()
	beforeEach(() => {
		mocks.clerkClient.mockResolvedValue({ users: { getUser } })
	})

	it('has their name from Clerk and the email they were verified with', async () => {
		getUser.mockResolvedValue({ firstName: 'Pat', lastName: 'Lee' })
		await expect(getDriverById('user_1', 'pat@x.com')).resolves.toEqual({
			userId: 'user_1',
			email: 'pat@x.com',
			givenName: 'Pat',
			familyName: 'Lee',
		})
		expect(getUser).toHaveBeenCalledWith('user_1')
	})

	it("has no name, logged, when Clerk can't be read", async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {})
		getUser.mockRejectedValue(new Error('down'))
		await expect(getDriverById('user_1', 'pat@x.com')).resolves.toEqual({
			userId: 'user_1',
			email: 'pat@x.com',
			givenName: null,
			familyName: null,
		})
		expect(error).toHaveBeenCalled()
	})
})
