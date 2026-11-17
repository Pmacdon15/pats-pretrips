import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	email: vi.fn(),
	rateLimit: vi.fn(),
	recordEvents: vi.fn(),
	listTrailersOrNone: vi.fn(),
	listOrgTrailersOrNone: vi.fn(),
	createOrgTrailerDb: vi.fn(),
	updateOrgTrailerDb: vi.fn(),
	deleteOrgTrailerDb: vi.fn(),
	// The driver's active space (src/lib/auth.ts getSpace).
	space: vi.fn(),
	createTrailerDb: vi.fn(),
	updateTrailerDb: vi.fn(),
	deleteTrailerDb: vi.fn(),
}))
vi.mock('@/lib/rate-limit', async (original) => ({
	...(await original<typeof import('@/lib/rate-limit')>()),
	rateLimit: mocks.rateLimit,
}))
// `email` stands in for the signed-in driver's email (null when signed out).
vi.mock('@/lib/auth', () => ({
	getDriverEmail: mocks.email,
	getSpace: async () => ((await mocks.email()) ? mocks.space() : null),
	getDriver: async () => {
		const email = await mocks.email()
		return email
			? { userId: 'user_1', email, givenName: null, familyName: null }
			: null
	},
}))
vi.mock('@/lib/db/audit-events', () => ({ recordEvents: mocks.recordEvents }))
vi.mock('@/lib/db/trailers', async (original) => ({
	...(await original<typeof import('@/lib/db/trailers')>()),
	listTrailersOrNone: mocks.listTrailersOrNone,
	listOrgTrailersOrNone: mocks.listOrgTrailersOrNone,
	createOrgTrailerDb: mocks.createOrgTrailerDb,
	updateOrgTrailerDb: mocks.updateOrgTrailerDb,
	deleteOrgTrailerDb: mocks.deleteOrgTrailerDb,
	createTrailerDb: mocks.createTrailerDb,
	updateTrailerDb: mocks.updateTrailerDb,
	deleteTrailerDb: mocks.deleteTrailerDb,
}))

import {
	addTrailerDAL,
	deleteTrailerDAL,
	fetchTrailersDAL,
	TOO_MANY_TRAILERS,
	updateTrailerDAL,
} from '@/lib/DAL/trailers'

const driver = {
	userId: 'user_1',
	email: 'pat@x.com',
	givenName: null,
	familyName: null,
}
const row = {
	id: 5,
	name: 'Dry van',
	plate: 'TR 123',
	created_at: '2026-11-01T00:00:00.000Z',
	updated_at: '2026-11-01T00:00:00.000Z',
}
const form = { name: 'Dry van', plate: 'TR 123' }

beforeEach(() => {
	mocks.email.mockResolvedValue('pat@x.com')
	mocks.rateLimit.mockResolvedValue({ ok: true })
	mocks.space.mockReturnValue({ kind: 'personal', isAdmin: true })
})

describe('fetchTrailersDAL', () => {
	it("lists the driver's trailers", async () => {
		mocks.listTrailersOrNone.mockResolvedValue([row])
		await expect(fetchTrailersDAL()).resolves.toEqual([row])
		expect(mocks.listTrailersOrNone).toHaveBeenCalledWith('pat@x.com')
	})

	it('lists none when signed out', async () => {
		mocks.email.mockResolvedValue(null)
		await expect(fetchTrailersDAL()).resolves.toEqual([])
		expect(mocks.listTrailersOrNone).not.toHaveBeenCalled()
	})
})

describe('writes', () => {
	it.each([
		['add', () => addTrailerDAL(form)],
		['update', () => updateTrailerDAL(5, form)],
		['delete', () => deleteTrailerDAL(5)],
	])('%s needs a signed-in driver under the limit', async (_name, call) => {
		mocks.email.mockResolvedValue(null)
		expect((await call())._unsafeUnwrapErr()).toEqual({
			reason: 'Must be logged in',
		})
		mocks.email.mockResolvedValue('pat@x.com')
		mocks.rateLimit.mockResolvedValue({ ok: false, retryAfter: 60 })
		expect((await call())._unsafeUnwrapErr().reason).toContain(
			'Too many requests',
		)
		expect(mocks.rateLimit.mock.calls[0][0].name).toBe('trailer-writes')
	})

	it.each([
		['update', () => updateTrailerDAL(0, form)],
		['delete', () => deleteTrailerDAL(1.5)],
	])("%s refuses an id that can't be a trailer", async (_name, call) => {
		expect((await call())._unsafeUnwrapErr()).toEqual({
			reason: 'That trailer was not found.',
		})
	})
})

