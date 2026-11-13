import { z } from 'zod'
import {
	createRepairDb,
	deleteRepairDb,
	listTripRepairsDb,
	type Repair,
} from '@/lib/db/repairs'
import { getTripDb } from '@/lib/db/trips'
import { parseDefects } from '@/lib/utils-defects'
import { compressInvoice, compressSignature, FileError } from './compress'

/*
 * Marking a trip's defect repaired, the same way from the web app and the
 * MCP server. The trip keeps its defects; a repair is a separate record of
 * who fixed it, when, the invoice number, their signature and the invoice.
 */

const optionalText = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.optional()
		.transform((v) => v || undefined)

/** Today as YYYY-MM-DD. */
export const today = () => new Date().toISOString().slice(0, 10)

export const repairDetailsSchema = z
	.object({
		tripId: z.number().int().positive(),
		defect: z.string().trim().min(1, 'Choose the defect').max(60),
		repairedOn: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-11-13')
			.refine((d) => !Number.isNaN(Date.parse(d)), 'Not a real date')
			.refine(
				// A day of slack for time zones ahead of the server's.
				(d) => Date.parse(d) <= Date.now() + 24 * 60 * 60 * 1000,
				'The repair date is in the future',
			)
			.optional(),
		/** The mechanic, the shop, or both: at least one of them. */
		mechanicName: optionalText(120),
		shopName: optionalText(120),
		invoiceNumber: optionalText(60),
		notes: optionalText(2000),
	})
	.refine((r) => r.mechanicName || r.shopName, {
		message: 'Who repaired it? Add the mechanic or the shop',
		path: ['mechanicName'],
	})

export type RepairDetails = z.input<typeof repairDetailsSchema>

export type RepairFiles = {
	invoice?: { bytes: Uint8Array; name?: string } | null
	signature?: Uint8Array | null
}

export type RepairResult =
	| { ok: true; repair: Repair }
	| {
			ok: false
			status:
				| 'invalid'
				| 'not_found'
				| 'not_a_defect'
				| 'already_repaired'
				| 'invalid_file'
			message: string
			defects?: string[]
	  }

/** Marks one of the driver's trip defects repaired. */
export async function recordRepair(
	driverEmail: string,
	details: RepairDetails,
	files: RepairFiles,
	source: string,
): Promise<RepairResult> {
	const parsed = repairDetailsSchema.safeParse(details)
	if (!parsed.success) {
		return {
			ok: false,
			status: 'invalid',
			message: parsed.error.issues.map((i) => i.message).join(', '),
		}
	}
	const input = parsed.data

	const trip = await getTripDb(input.tripId, driverEmail)
	if (!trip) {
		return {
			ok: false,
			status: 'not_found',
			message: `Trip ${input.tripId} wasn't found.`,
		}
	}
	const defects = parseDefects(trip.defects)
	const defect = defects.find(
		(d) => d.toLowerCase() === input.defect.toLowerCase(),
	)
	if (!defect) {
		return {
			ok: false,
			status: 'not_a_defect',
			message: defects.length
				? `"${input.defect}" isn't a defect on trip ${input.tripId}. Its defects are: ${defects.join(', ')}.`
				: `Trip ${input.tripId} has no defects to repair.`,
			defects,
		}
	}
	const existing = await listTripRepairsDb(input.tripId, driverEmail)
	if (existing.some((r) => r.defect.toLowerCase() === defect.toLowerCase())) {
		return alreadyRepaired(defect, input.tripId)
	}

	let invoice: Awaited<ReturnType<typeof compressInvoice>> | null = null
	let signature: Awaited<ReturnType<typeof compressSignature>> | null = null
	try {
		if (files.invoice) {
			invoice = await compressInvoice(
				files.invoice.bytes,
				files.invoice.name,
			)
		}
		if (files.signature) {
			signature = await compressSignature(files.signature)
		}
	} catch (error) {
		if (error instanceof FileError) {
			return { ok: false, status: 'invalid_file', message: error.message }
		}
		throw error
	}

	const repair = await createRepairDb(driverEmail, {
		tripId: input.tripId,
		defect,
		repairedOn: input.repairedOn ?? today(),
		mechanicName: input.mechanicName,
		shopName: input.shopName,
		invoiceNumber: input.invoiceNumber,
		notes: input.notes,
		signature,
		invoice,
		source,
	})
	// Nothing saved: another request marked it repaired first.
	if (!repair) return alreadyRepaired(defect, input.tripId)
	return { ok: true, repair }
}

const alreadyRepaired = (defect: string, tripId: number) =>
	({
		ok: false,
		status: 'already_repaired',
		message: `${defect} on trip ${tripId} is already marked repaired. Undo that repair first to record it again.`,
	}) as const

/** Undoes a repair, so the defect is open again. */
export async function undoRepair(driverEmail: string, repairId: number) {
	if (!Number.isInteger(repairId) || repairId < 1) return undefined
	return deleteRepairDb(repairId, driverEmail)
}
