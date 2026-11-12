import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn() }))
vi.mock('@clerk/nextjs/server', () => mocks)

import { getDriver, getDriverEmail, isSignedIn } from '@/lib/auth'

beforeEach(() => {
	mocks.currentUser.mockResolvedValue({
		firstName: 'Pat',
		lastName: null,
		primaryEmailAddress: { emailAddress: 'pat@x.com' },
	})
})

describe('the signed-in driver', () => {
	it("comes from Clerk's current user", async () => {
		await expect(getDriver()).resolves.toEqual({
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

	it('knows whether someone is signed in', async () => {
		mocks.auth.mockResolvedValue({ userId: 'user_1' })
		await expect(isSignedIn()).resolves.toBe(true)
		mocks.auth.mockResolvedValue({ userId: null })
		await expect(isSignedIn()).resolves.toBe(false)
	})
})