describe('addTrailerDAL', () => {
	it('saves the trailer and records it', async () => {
		mocks.createTrailerDb.mockResolvedValue(row)
		const result = await addTrailerDAL(form)
		expect(result._unsafeUnwrap()).toEqual({
			trailer: row,
			email: 'pat@x.com',
			orgId: null,
		})
		expect(mocks.createTrailerDb).toHaveBeenCalledWith(driver, form)
		expect(mocks.recordEvents).toHaveBeenCalledWith(driver, {
			action: 'trailer.created',
			source: 'web',
			details: { trailer_id: 5 },
		})
	})

	it('explains bad input', async () => {
		const longName = await addTrailerDAL({ ...form, name: 'x'.repeat(101) })
		expect(longName._unsafeUnwrapErr()).toEqual({
			reason: 'Name is too long (100 characters at most)',
		})
		const noPlate = await addTrailerDAL({ ...form, plate: '' })
		expect(noPlate._unsafeUnwrapErr()).toEqual({
			reason: 'Trailer plate is required',
		})
		const odd = await addTrailerDAL(null)
		expect(odd._unsafeUnwrapErr().reason).toBeTruthy()
		expect(mocks.createTrailerDb).not.toHaveBeenCalled()
	})

	it('falls back to a general message when no issue explains it', async () => {
		const { schemaTrailer } = await import('@/lib/ZOD/schemas')
		vi.spyOn(schemaTrailer, 'safeParse').mockReturnValueOnce({
			success: false,
			error: { issues: [] },
		} as never)
		const result = await addTrailerDAL(form)
		expect(result._unsafeUnwrapErr()).toEqual({
			reason: 'Check the trailer details.',
		})
	})

	it('refuses past the most trailers', async () => {
		mocks.createTrailerDb.mockResolvedValue('too_many')
		const result = await addTrailerDAL(form)
		expect(result._unsafeUnwrapErr()).toEqual({ reason: TOO_MANY_TRAILERS })
		expect(mocks.recordEvents).not.toHaveBeenCalled()
	})

	it('says it could not save on a database error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {})
		mocks.createTrailerDb.mockRejectedValue(new Error('down'))
		const result = await addTrailerDAL(form)
		expect(result._unsafeUnwrapErr().reason).toContain('Could not save')
	})
})

describe('updateTrailerDAL', () => {
	it('saves the trailer and records what changed', async () => {
		mocks.updateTrailerDb.mockResolvedValue({
			trailer: row,
			before: { ...row, plate: 'TR 456' },
		})
		const result = await updateTrailerDAL(5, form)
		expect(result._unsafeUnwrap()).toEqual({
			trailer: row,
			email: 'pat@x.com',
			orgId: null,
		})
		expect(mocks.updateTrailerDb).toHaveBeenCalledWith(5, 'pat@x.com', form)
		expect(mocks.recordEvents).toHaveBeenCalledWith(driver, {
			action: 'trailer.updated',
			source: 'web',
			details: { trailer_id: 5, changed: ['plate'] },
		})
	})

	it("refuses a trailer that isn't the driver's, or bad input", async () => {
		mocks.updateTrailerDb.mockResolvedValue(undefined)
		expect((await updateTrailerDAL(5, form))._unsafeUnwrapErr()).toEqual({
			reason: 'That trailer was not found.',
		})
		expect(
			(
				await updateTrailerDAL(5, { ...form, plate: '' })
			)._unsafeUnwrapErr(),
		).toEqual({ reason: 'Trailer plate is required' })
	})

	it('says it could not save on a database error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {})
		mocks.updateTrailerDb.mockRejectedValue(new Error('down'))
		const result = await updateTrailerDAL(5, form)
		expect(result._unsafeUnwrapErr().reason).toContain('Could not save')
	})
})

