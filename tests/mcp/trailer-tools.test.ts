import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	listTrailersOrNone: vi.fn(),
	createTrailerDb: vi.fn(),
	updateTrailerDb: vi.fn(),
	deleteTrailerDb: vi.fn(),
	listOrgTrailersOrNone: vi.fn(),
	createOrgTrailerDb: vi.fn(),
	updateOrgTrailerDb: vi.fn(),
	deleteOrgTrailerDb: vi.fn(),
	recordEvents: vi.fn(),
	getOrganizationMembershipList: vi.fn(),
}))
vi.mock('@/lib/db/trailers', async (original) => ({
	...(await original<typeof import('@/lib/db/trailers')>()),
	listTrailersOrNone: mocks.listTrailersOrNone,
	createTrailerDb: mocks.createTrailerDb,
	updateTrailerDb: mocks.updateTrailerDb,
	deleteTrailerDb: mocks.deleteTrailerDb,
	listOrgTrailersOrNone: mocks.listOrgTrailersOrNone,
	createOrgTrailerDb: mocks.createOrgTrailerDb,
	updateOrgTrailerDb: mocks.updateOrgTrailerDb,
	deleteOrgTrailerDb: mocks.deleteOrgTrailerDb,
}))
vi.mock('@/lib/db/audit-events', () => ({ recordEvents: mocks.recordEvents }))
vi.mock('@clerk/nextjs/server', () => ({
	clerkClient: async () => ({
		users: {
			getOrganizationMembershipList: mocks.getOrganizationMembershipList,
		},
	}),
}))

import {
	addTrailer,
	deleteTrailer,
	listTrailers,
	trailerLabel,
	trailerView,
	updateTrailer,
} from '@/mcp/trailer-tools'

const caller = { email: 'pat@x.com', client: 'Claude', userId: 'user_1' }
const row = {
	id: 4,
	name: 'Dry van',
	plate: 'TRL 1',
	created_at: '2026-11-01T00:00:00.000Z',
	updated_at: '2026-11-01T00:00:00.000Z',
}
const view = { trailer_id: 4, name: 'Dry van', plate: 'TRL 1' }
const membership = (role: string) => ({
	data: [{ role, organization: { id: 'org_1', name: 'Acme', slug: null } }],
})
const asAdmin = () =>
	mocks.getOrganizationMembershipList.mockResolvedValue(
		membership('org:admin'),
	)
const asMember = () =>
	mocks.getOrganizationMembershipList.mockResolvedValue(
		membership('org:member'),
	)

beforeEach(() => {
	mocks.listTrailersOrNone.mockResolvedValue([row])
	mocks.listOrgTrailersOrNone.mockResolvedValue([row])
})

describe('views', () => {
	it('uses plain names', () => {
		expect(trailerView(row)).toEqual(view)
		expect(trailerView({ ...row, name: '' })).toMatchObject({ name: null })
		expect(trailerLabel(row)).toBe('Dry van · TRL 1')
		expect(trailerLabel({ name: null, plate: 'P' })).toBe('P')
	})
})

describe('listTrailers', () => {
	it("lists the driver's trailers", async () => {
		const result = await listTrailers(caller)
		expect(mocks.listTrailersOrNone).toHaveBeenCalledWith('pat@x.com')
		expect(result.data).toEqual({ space: 'personal', trailers: [view] })
		expect(result.summary).toBe(
			"1 saved trailer in the driver's trailers: Dry van · TRL 1. Pass a plate as start_trip's trailer_plate_a or trailer_plate_b.",
		)
		mocks.listTrailersOrNone.mockResolvedValue([row, row])
		expect((await listTrailers(caller, {})).summary).toMatch(
			/^2 saved trailers/,
		)
	})

	it('says when there are none', async () => {
		mocks.listTrailersOrNone.mockResolvedValue([])
		expect((await listTrailers(caller)).summary).toBe(
			'The driver has no saved trailers. Add one with add_trailer when they ask.',
		)
	})

	it("lists an organization's for a member", async () => {
		asMember()
		const result = await listTrailers(caller, { organization_id: 'org_1' })
		expect(mocks.listOrgTrailersOrNone).toHaveBeenCalledWith('org_1')
		expect(result.summary).toContain("Only Acme's admins can change them.")
		expect(result.data).toMatchObject({
			space: 'organization',
			is_admin: false,
		})
		mocks.listOrgTrailersOrNone.mockResolvedValue([])
		expect(
			(await listTrailers(caller, { organization_id: 'org_1' })).summary,
		).toBe('Acme has no saved trailers.')
	})

	it("refuses an organization the driver isn't in", async () => {
		mocks.getOrganizationMembershipList.mockResolvedValue({ data: [] })
		const result = await listTrailers(caller, { organization_id: 'org_9' })
		expect(result.data).toEqual({ status: 'not_a_member' })
	})
})

