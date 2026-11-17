import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
	listVehiclesOrNone: vi.fn(),
	createVehicleDb: vi.fn(),
	updateVehicleDb: vi.fn(),
	deleteVehicleDb: vi.fn(),
	listOrgVehiclesOrNone: vi.fn(),
	createOrgVehicleDb: vi.fn(),
	updateOrgVehicleDb: vi.fn(),
	deleteOrgVehicleDb: vi.fn(),
	recordEvents: vi.fn(),
	getOrganizationMembershipList: vi.fn(),
}))
vi.mock('@clerk/nextjs/server', () => ({
	clerkClient: async () => ({
		users: {
			getOrganizationMembershipList: mocks.getOrganizationMembershipList,
		},
	}),
}))
vi.mock('@/lib/db/vehicles', async (original) => ({
	...(await original<typeof import('@/lib/db/vehicles')>()),
	listVehiclesOrNone: mocks.listVehiclesOrNone,
	createVehicleDb: mocks.createVehicleDb,
	updateVehicleDb: mocks.updateVehicleDb,
	deleteVehicleDb: mocks.deleteVehicleDb,
	listOrgVehiclesOrNone: mocks.listOrgVehiclesOrNone,
	createOrgVehicleDb: mocks.createOrgVehicleDb,
	updateOrgVehicleDb: mocks.updateOrgVehicleDb,
	deleteOrgVehicleDb: mocks.deleteOrgVehicleDb,
}))
vi.mock('@/lib/db/audit-events', () => ({ recordEvents: mocks.recordEvents }))

import {
	addVehicle,
	deleteVehicle,
	listVehicles,
	updateVehicle,
	vehicleView,
} from '@/mcp/vehicle-tools'

const caller = { email: 'pat@x.com', client: 'Claude', userId: 'user_1' }
const row = {
	id: 3,
	name: 'Unit 42',
	make: 'Volvo',
	model: 'VNL',
	truck_plate: 'TRK1',
	trailer_plate_a: '',
	trailer_plate_b: null,
	created_at: '2026-11-01T00:00:00.000Z',
	updated_at: '2026-11-01T00:00:00.000Z',
}
const view = {
	vehicle_id: 3,
	name: 'Unit 42',
	make: 'Volvo',
	model: 'VNL',
	truck_plate: 'TRK1',
	trailer_plate_a: null,
	trailer_plate_b: null,
}

beforeEach(() => {
	mocks.listVehiclesOrNone.mockResolvedValue([row])
})

describe('vehicleView', () => {
	it('uses plain names and null for empty fields', () => {
		expect(vehicleView(row)).toEqual(view)
		expect(
			vehicleView({
				...row,
				name: '',
				truck_plate: null,
				trailer_plate_b: 'B',
			}),
		).toMatchObject({ name: null, truck_plate: null, trailer_plate_b: 'B' })
	})
})

describe('listVehicles', () => {
	it("lists the driver's vehicles", async () => {
		const result = await listVehicles(caller)
		expect(mocks.listVehiclesOrNone).toHaveBeenCalledWith('pat@x.com')
		expect(result.data).toEqual({ space: 'personal', vehicles: [view] })
		expect(result.summary).toBe(
			"1 saved vehicle in the driver's fleet: Unit 42 (Volvo VNL) · TRK1. Pass a vehicle_id to start_trip to use one.",
		)
		mocks.listVehiclesOrNone.mockResolvedValue([row, row])
		expect((await listVehicles(caller)).summary).toMatch(
			/^2 saved vehicles/,
		)
	})

	it('says when there are none', async () => {
		mocks.listVehiclesOrNone.mockResolvedValue([])
		const result = await listVehicles(caller)
		expect(result.summary).toContain('no saved vehicles')
		expect(result.data).toEqual({ space: 'personal', vehicles: [] })
	})
})

describe('addVehicle', () => {
	it('saves the vehicle for the caller and records it', async () => {
		mocks.createVehicleDb.mockResolvedValue(row)
		const result = await addVehicle(caller, {
			make: 'Volvo',
			model: 'VNL',
			name: 'Unit 42',
			truck_plate: 'TRK1',
		})
		expect(mocks.createVehicleDb).toHaveBeenCalledWith(caller, {
			name: 'Unit 42',
			make: 'Volvo',
			model: 'VNL',
			truckPlate: 'TRK1',
			trailerPlateA: undefined,
			trailerPlateB: undefined,
		})
		expect(result).toEqual({
			summary:
				"Saved vehicle 3 in the driver's fleet: Unit 42 (Volvo VNL) · TRK1.",
			data: { space: 'personal', vehicle: view },
		})
		expect(mocks.recordEvents).toHaveBeenCalledWith(caller, {
			action: 'vehicle.created',
			source: 'Claude',
			details: { vehicle_id: 3 },
		})
	})

	it('refuses past the most vehicles', async () => {
		mocks.createVehicleDb.mockResolvedValue('too_many')
		const result = await addVehicle(
			{ ...caller, client: null },
			{ make: 'Volvo', model: 'VNL' },
		)
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'too_many', max_vehicles: 50 },
		})
		expect(mocks.recordEvents).not.toHaveBeenCalled()
	})

	it('needs a make and model', async () => {
		await expect(
			addVehicle(caller, { make: 'Volvo' } as never),
		).rejects.toThrow()
	})
})

