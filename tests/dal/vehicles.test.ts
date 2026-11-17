import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	email: vi.fn(),
	rateLimit: vi.fn(),
	recordEvents: vi.fn(),
	listVehiclesOrNone: vi.fn(),
	listOrgVehiclesOrNone: vi.fn(),
	createOrgVehicleDb: vi.fn(),
	updateOrgVehicleDb: vi.fn(),
	deleteOrgVehicleDb: vi.fn(),
	// The driver's active space (src/lib/auth.ts getSpace).
	space: vi.fn(),
	createVehicleDb: vi.fn(),
	updateVehicleDb: vi.fn(),
	deleteVehicleDb: vi.fn(),
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
vi.mock('@/lib/db/vehicles', async (original) => ({
	...(await original<typeof import('@/lib/db/vehicles')>()),
	listVehiclesOrNone: mocks.listVehiclesOrNone,
	listOrgVehiclesOrNone: mocks.listOrgVehiclesOrNone,
	createOrgVehicleDb: mocks.createOrgVehicleDb,
	updateOrgVehicleDb: mocks.updateOrgVehicleDb,
	deleteOrgVehicleDb: mocks.deleteOrgVehicleDb,
	createVehicleDb: mocks.createVehicleDb,
	updateVehicleDb: mocks.updateVehicleDb,
	deleteVehicleDb: mocks.deleteVehicleDb,
}))

import {
	addVehicleDAL,
	deleteVehicleDAL,
	fetchVehiclesDAL,
	TOO_MANY_VEHICLES,
	updateVehicleDAL,
} from '@/lib/DAL/vehicles'

const driver = {
	userId: 'user_1',
	email: 'pat@x.com',
	givenName: null,
	familyName: null,
}
const row = {
	id: 3,
	name: 'Unit 42',
	make: 'Volvo',
	model: 'VNL',
	truck_plate: 'TRK1',
	trailer_plate_a: null,
	trailer_plate_b: null,
	created_at: '2026-11-01T00:00:00.000Z',
	updated_at: '2026-11-01T00:00:00.000Z',
}
const form = {
	name: 'Unit 42',
	make: 'Volvo',
	model: 'VNL',
	truckPlate: 'TRK1',
}

beforeEach(() => {
	mocks.email.mockResolvedValue('pat@x.com')
	mocks.rateLimit.mockResolvedValue({ ok: true })
	mocks.space.mockReturnValue({ kind: 'personal', isAdmin: true })
})

describe('fetchVehiclesDAL', () => {
	it("lists the driver's vehicles", async () => {
		mocks.listVehiclesOrNone.mockResolvedValue([row])
		await expect(fetchVehiclesDAL()).resolves.toEqual([row])
		expect(mocks.listVehiclesOrNone).toHaveBeenCalledWith('pat@x.com')
	})

	it('lists none when signed out', async () => {
		mocks.email.mockResolvedValue(null)
		await expect(fetchVehiclesDAL()).resolves.toEqual([])
		expect(mocks.listVehiclesOrNone).not.toHaveBeenCalled()
	})
})

describe('writes', () => {
	it.each([
		['add', () => addVehicleDAL(form)],
		['update', () => updateVehicleDAL(3, form)],
		['delete', () => deleteVehicleDAL(3)],
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
		expect(mocks.rateLimit.mock.calls[0][0].name).toBe('vehicle-writes')
	})

	it.each([
		['update', () => updateVehicleDAL(0, form)],
		['delete', () => deleteVehicleDAL(1.5)],
	])("%s refuses an id that can't be a vehicle", async (_name, call) => {
		expect((await call())._unsafeUnwrapErr()).toEqual({
			reason: 'That vehicle was not found.',
		})
	})
})

