import { z } from 'zod'
import { recordEvents } from '@/lib/db/audit-events'
import {
	createVehicleDb,
	deleteVehicleDb,
	listVehiclesOrNone,
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
import type { McpCaller, ToolResult } from './tools'

/*
 * The driver's saved vehicles, for AI apps: list, add, change and delete
 * them, and start a trip from one (start_trip's vehicle_id). Every function
 * takes the verified caller first; the driver is never taken from arguments.
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

export const listVehiclesInputSchema = z.object({})

export async function listVehicles(caller: McpCaller): Promise<ToolResult> {
	const vehicles = await listVehiclesOrNone(caller.email)
	return {
		summary: vehicles.length
			? `${vehicles.length} saved vehicle${vehicles.length === 1 ? '' : 's'}: ${vehicles.map(vehicleLabel).join('; ')}. Pass a vehicle_id to start_trip to use one.`
			: 'The driver has no saved vehicles. Add one with add_vehicle when they ask.',
		data: { vehicles: vehicles.map(vehicleView) },
	}
}

export const addVehicleInputSchema = z.object({
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
	const saved = await createVehicleDb(caller, {
		name: input.name,
		make: input.make,
		model: input.model,
		truckPlate: input.truck_plate,
		trailerPlateA: input.trailer_plate_a,
		trailerPlateB: input.trailer_plate_b,
	})
	if (saved === 'too_many') {
		return {
			summary: `The driver already has ${formatLimit(VEHICLES_MAX)} saved vehicles, the most allowed, so nothing was saved. Delete one first (delete_vehicle).`,
			data: { status: 'too_many', max_vehicles: VEHICLES_MAX },
			isError: true,
		}
	}
	await recordEvents(caller, {
		action: 'vehicle.created',
		source: source(caller),
		details: { vehicle_id: saved.id },
	})
	return {
		summary: `Saved vehicle ${saved.id}: ${vehicleLabel(saved)}.`,
		data: { vehicle: vehicleView(saved) },
	}
}

export const updateVehicleInputSchema = z.object({
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

const notFound = (id: number): ToolResult => ({
	summary: `Vehicle ${id} wasn't found. Use list_vehicles to find the vehicle's id.`,
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
	const updated = await updateVehicleDb(
		input.vehicle_id,
		caller.email,
		changes,
	)
	if (!updated) return notFound(input.vehicle_id)
	await recordEvents(caller, {
		action: 'vehicle.updated',
		source: source(caller),
		details: {
			vehicle_id: input.vehicle_id,
			changed: vehicleChangedFields(updated),
		},
	})
	return {
		summary: `Updated vehicle ${input.vehicle_id}: ${vehicleLabel(updated.vehicle)}. Trips already saved keep the details they were started with.`,
		data: { vehicle: vehicleView(updated.vehicle) },
	}
}

export const deleteVehicleInputSchema = z.object({ vehicle_id: vehicleId })

export async function deleteVehicle(
	caller: McpCaller,
	args: z.input<typeof deleteVehicleInputSchema>,
): Promise<ToolResult> {
	const input = deleteVehicleInputSchema.parse(args)
	const deleted = await deleteVehicleDb(input.vehicle_id, caller.email)
	if (!deleted) return notFound(input.vehicle_id)
	await recordEvents(caller, {
		action: 'vehicle.deleted',
		source: source(caller),
		details: { vehicle_id: input.vehicle_id },
	})
	return {
		summary: `Deleted vehicle ${input.vehicle_id} (${vehicleLabel(deleted)}). Trips already saved in it are unchanged.`,
		data: { status: 'deleted', vehicle: vehicleView(deleted) },
	}
}