describe('deleteTrailerDAL', () => {
	it('deletes the trailer and records it', async () => {
		mocks.deleteTrailerDb.mockResolvedValue(row)
		const result = await deleteTrailerDAL(5)
		expect(result._unsafeUnwrap()).toEqual({
			trailer: row,
			email: 'pat@x.com',
			orgId: null,
		})
		expect(mocks.deleteTrailerDb).toHaveBeenCalledWith(5, 'pat@x.com')
		expect(mocks.recordEvents).toHaveBeenCalledWith(driver, {
			action: 'trailer.deleted',
			source: 'web',
			details: { trailer_id: 5 },
		})
	})

	it("refuses a trailer that isn't the driver's", async () => {
		mocks.deleteTrailerDb.mockResolvedValue(undefined)
		expect((await deleteTrailerDAL(5))._unsafeUnwrapErr()).toEqual({
			reason: 'That trailer was not found.',
		})
	})

	it('says it could not delete on a database error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {})
		mocks.deleteTrailerDb.mockRejectedValue(new Error('down'))
		const result = await deleteTrailerDAL(5)
		expect(result._unsafeUnwrapErr().reason).toContain('Could not delete')
	})
})

describe("an organization's trailers", () => {
	const member = { kind: 'org', orgId: 'org_1', isAdmin: false }
	const admin = { kind: 'org', orgId: 'org_1', isAdmin: true }

	it('lists the organization’s trailers for any member, never the driver’s own', async () => {
		mocks.space.mockReturnValue(member)
		mocks.listOrgTrailersOrNone.mockResolvedValue([row])
		await expect(fetchTrailersDAL()).resolves.toEqual([row])
		expect(mocks.listOrgTrailersOrNone).toHaveBeenCalledWith('org_1')
		expect(mocks.listTrailersOrNone).not.toHaveBeenCalled()
	})

	it.each([
		['add', () => addTrailerDAL(form)],
		['update', () => updateTrailerDAL(5, form)],
		['delete', () => deleteTrailerDAL(5)],
	])('%s is refused for a member who is not an admin', async (_name, call) => {
		mocks.space.mockReturnValue(member)
		expect((await call())._unsafeUnwrapErr()).toEqual({
			reason: 'Only an admin of your organization can change its trailers.',
		})
		expect(mocks.rateLimit).not.toHaveBeenCalled()
		expect(mocks.createOrgTrailerDb).not.toHaveBeenCalled()
		expect(mocks.updateOrgTrailerDb).not.toHaveBeenCalled()
		expect(mocks.deleteOrgTrailerDb).not.toHaveBeenCalled()
		expect(mocks.recordEvents).not.toHaveBeenCalled()
	})

	it('an admin adds one to the organization, recorded with it', async () => {
		mocks.space.mockReturnValue(admin)
		mocks.createOrgTrailerDb.mockResolvedValue(row)
		const result = await addTrailerDAL(form)
		expect(result._unsafeUnwrap()).toEqual({
			trailer: row,
			email: 'pat@x.com',
			orgId: 'org_1',
		})
		expect(mocks.createOrgTrailerDb).toHaveBeenCalledWith(
			'org_1',
			driver,
			form,
		)
		expect(mocks.createTrailerDb).not.toHaveBeenCalled()
		expect(mocks.recordEvents).toHaveBeenCalledWith(driver, {
			action: 'trailer.created',
			source: 'web',
			details: { trailer_id: 5, org_id: 'org_1' },
		})
	})

	it('an admin changes and deletes the organization’s, not their own', async () => {
		mocks.space.mockReturnValue(admin)
		mocks.updateOrgTrailerDb.mockResolvedValue({
			trailer: row,
			before: row,
		})
		mocks.deleteOrgTrailerDb.mockResolvedValue(row)
		expect((await updateTrailerDAL(5, form))._unsafeUnwrap().orgId).toBe(
			'org_1',
		)
		expect(mocks.updateOrgTrailerDb.mock.calls[0].slice(0, 2)).toEqual([
			5,
			'org_1',
		])
		expect((await deleteTrailerDAL(5))._unsafeUnwrap().orgId).toBe('org_1')
		expect(mocks.deleteOrgTrailerDb).toHaveBeenCalledWith(5, 'org_1')
		expect(mocks.updateTrailerDb).not.toHaveBeenCalled()
		expect(mocks.deleteTrailerDb).not.toHaveBeenCalled()
	})

	it('answers not found for another organization’s trailer', async () => {
		mocks.space.mockReturnValue(admin)
		mocks.updateOrgTrailerDb.mockResolvedValue(undefined)
		mocks.deleteOrgTrailerDb.mockResolvedValue(undefined)
		expect((await updateTrailerDAL(5, form))._unsafeUnwrapErr()).toEqual({
			reason: 'That trailer was not found.',
		})
		expect((await deleteTrailerDAL(5))._unsafeUnwrapErr()).toEqual({
			reason: 'That trailer was not found.',
		})
	})
})