describe('updateVehicle', () => {
	it('changes only the fields given and records what changed', async () => {
		mocks.updateVehicleDb.mockResolvedValue({
			vehicle: row,
			before: { ...row, name: null },
		})
		const result = await updateVehicle(
			{ ...caller, client: null },
			{ vehicle_id: 3, name: 'Unit 42', trailer_plate_b: '' },
		)
		expect(mocks.updateVehicleDb).toHaveBeenCalledWith(3, 'pat@x.com', {
			name: 'Unit 42',
			make: undefined,
			model: undefined,
			truckPlate: undefined,
			trailerPlateA: undefined,
			trailerPlateB: '',
		})
		expect(result.data).toEqual({ space: 'personal', vehicle: view })
		expect(result.summary).toContain('Updated vehicle 3')
		expect(mocks.recordEvents).toHaveBeenCalledWith(expect.anything(), {
			action: 'vehicle.updated',
			source: 'ai',
			details: { vehicle_id: 3, changed: ['name'] },
		})
	})

	it('needs at least one field', async () => {
		const result = await updateVehicle(caller, { vehicle_id: 3 })
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'no_changes' },
		})
		expect(mocks.updateVehicleDb).not.toHaveBeenCalled()
	})

	it("says when the vehicle isn't the driver's", async () => {
		mocks.updateVehicleDb.mockResolvedValue(undefined)
		const result = await updateVehicle(caller, { vehicle_id: 9, make: 'X' })
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'not_found' },
		})
		expect(result.summary).toContain('Vehicle 9')
	})
})

describe('deleteVehicle', () => {
	it('deletes the vehicle and records it', async () => {
		mocks.deleteVehicleDb.mockResolvedValue(row)
		const result = await deleteVehicle(caller, { vehicle_id: 3 })
		expect(mocks.deleteVehicleDb).toHaveBeenCalledWith(3, 'pat@x.com')
		expect(result.data).toEqual({
			space: 'personal',
			status: 'deleted',
			vehicle: view,
		})
		expect(result.summary).toContain('Deleted vehicle 3')
		expect(mocks.recordEvents).toHaveBeenCalledWith(caller, {
			action: 'vehicle.deleted',
			source: 'Claude',
			details: { vehicle_id: 3 },
		})
	})

	it("says when the vehicle isn't the driver's", async () => {
		mocks.deleteVehicleDb.mockResolvedValue(undefined)
		const result = await deleteVehicle(caller, { vehicle_id: 3 })
		expect(result.isError).toBe(true)
		expect(mocks.recordEvents).not.toHaveBeenCalled()
	})
})