describe('addVehicleDAL', () => {
	it('saves the vehicle and records it', async () => {
		mocks.createVehicleDb.mockResolvedValue(row)
		const result = await addVehicleDAL(form)
		expect(result._unsafeUnwrap()).toEqual({
			vehicle: row,
			email: 'pat@x.com',
			orgId: null,
		})
		expect(mocks.createVehicleDb).toHaveBeenCalledWith(driver, form)
		expect(mocks.recordEvents).toHaveBeenCalledWith(driver, {
			action: 'vehicle.created',
			source: 'web',
			details: { vehicle_id: 3 },
		})
	})

	it('explains bad input', async () => {
		const result = await addVehicleDAL({ ...form, make: '' })
		expect(result._unsafeUnwrapErr()).toEqual({
			reason: 'Vehicle make is required',
		})
		const odd = await addVehicleDAL(null)
		expect(odd._unsafeUnwrapErr().reason).toBeTruthy()
		expect(mocks.createVehicleDb).not.toHaveBeenCalled()
	})

	it('falls back to a general message when no issue explains it', async () => {
		const { schemaVehicle } = await import('@/lib/ZOD/schemas')
		vi.spyOn(schemaVehicle, 'safeParse').mockReturnValueOnce({
			success: false,
			error: { issues: [] },
		} as never)
		const result = await addVehicleDAL(form)
		expect(result._unsafeUnwrapErr()).toEqual({
			reason: 'Check the vehicle details.',
		})
	})

	it('refuses past the most vehicles', async () => {
		mocks.createVehicleDb.mockResolvedValue('too_many')
		const result = await addVehicleDAL(form)
		expect(result._unsafeUnwrapErr()).toEqual({ reason: TOO_MANY_VEHICLES })
		expect(mocks.recordEvents).not.toHaveBeenCalled()
	})

	it('says it could not save on a database error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {})
		mocks.createVehicleDb.mockRejectedValue(new Error('down'))
		const result = await addVehicleDAL(form)
		expect(result._unsafeUnwrapErr().reason).toContain('Could not save')
	})
})

describe('updateVehicleDAL', () => {
	it('saves every field, clearing empty ones, and records what changed', async () => {
		mocks.updateVehicleDb.mockResolvedValue({
			vehicle: row,
			before: { ...row, model: 'VNR' },
		})
		const result = await updateVehicleDAL(3, {
			make: 'Volvo',
			model: 'VNL',
		})
		expect(result._unsafeUnwrap()).toEqual({
			vehicle: row,
			email: 'pat@x.com',
			orgId: null,
		})
		expect(mocks.updateVehicleDb).toHaveBeenCalledWith(3, 'pat@x.com', {
			name: '',
			make: 'Volvo',
			model: 'VNL',
			truckPlate: '',
			// Left alone: trailers are saved on their own now.
			trailerPlateA: undefined,
			trailerPlateB: undefined,
		})
		expect(mocks.recordEvents).toHaveBeenCalledWith(driver, {
			action: 'vehicle.updated',
			source: 'web',
			details: { vehicle_id: 3, changed: ['model'] },
		})
	})

	it('passes given fields as they are', async () => {
		mocks.updateVehicleDb.mockResolvedValue({ vehicle: row, before: row })
		await updateVehicleDAL(3, {
			...form,
			trailerPlateA: 'A',
			trailerPlateB: 'B',
		})
		expect(mocks.updateVehicleDb.mock.calls[0][2]).toEqual({
			name: 'Unit 42',
			make: 'Volvo',
			model: 'VNL',
			truckPlate: 'TRK1',
			trailerPlateA: 'A',
			trailerPlateB: 'B',
		})
	})

	it("refuses a vehicle that isn't the driver's, or bad input", async () => {
		mocks.updateVehicleDb.mockResolvedValue(undefined)
		expect((await updateVehicleDAL(3, form))._unsafeUnwrapErr()).toEqual({
			reason: 'That vehicle was not found.',
		})
		expect(
			(
				await updateVehicleDAL(3, { ...form, model: '' })
			)._unsafeUnwrapErr(),
		).toEqual({ reason: 'Vehicle model is required' })
	})

	it('says it could not save on a database error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {})
		mocks.updateVehicleDb.mockRejectedValue(new Error('down'))
		const result = await updateVehicleDAL(3, form)
		expect(result._unsafeUnwrapErr().reason).toContain('Could not save')
	})
})

describe('deleteVehicleDAL', () => {
	it('deletes the vehicle and records it', async () => {
		mocks.deleteVehicleDb.mockResolvedValue(row)
		const result = await deleteVehicleDAL(3)
		expect(result._unsafeUnwrap()).toEqual({
			vehicle: row,
			email: 'pat@x.com',
			orgId: null,
		})
		expect(mocks.deleteVehicleDb).toHaveBeenCalledWith(3, 'pat@x.com')
		expect(mocks.recordEvents).toHaveBeenCalledWith(driver, {
			action: 'vehicle.deleted',
			source: 'web',
			details: { vehicle_id: 3 },
		})
	})

	it("refuses a vehicle that isn't the driver's", async () => {
		mocks.deleteVehicleDb.mockResolvedValue(undefined)
		expect((await deleteVehicleDAL(3))._unsafeUnwrapErr()).toEqual({
			reason: 'That vehicle was not found.',
		})
	})

	it('says it could not delete on a database error', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {})
		mocks.deleteVehicleDb.mockRejectedValue(new Error('down'))
		const result = await deleteVehicleDAL(3)
		expect(result._unsafeUnwrapErr().reason).toContain('Could not delete')
	})
})

