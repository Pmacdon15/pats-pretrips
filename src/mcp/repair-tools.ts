import { z } from 'zod'
import {
	listDriverRepairsDb,
	listTripRepairsDb,
	listTripsWithDefectsDb,
	type Repair,
} from '@/lib/db/repairs'
import { normalizePlate } from '@/lib/db/trips'
import { appUrl } from '@/lib/email/config'
import { FileError, fromBase64 } from '@/lib/repairs/compress'
import { repairFilePath } from '@/lib/repairs/paths'
import { recordRepair, undoRepair } from '@/lib/repairs/repairs'
import { buildDefectRecord, defectStatuses } from '@/lib/repairs/status'
import type { Trip } from '@/lib/types/types'
import type { McpCaller, ToolResult } from './tools'

/*
 * Defect repairs over MCP: the record of open and repaired defects, marking
 * one repaired (with the invoice and signature the driver sends) and undoing
 * a repair. The same rules as the web app (src/lib/repairs/repairs.ts).
 */

/** A repair as the assistant sees it, with links to its files in the app. */
export function repairView(repair: Repair) {
	return {
		repair_id: repair.id,
		trip_id: repair.trip_id,
		defect: repair.defect,
		repaired_on: repair.repaired_on,
		mechanic_name: repair.mechanic_name,
		shop_name: repair.shop_name,
		invoice_number: repair.invoice_number,
		notes: repair.notes,
		signed: repair.has_signature,
		signature_url: repair.has_signature
			? appUrl() + repairFilePath(repair.id, 'signature')
			: null,
		invoice_url: repair.has_invoice
			? appUrl() + repairFilePath(repair.id, 'invoice')
			: null,
		invoice_size_bytes: repair.invoice_size,
		recorded_by: repair.source,
	}
}

/** Each of a trip's defects, open or with its repair. */
export async function tripDefectStatus(caller: McpCaller, trip: Trip) {
	if (!trip.tripid) return []
	const repairs = await listTripRepairsDb(trip.tripid, caller.email)
	return defectStatuses(trip.defects, repairs).map(({ defect, repair }) => ({
		defect,
		status: repair ? ('repaired' as const) : ('open' as const),
		repair: repair ? repairView(repair) : null,
	}))
}

export const listDefectsInputSchema = z.object({
	status: z
		.enum(['open', 'repaired', 'all'])
		.default('all')
		.describe(
			'"open": reported and not repaired yet. "repaired": fixed, with who fixed it and the invoice. "all": both.',
		),
	truck_plate: z
		.string()
		.trim()
		.min(1)
		.max(20)
		.optional()
		.describe('Only defects found on trips in this truck'),
})

const LIST_LIMIT = 100

export async function listDefects(
	caller: McpCaller,
	args: z.input<typeof listDefectsInputSchema>,
): Promise<ToolResult> {
	const input = listDefectsInputSchema.parse(args)
	const [trips, repairs] = await Promise.all([
		listTripsWithDefectsDb(caller.email),
		listDriverRepairsDb(caller.email),
	])
	const record = buildDefectRecord(trips, repairs)
	const plate = input.truck_plate ? normalizePlate(input.truck_plate) : null
	const inTruck = (p: string | null) =>
		!plate || normalizePlate(p ?? '') === plate

	const open = record.open.filter((d) => inTruck(d.truck_plate))
	const repaired = record.repaired.filter((r) => inTruck(r.truck_plate))
	const showOpen = input.status !== 'repaired'
	const showRepaired = input.status !== 'open'

	const parts = [
		showOpen
			? `${open.length} open defect${open.length === 1 ? '' : 's'}`
			: '',
		showRepaired
			? `${repaired.length} repaired defect${repaired.length === 1 ? '' : 's'}`
			: '',
	].filter(Boolean)
	return {
		summary: `${parts.join(' and ')}${input.truck_plate ? ` in ${input.truck_plate}` : ''}.${showOpen && open.length ? ' Use mark_defect_repaired once one is fixed.' : ''}`,
		data: {
			...(showOpen
				? {
						open: open.slice(0, LIST_LIMIT).map((d) => ({
							trip_id: d.trip_id,
							trip_date: d.trip_date,
							truck_plate: d.truck_plate,
							make: d.make,
							model: d.model,
							defect: d.defect,
						})),
						open_count: open.length,
					}
				: {}),
			...(showRepaired
				? {
						repaired: repaired.slice(0, LIST_LIMIT).map((r) => ({
							...repairView(r),
							trip_date: r.trip_date,
							truck_plate: r.truck_plate,
						})),
						repaired_count: repaired.length,
					}
				: {}),
		},
	}
}

