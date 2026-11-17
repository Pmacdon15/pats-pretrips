import { z } from 'zod'
import { recordEvents } from '@/lib/db/audit-events'
import {
	createOrgVehicleDb,
	createVehicleDb,
	deleteOrgVehicleDb,
	deleteVehicleDb,
	listOrgVehiclesOrNone,
	listVehiclesOrNone,
	updateOrgVehicleDb,
	updateVehicleDb,
	type Vehicle,
	vehicleChangedFields,
	vehicleLabel,
} from '@/lib/db/vehicles'
import {
	formatLimit,
	MAKE_MODEL_MAX,
	PLATE_MAX,
	VEHICLE_NAME_MAX,
	VEHICLES_MAX,
} from '@/lib/trip-limits'
import {
	inOrg,
	isToolResult,
	type McpSpace,
	organizationId,
	resolveSpace,
	spaceOwner,
	spaceView,
} from './spaces'
import type { McpCaller, ToolResult } from './tools'

/*
 * Saved vehicles, for AI apps: list, add, change and delete them, and start
 * a trip from one (start_trip's vehicle_id). Each tool works in the driver's
 * personal space, or with organization_id in one of their organizations
 * (src/mcp/spaces.ts): any member lists its fleet, only its admins change
 * it. Every function takes the verified caller first; the driver is never
 * taken from arguments.
 */

/** Who made the change, as the audit trail records AI apps. */
const source = (caller: McpCaller) => (caller.client || 'ai').slice(0, 60)

const text = (max: number) => z.string().trim().min(1).max(max)
/** An optional field: an empty string clears it on update. */
const clearable = (max: number) => z.string().trim().max(max)
const vehicleId = z
	.number()
	.int()
	.positive()
	.describe('The vehicle’s id, from list_vehicles')

/** A vehicle as the assistant sees it. */
export function vehicleView(v: Vehicle) {
	return {
		vehicle_id: v.id,
		name: v.name || null,
		make: v.make,
		model: v.model,
		truck_plate: v.truck_plate || null,
		trailer_plate_a: v.trailer_plate_a || null,
		trailer_plate_b: v.trailer_plate_b || null,
	}
}

/** The space's vehicles: the driver's own, or the organization's. */
export const spaceVehicles = (caller: McpCaller, space: McpSpace) =>
	space.kind === 'org'
		? listOrgVehiclesOrNone(space.orgId)
		: listVehiclesOrNone(caller.email)

/** The org to clear caches for after a write in a space. */
const touched = (space: McpSpace) =>
	space.kind === 'org' ? { orgId: space.orgId } : {}

export const listVehiclesInputSchema = z.object({
	organization_id: organizationId,
})

export async function listVehicles(
	caller: McpCaller,
	args: z.input<typeof listVehiclesInputSchema> = {},
): Promise<ToolResult> {
	const input = listVehiclesInputSchema.parse(args)
	const space = await resolveSpace(caller, input.organization_id)
	if (isToolResult(space)) return space
	const vehicles = await spaceVehicles(caller, space)
	const owner = spaceOwner(space)
	const canChange =
		space.kind === 'org' && !space.isAdmin
			? ` Only ${space.name}'s admins can change them.`
			: ''
	return {
		summary: vehicles.length
			? `${vehicles.length} saved vehicle${vehicles.length === 1 ? '' : 's'} in ${owner} fleet: ${vehicles.map(vehicleLabel).join('; ')}. Pass a vehicle_id to start_trip to use one.${canChange}`
			: `${space.kind === 'org' ? `${space.name} has` : 'The driver has'} no saved vehicles.${space.kind === 'org' && !space.isAdmin ? canChange : ' Add one with add_vehicle when they ask.'}`,
		data: {
			...spaceView(space),
			vehicles: vehicles.map(vehicleView),
		},
	}
}

export const addVehicleInputSchema = z.object({
	organization_id: organizationId,
	name: text(VEHICLE_NAME_MAX)
		.optional()
		.describe('What the driver calls it, e.g. "Unit 42"'),
	make: text(MAKE_MODEL_MAX).describe('e.g. "Freightliner"'),
	model: text(MAKE_MODEL_MAX).describe('e.g. "Cascadia"'),
	truck_plate: text(PLATE_MAX).optional(),
	trailer_plate_a: text(PLATE_MAX).optional(),
	trailer_plate_b: text(PLATE_MAX).optional(),
})