describe("an organization's vehicles", () => {
	const member = { kind: 'org', orgId: 'org_1', isAdmin: false }
	const admin = { kind: 'org', orgId: 'org_1', isAdmin: true }

	it('lists the organization’s vehicles for any member, never the driver’s own', async () => {
		mocks.space.mockReturnValue(member)
		mocks.listOrgVehiclesOrNone.mockResolvedValue([row])
		await expect(fetchVehiclesDAL()).resolves.toEqual([row])
		expect(mocks.listOrgVehiclesOrNone).toHaveBeenCalledWith('org_1')
		expect(mocks.listVehiclesOrNone).not.toHaveBeenCalled()
	})

	it.each([
		['add', () => addVehicleDAL(form)],
		['update', () => updateVehicleDAL(3, form)],
		['delete', () => deleteVehicleDAL(3)],
	])('%s is refused for a member who is not an admin', async (_name, call) => {
		mocks.space.mockReturnValue(member)
		expect((await call())._unsafeUnwrapErr()).toEqual({
			reason: 'Only an admin of your organization can change its vehicles.',
		})
		expect(mocks.rateLimit).not.toHaveBeenCalled()
		expect(mocks.createOrgVehicleDb).not.toHaveBeenCalled()
		expect(mocks.updateOrgVehicleDb).not.toHaveBeenCalled()
		expect(mocks.deleteOrgVehicleDb).not.toHaveBeenCalled()
		expect(mocks.recordEvents).not.toHaveBeenCalled()
	})

	it('an admin adds one to the organization, recorded with it', async () => {
		mocks.space.mockReturnValue(admin)
		mocks.createOrgVehicleDb.mockResolvedValue(row)
		const result = await addVehicleDAL(form)
		expect(result._unsafeUnwrap()).toEqual({
			vehicle: row,
			email: 'pat@x.com',
			orgId: 'org_1',
		})
		expect(mocks.createOrgVehicleDb).toHaveBeenCalledWith(
			'org_1',
			driver,
			form,
		)
		expect(mocks.createVehicleDb).not.toHaveBeenCalled()
		expect(mocks.recordEvents).toHaveBeenCalledWith(driver, {
			action: 'vehicle.created',
			source: 'web',
			details: { vehicle_id: 3, org_id: 'org_1' },
		})
	})

	it('an admin changes and deletes the organization’s, not their own', async () => {
		mocks.space.mockReturnValue(admin)
		mocks.updateOrgVehicleDb.mockResolvedValue({
			vehicle: row,
			before: row,
		})
		mocks.deleteOrgVehicleDb.mockResolvedValue(row)
		expect((await updateVehicleDAL(3, form))._unsafeUnwrap().orgId).toBe(
			'org_1',
		)
		expect(mocks.updateOrgVehicleDb.mock.calls[0].slice(0, 2)).toEqual([
			3,
			'org_1',
		])
		expect((await deleteVehicleDAL(3))._unsafeUnwrap().orgId).toBe('org_1')
		expect(mocks.deleteOrgVehicleDb).toHaveBeenCalledWith(3, 'org_1')
		expect(mocks.updateVehicleDb).not.toHaveBeenCalled()
		expect(mocks.deleteVehicleDb).not.toHaveBeenCalled()
	})

	it('answers not found for another organization’s vehicle', async () => {
		mocks.space.mockReturnValue(admin)
		mocks.updateOrgVehicleDb.mockResolvedValue(undefined)
		mocks.deleteOrgVehicleDb.mockResolvedValue(undefined)
		expect((await updateVehicleDAL(3, form))._unsafeUnwrapErr()).toEqual({
			reason: 'That vehicle was not found.',
		})
		expect((await deleteVehicleDAL(3))._unsafeUnwrapErr()).toEqual({
			reason: 'That vehicle was not found.',
		})
	})
})