const base64File = z.string().min(8).max(12_000_000)

export const markDefectRepairedInputSchema = z.object({
	trip_id: z
		.number()
		.int()
		.positive()
		.describe('The trip the defect was reported on (from list_defects)'),
	defect: z
		.string()
		.trim()
		.min(1)
		.max(60)
		.describe('The defect as listed on the trip, e.g. "Tires"'),
	mechanic_name: z
		.string()
		.trim()
		.min(2)
		.max(120)
		.describe('Who repaired it, as on the invoice or as the driver says'),
	shop_name: z.string().trim().max(120).optional(),
	invoice_number: z
		.string()
		.trim()
		.max(60)
		.optional()
		.describe('The invoice or work order number, read from the invoice'),
	repaired_on: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional()
		.describe('YYYY-MM-DD, e.g. the invoice date. Today when left out.'),
	notes: z.string().trim().max(2000).optional(),
	invoice_base64: base64File
		.optional()
		.describe(
			'The invoice file (PDF, JPEG, PNG, WebP or HEIC) as base64. It is compressed before it is saved.',
		),
	invoice_filename: z.string().trim().max(200).optional(),
	signature_base64: base64File
		.optional()
		.describe(
			"An image of the mechanic's signature (PNG or JPEG) as base64, e.g. cropped from the signed invoice",
		),
})

export async function markDefectRepaired(
	caller: McpCaller,
	args: z.infer<typeof markDefectRepairedInputSchema>,
): Promise<ToolResult> {
	const input = markDefectRepairedInputSchema.parse(args)
	let files: Parameters<typeof recordRepair>[2]
	try {
		files = {
			invoice: input.invoice_base64
				? {
						bytes: fromBase64(input.invoice_base64),
						name: input.invoice_filename,
					}
				: null,
			signature: input.signature_base64
				? fromBase64(input.signature_base64)
				: null,
		}
	} catch (error) {
		if (error instanceof FileError) {
			return {
				summary: error.message,
				data: { status: 'invalid_file' },
				isError: true,
			}
		}
		throw error
	}

	const result = await recordRepair(
		caller.email,
		{
			tripId: input.trip_id,
			defect: input.defect,
			mechanicName: input.mechanic_name,
			shopName: input.shop_name,
			invoiceNumber: input.invoice_number,
			repairedOn: input.repaired_on,
			notes: input.notes,
		},
		files,
		caller.client ? `AI: ${caller.client}`.slice(0, 60) : 'AI assistant',
	)
	if (!result.ok) {
		return {
			summary: result.message,
			data: {
				status: result.status,
				...(result.defects ? { defects: result.defects } : {}),
			},
			isError: true,
		}
	}
	const r = result.repair
	const saved = [
		r.invoice_number ? `invoice ${r.invoice_number}` : '',
		r.has_invoice && r.invoice_size
			? `invoice file saved (${Math.round(r.invoice_size / 1024)} KB${r.invoice_original_size && r.invoice_original_size > r.invoice_size ? `, compressed from ${Math.round(r.invoice_original_size / 1024)} KB` : ''})`
			: '',
		r.has_signature ? 'signed' : 'no signature',
	].filter(Boolean)
	return {
		summary: `Marked ${r.defect} on trip ${r.trip_id} repaired on ${r.repaired_on} by ${r.mechanic_name}: ${saved.join(', ')}.`,
		data: { repair: repairView(r) },
	}
}

export const undoDefectRepairInputSchema = z.object({
	repair_id: z
		.number()
		.int()
		.positive()
		.describe('From list_defects or mark_defect_repaired'),
})

export async function undoDefectRepair(
	caller: McpCaller,
	args: z.infer<typeof undoDefectRepairInputSchema>,
): Promise<ToolResult> {
	const input = undoDefectRepairInputSchema.parse(args)
	const removed = await undoRepair(caller.email, input.repair_id)
	if (!removed) {
		return {
			summary: `Repair ${input.repair_id} wasn't found. Use list_defects with status "repaired" to find it.`,
			data: { status: 'not_found' },
			isError: true,
		}
	}
	return {
		summary: `Undid the repair of ${removed.defect} on trip ${removed.trip_id}; it shows as open again.`,
		data: { status: 'undone', ...removed },
	}
}