describe('in an organization', () => {
	const membership = (role: string) => ({
		data: [
			{
				role,
				organization: { id: 'org_1', name: 'Acme', slug: 'acme' },
			},
		],
	})
	const org = {
		space: 'organization',
		organization_id: 'org_1',
		organization_name: 'Acme',
	}
	const asAdmin = () =>
		mocks.getOrganizationMembershipList.mockResolvedValue(
			membership('org:admin'),
		)
	const asMember = () =>
		mocks.getOrganizationMembershipList.mockResolvedValue(
			membership('org:member'),
		)

	it("lists the organization's fleet for a member, saying only admins change it", async () => {
		asMember()
		mocks.listOrgVehiclesOrNone.mockResolvedValue([row])
		const result = await listVehicles(caller, { organization_id: 'org_1' })
		expect(mocks.getOrganizationMembershipList).toHaveBeenCalledWith({
			userId: 'user_1',
			limit: 100,
		})
		expect(mocks.listOrgVehiclesOrNone).toHaveBeenCalledWith('org_1')
		expect(mocks.listVehiclesOrNone).not.toHaveBeenCalled()
		expect(result.data).toEqual({
			...org,
			is_admin: false,
			vehicles: [view],
		})
		expect(result.summary).toContain("in Acme's fleet")
		expect(result.summary).toContain("Only Acme's admins can change them.")
	})

	it('says when the organization has none', async () => {
		asMember()
		mocks.listOrgVehiclesOrNone.mockResolvedValue([])
		const member = await listVehicles(caller, { organization_id: 'org_1' })
		expect(member.summary).toBe(
			"Acme has no saved vehicles. Only Acme's admins can change them.",
		)
		asAdmin()
		const admin = await listVehicles(caller, { organization_id: 'org_1' })
		expect(admin.summary).toBe(
			'Acme has no saved vehicles. Add one with add_vehicle when they ask.',
		)
		expect(admin.summary).not.toContain('Only')
	})

	it('adds, changes and deletes as an admin, clearing its fleet', async () => {
		asAdmin()
		mocks.createOrgVehicleDb.mockResolvedValue(row)
		const added = await addVehicle(caller, {
			organization_id: 'org_1',
			make: 'Volvo',
			model: 'VNL',
		})
		expect(mocks.createOrgVehicleDb).toHaveBeenCalledWith(
			'org_1',
			caller,
			expect.objectContaining({ make: 'Volvo', model: 'VNL' }),
		)
		expect(mocks.createVehicleDb).not.toHaveBeenCalled()
		expect(added).toMatchObject({
			orgId: 'org_1',
			data: { ...org, is_admin: true, vehicle: view },
		})
		expect(added.summary).toContain("in Acme's fleet")
		expect(mocks.recordEvents).toHaveBeenLastCalledWith(caller, {
			action: 'vehicle.created',
			source: 'Claude',
			details: { vehicle_id: 3, org_id: 'org_1' },
		})

		mocks.updateOrgVehicleDb.mockResolvedValue({
			vehicle: row,
			before: { ...row, model: 'VNR' },
		})
		const updated = await updateVehicle(caller, {
			organization_id: 'org_1',
			vehicle_id: 3,
			model: 'VNL',
		})
		expect(mocks.updateOrgVehicleDb).toHaveBeenCalledWith(
			3,
			'org_1',
			expect.objectContaining({ model: 'VNL' }),
		)
		expect(updated.orgId).toBe('org_1')
		expect(mocks.recordEvents).toHaveBeenLastCalledWith(caller, {
			action: 'vehicle.updated',
			source: 'Claude',
			details: { vehicle_id: 3, changed: ['model'], org_id: 'org_1' },
		})

		mocks.deleteOrgVehicleDb.mockResolvedValue(row)
		const deleted = await deleteVehicle(caller, {
			organization_id: 'org_1',
			vehicle_id: 3,
		})
		expect(mocks.deleteOrgVehicleDb).toHaveBeenCalledWith(3, 'org_1')
		expect(deleted.summary).toContain("from Acme's fleet")
		expect(deleted.orgId).toBe('org_1')
	})

	it("refuses changes from a member who isn't an admin", async () => {
		asMember()
		for (const result of [
			await addVehicle(caller, {
				organization_id: 'org_1',
				make: 'Volvo',
				model: 'VNL',
			}),
			await updateVehicle(caller, {
				organization_id: 'org_1',
				vehicle_id: 3,
				name: 'X',
			}),
			await deleteVehicle(caller, {
				organization_id: 'org_1',
				vehicle_id: 3,
			}),
		]) {
			expect(result).toMatchObject({
				isError: true,
				data: { status: 'not_org_admin' },
			})
			expect(result.summary).toBe(
				'Only an admin of Acme can change its vehicles; the driver is a member there. Nothing was changed.',
			)
		}
		expect(mocks.createOrgVehicleDb).not.toHaveBeenCalled()
		expect(mocks.updateOrgVehicleDb).not.toHaveBeenCalled()
		expect(mocks.deleteOrgVehicleDb).not.toHaveBeenCalled()
	})

	it('says when the organization is full or the vehicle is not in it', async () => {
		asAdmin()
		mocks.createOrgVehicleDb.mockResolvedValue('too_many')
		const full = await addVehicle(caller, {
			organization_id: 'org_1',
			make: 'Volvo',
			model: 'VNL',
		})
		expect(full.summary).toMatch(/^Acme already has 50 saved vehicles/)
		mocks.deleteOrgVehicleDb.mockResolvedValue(undefined)
		const missing = await deleteVehicle(caller, {
			organization_id: 'org_1',
			vehicle_id: 9,
		})
		expect(missing.summary).toBe(
			"Vehicle 9 wasn't found in Acme's fleet. Use list_vehicles with the same organization_id to find the vehicle's id.",
		)
	})

	it("refuses an organization the driver isn't in", async () => {
		mocks.getOrganizationMembershipList.mockResolvedValue({ data: [] })
		const result = await listVehicles(caller, { organization_id: 'org_9' })
		expect(result).toMatchObject({
			isError: true,
			data: { status: 'not_a_member' },
		})
		expect(mocks.listOrgVehiclesOrNone).not.toHaveBeenCalled()
	})
})