describe('addTrailer', () => {
	it('saves it for the driver and records it', async () => {
		mocks.createTrailerDb.mockResolvedValue(row)
		const result = await addTrailer(caller, {
			name: 'Dry van',
			plate: 'TRL 1',
		})
		expect(mocks.createTrailerDb).toHaveBeenCalledWith(caller, {
			name: 'Dry van',
			plate: 'TRL 1',
		})
		expect(result).toEqual({
			summary:
				"Saved trailer 4 in the driver's trailers: Dry van · TRL 1.",
			data: { space: 'personal', trailer: view },
		})
		expect(mocks.recordEvents).toHaveBeenCalledWith(caller, {
			action: 'trailer.created',
			source: 'Claude',
			details: { trailer_id: 4 },
		})
	})

	it("saves it in an organization's for an admin", async () => {
		asAdmin()
		mocks.createOrgTrailerDb.mockResolvedValue(row)
		const result = await addTrailer(
			{ ...caller, client: null },
			{ organization_id: 'org_1', plate: 'TRL 1' },
		)
		expect(mocks.createOrgTrailerDb).toHaveBeenCalledWith(
			'org_1',
			expect.anything(),
			{ name: undefined, plate: 'TRL 1' },
		)
		expect(result.orgId).toBe('org_1')
		expect(mocks.recordEvents).toHaveBeenCalledWith(expect.anything(), {
			action: 'trailer.created',
			source: 'ai',
			details: { trailer_id: 4, org_id: 'org_1' },
		})
	})

	it('refuses past the most trailers', async () => {
		mocks.createTrailerDb.mockResolvedValue('too_many')
		const mine = await addTrailer(caller, { plate: 'P' })
		expect(mine).toMatchObject({
			isError: true,
			data: { status: 'too_many', max_trailers: 50 },
		})
		expect(mine.summary).toMatch(/^The driver already has 50/)
		asAdmin()
		mocks.createOrgTrailerDb.mockResolvedValue('too_many')
		const org = await addTrailer(caller, {
			organization_id: 'org_1',
			plate: 'P',
		})
		expect(org.summary).toMatch(/^Acme already has 50/)
		expect(mocks.recordEvents).not.toHaveBeenCalled()
	})

	it("refuses a member who isn't an admin", async () => {
		asMember()
		const result = await addTrailer(caller, {
			organization_id: 'org_1',
			plate: 'P',
		})
		expect(result.data).toMatchObject({ status: 'not_org_admin' })
		expect(result.summary).toContain('change its trailers')
		expect(mocks.createOrgTrailerDb).not.toHaveBeenCalled()
	})
})