export async function addVehicle(
	caller: McpCaller,
	args: z.input<typeof addVehicleInputSchema>,
): Promise<ToolResult> {
	const input = addVehicleInputSchema.parse(args)
	const space = await resolveSpace(caller, input.organization_id, {
		write: true,
	})
	if (isToolResult(space)) return space
	const fields = {
		name: input.name,
		make: input.make,
		model: input.model,
		truckPlate: input.truck_plate,
		trailerPlateA: input.trailer_plate_a,
		trailerPlateB: input.trailer_plate_b,
	}
	const saved =
		space.kind === 'org'
			? await createOrgVehicleDb(space.orgId, caller, fields)
			: await createVehicleDb(caller, fields)
	if (saved === 'too_many') {
		return {
			summary: `${space.kind === 'org' ? space.name : 'The driver'} already has ${formatLimit(VEHICLES_MAX)} saved vehicles, the most allowed, so nothing was saved. Delete one first (delete_vehicle).`,
			data: { status: 'too_many', max_vehicles: VEHICLES_MAX },
			isError: true,
		}
	}
	await recordEvents(caller, {
		action: 'vehicle.created',
		source: source(caller),
		details: { vehicle_id: saved.id, ...inOrg(space) },
	})
	return {
		summary: `Saved vehicle ${saved.id} in ${spaceOwner(space)} fleet: ${vehicleLabel(saved)}.`,
		data: { ...spaceView(space), vehicle: vehicleView(saved) },
		...touched(space),
	}
}

export const updateVehicleInputSchema = z.object({
	organization_id: organizationId,
	vehicle_id: vehicleId,
	name: clearable(VEHICLE_NAME_MAX)
		.optional()
		.describe('A new name; "" removes it'),
	make: text(MAKE_MODEL_MAX).optional(),
	model: text(MAKE_MODEL_MAX).optional(),
	truck_plate: clearable(PLATE_MAX).optional().describe('"" removes it'),
	trailer_plate_a: clearable(PLATE_MAX).optional().describe('"" removes it'),
	trailer_plate_b: clearable(PLATE_MAX).optional().describe('"" removes it'),
})

const notFound = (id: number, space: McpSpace): ToolResult => ({
	summary: `Vehicle ${id} wasn't found in ${spaceOwner(space)} fleet. Use list_vehicles${space.kind === 'org' ? ' with the same organization_id' : ''} to find the vehicle's id.`,
	data: { status: 'not_found' },
	isError: true,
})

export async function updateVehicle(
	caller: McpCaller,
	args: z.input<typeof updateVehicleInputSchema>,
): Promise<ToolResult> {
	const input = updateVehicleInputSchema.parse(args)
	const changes = {
		name: input.name,
		make: input.make,
		model: input.model,
		truckPlate: input.truck_plate,
		trailerPlateA: input.trailer_plate_a,
		trailerPlateB: input.trailer_plate_b,
	}
	if (Object.values(changes).every((v) => v === undefined)) {
		return {
			summary: 'Nothing to change: pass at least one field.',
			data: { status: 'no_changes' },
			isError: true,
		}
	}
	const space = await resolveSpace(caller, input.organization_id, {
		write: true,
	})
	if (isToolResult(space)) return space
	const updated =
		space.kind === 'org'
			? await updateOrgVehicleDb(input.vehicle_id, space.orgId, changes)
			: await updateVehicleDb(input.vehicle_id, caller.email, changes)
	if (!updated) return notFound(input.vehicle_id, space)
	await recordEvents(caller, {
		action: 'vehicle.updated',
		source: source(caller),
		details: {
			vehicle_id: input.vehicle_id,
			changed: vehicleChangedFields(updated),
			...inOrg(space),
		},
	})
	return {
		summary: `Updated vehicle ${input.vehicle_id}: ${vehicleLabel(updated.vehicle)}. Trips already saved keep the details they were started with.`,
		data: { ...spaceView(space), vehicle: vehicleView(updated.vehicle) },
		...touched(space),
	}
}

export const deleteVehicleInputSchema = z.object({
	organization_id: organizationId,
	vehicle_id: vehicleId,
})

export async function deleteVehicle(
	caller: McpCaller,
	args: z.input<typeof deleteVehicleInputSchema>,
): Promise<ToolResult> {
	const input = deleteVehicleInputSchema.parse(args)
	const space = await resolveSpace(caller, input.organization_id, {
		write: true,
	})
	if (isToolResult(space)) return space
	const deleted =
		space.kind === 'org'
			? await deleteOrgVehicleDb(input.vehicle_id, space.orgId)
			: await deleteVehicleDb(input.vehicle_id, caller.email)
	if (!deleted) return notFound(input.vehicle_id, space)
	await recordEvents(caller, {
		action: 'vehicle.deleted',
		source: source(caller),
		details: { vehicle_id: input.vehicle_id, ...inOrg(space) },
	})
	return {
		summary: `Deleted vehicle ${input.vehicle_id} (${vehicleLabel(deleted)}) from ${spaceOwner(space)} fleet. Trips already saved in it are unchanged.`,
		data: {
			...spaceView(space),
			status: 'deleted',
			vehicle: vehicleView(deleted),
		},
		...touched(space),
	}
}