describe('updateTrailer', () => {
	it('keeps the fields not given and records what changed', async () => {
		mocks.updateTrailerDb.mockResolvedValue({
			trailer: { ...row, plate: 'NEW' },
			before: { name: 'Dry van', plate: 'TRL 1' },
		})
		const result = await updateTrailer(caller, {
			trailer_id: 4,
			plate: 'NEW',
		})
		expect(mocks.updateTrailerDb).toHaveBeenCalledWith(4, 'pat@x.com', {
			name: 'Dry van',
			plate: 'NEW',
		})
		expect(result.data).toEqual({
			space: 'personal',
			trailer: { ...view, plate: 'NEW' },
		})
		expect(mocks.recordEvents).toHaveBeenCalledWith(caller, {
			action: 'trailer.updated',
			source: 'Claude',
			details: { trailer_id: 4, changed: ['plate'] },
		})
	})

	it("changes an organization's for an admin; an empty name clears it", async () => {
		asAdmin()
		mocks.updateOrgTrailerDb.mockResolvedValue({
			trailer: { ...row, name: null },
			before: { name: 'Dry van', plate: 'TRL 1' },
		})
		const result = await updateTrailer(caller, {
			organization_id: 'org_1',
			trailer_id: 4,
			name: '',
		})
		expect(mocks.listOrgTrailersOrNone).toHaveBeenCalledWith('org_1')
		expect(mocks.updateOrgTrailerDb).toHaveBeenCalledWith(4, 'org_1', {
			name: '',
			plate: 'TRL 1',
		})
		expect(result.orgId).toBe('org_1')
		expect(result.summary).toBe(
			'Updated trailer 4: TRL 1. Trips already saved keep the plates they were started with.',
		)
	})

	it('needs a name or plate', async () => {
		const result = await updateTrailer(caller, { trailer_id: 4 })
		expect(result.data).toEqual({ status: 'no_changes' })
		expect(mocks.listTrailersOrNone).not.toHaveBeenCalled()
	})

	it("says when the trailer isn't in the space", async () => {
		const missing = await updateTrailer(caller, {
			trailer_id: 9,
			plate: 'X',
		})
		expect(missing.summary).toBe(
			"Trailer 9 wasn't found in the driver's trailers. Use list_trailers to find the trailer's id.",
		)
		expect(mocks.updateTrailerDb).not.toHaveBeenCalled()
		mocks.updateTrailerDb.mockResolvedValue(undefined)
		const gone = await updateTrailer(caller, { trailer_id: 4, plate: 'X' })
		expect(gone.data).toEqual({ status: 'not_found' })
	})

	it("refuses a member who isn't an admin", async () => {
		asMember()
		const result = await updateTrailer(caller, {
			organization_id: 'org_1',
			trailer_id: 4,
			plate: 'X',
		})
		expect(result.data).toMatchObject({ status: 'not_org_admin' })
	})
})

describe('deleteTrailer', () => {
	it('deletes it and records it', async () => {
		mocks.deleteTrailerDb.mockResolvedValue(row)
		const result = await deleteTrailer(caller, { trailer_id: 4 })
		expect(mocks.deleteTrailerDb).toHaveBeenCalledWith(4, 'pat@x.com')
		expect(result.data).toEqual({
			space: 'personal',
			status: 'deleted',
			trailer: view,
		})
		expect(result.summary).toBe(
			"Deleted trailer 4 (Dry van · TRL 1) from the driver's trailers. Trips already saved with it are unchanged.",
		)
	})

	it("deletes an organization's for an admin", async () => {
		asAdmin()
		mocks.deleteOrgTrailerDb.mockResolvedValue(row)
		const result = await deleteTrailer(caller, {
			organization_id: 'org_1',
			trailer_id: 4,
		})
		expect(mocks.deleteOrgTrailerDb).toHaveBeenCalledWith(4, 'org_1')
		expect(result.orgId).toBe('org_1')
		expect(mocks.recordEvents).toHaveBeenCalledWith(caller, {
			action: 'trailer.deleted',
			source: 'Claude',
			details: { trailer_id: 4, org_id: 'org_1' },
		})
	})

	it("says when it isn't there", async () => {
		asAdmin()
		mocks.deleteOrgTrailerDb.mockResolvedValue(undefined)
		const result = await deleteTrailer(caller, {
			organization_id: 'org_1',
			trailer_id: 9,
		})
		expect(result.summary).toBe(
			"Trailer 9 wasn't found in Acme's trailers. Use list_trailers with the same organization_id to find the trailer's id.",
		)
		expect(mocks.recordEvents).not.toHaveBeenCalled()
	})

	it("refuses a member who isn't an admin", async () => {
		asMember()
		const result = await deleteTrailer(caller, {
			organization_id: 'org_1',
			trailer_id: 4,
		})
		expect(result.data).toMatchObject({ status: 'not_org_admin' })
		expect(mocks.deleteOrgTrailerDb).not.toHaveBeenCalled()
	})
})
